"""Chunked streaming download engine with .part file staging and progress telemetry."""

import os
import shutil
import threading
import time
from collections.abc import Callable
from pathlib import Path

import httpx

from ..core.config import default_config
from ..core.logging import get_logger
from ..exceptions.base import (
    DiskSpaceError,
    DownloadCancelledError,
    DownloadError,
    DownloadPausedError,
    MediaUnavailableError,
    NetworkTimeoutError,
    PrivateMediaError,
    RateLimitError,
)
from ..models.queue import ProgressUpdate, TaskStatus
from ..utils.paths import validate_destination_path
from ..utils.security import validate_url_security
from .throttler import BandwidthThrottler

logger = get_logger("downloader.stream")

CHUNK_SIZE = 64 * 1024  # 64 KB streaming buffer
PROGRESS_EMIT_INTERVAL = 0.15  # Emit progress update every 150ms


def download_stream(
    url: str,
    destination_path: Path,
    task_id: str,
    progress_callback: Callable[[ProgressUpdate], None] | None = None,
    cancel_event: threading.Event | None = None,
    pause_event: threading.Event | None = None,
    headers: dict[str, str] | None = None,
    timeout_seconds: float | None = None,
    allowed_root: Path | None = None,
    throttler: BandwidthThrottler | None = None,
) -> Path:
    """Download a remote media stream to disk with .part staging, atomic rename, and telemetry.

    Supports chunked HTTP range resumption if an existing .part file is present.
    """
    # 1. Security validations
    validate_url_security(url)
    validate_destination_path(destination_path, allowed_root or default_config.download_dir)

    # 2. Check if destination already exists and is non-empty
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    if destination_path.exists() and destination_path.stat().st_size > 0:
        file_size = destination_path.stat().st_size
        logger.info(
            f"Destination file already exists ({file_size} bytes): "
            f"{destination_path.name}"
        )
        if progress_callback:
            progress_callback(
                ProgressUpdate(
                    task_id=task_id,
                    status=TaskStatus.DOWNLOADING,
                    bytes_downloaded=file_size,
                    total_bytes=file_size,
                    progress_percent=100.0,
                    speed_bytes_sec=0.0,
                    detail_message="Using existing completed file",
                )
            )
        return destination_path

    # 3. Prepare staging file
    temp_path = destination_path.with_suffix(destination_path.suffix + ".part")

    existing_bytes = 0
    if temp_path.exists():
        try:
            existing_bytes = temp_path.stat().st_size
        except OSError:
            existing_bytes = 0

    req_headers = {"User-Agent": "XakuMedia/0.1.0"}
    if headers:
        req_headers.update(headers)

    if existing_bytes > 0:
        req_headers["Range"] = f"bytes={existing_bytes}-"

    timeout = httpx.Timeout(timeout_seconds or default_config.request_timeout_seconds)

    try:
        with httpx.Client(timeout=timeout, follow_redirects=True, headers=req_headers) as client:
            with client.stream("GET", url) as response:
                if response.status_code in (401, 403):
                    raise PrivateMediaError(
                        f"Access denied ({response.status_code}): {response.reason_phrase}"
                    )
                if response.status_code in (404, 410):
                    raise MediaUnavailableError(
                        f"Media not found ({response.status_code}): {response.reason_phrase}"
                    )
                if response.status_code == 429:
                    raise RateLimitError(
                        f"Rate limited by server ({response.status_code}): {response.reason_phrase}"
                    )
                if response.status_code == 416:
                    # Range not satisfiable (file might already be complete)
                    if existing_bytes > 0:
                        shutil.move(str(temp_path), str(destination_path))
                        return destination_path
                    raise DownloadError(f"HTTP error 416: {response.reason_phrase}")
                if response.is_error:
                    raise DownloadError(
                        f"HTTP error {response.status_code}: {response.reason_phrase}"
                    )

                is_resuming = response.status_code == 206
                write_mode = "ab" if is_resuming else "wb"
                bytes_downloaded = existing_bytes if is_resuming else 0

                content_length = response.headers.get("content-length")
                content_range = response.headers.get("content-range")
                total_bytes = None
                if content_range and "/" in content_range:
                    range_total = content_range.split("/")[-1]
                    if range_total.isdigit():
                        total_bytes = int(range_total)
                elif content_length and content_length.isdigit():
                    total_bytes = bytes_downloaded + int(content_length)

                start_time = time.monotonic()
                last_emit_time = start_time
                last_emit_bytes = bytes_downloaded

                with open(temp_path, write_mode) as f:
                    for chunk in response.iter_bytes(chunk_size=CHUNK_SIZE):
                        if cancel_event and cancel_event.is_set():
                            raise DownloadCancelledError("Download cancelled by user")
                        if pause_event and pause_event.is_set():
                            raise DownloadPausedError("Download paused by user")

                        if not chunk:
                            continue

                        if throttler:
                            throttler.consume(
                                len(chunk),
                                cancel_event=cancel_event,
                                pause_event=pause_event,
                            )
                            if cancel_event and cancel_event.is_set():
                                raise DownloadCancelledError("Download cancelled by user")
                            if pause_event and pause_event.is_set():
                                raise DownloadPausedError("Download paused by user")

                        f.write(chunk)
                        bytes_downloaded += len(chunk)

                        now = time.monotonic()
                        if progress_callback and (now - last_emit_time >= PROGRESS_EMIT_INTERVAL):
                            elapsed_since_last = now - last_emit_time
                            bytes_since_last = bytes_downloaded - last_emit_bytes
                            speed = (
                                bytes_since_last / elapsed_since_last
                                if elapsed_since_last > 0
                                else 0.0
                            )

                            percent = (
                                round((bytes_downloaded / total_bytes) * 100.0, 1)
                                if total_bytes and total_bytes > 0
                                else 0.0
                            )
                            eta = (
                                round((total_bytes - bytes_downloaded) / speed, 1)
                                if total_bytes and speed > 0 and bytes_downloaded < total_bytes
                                else None
                            )

                            progress_callback(
                                ProgressUpdate(
                                    task_id=task_id,
                                    status=TaskStatus.DOWNLOADING,
                                    bytes_downloaded=bytes_downloaded,
                                    total_bytes=total_bytes,
                                    progress_percent=percent,
                                    speed_bytes_sec=round(speed, 1),
                                    eta_seconds=eta,
                                )
                            )
                            last_emit_time = now
                            last_emit_bytes = bytes_downloaded

                    # Flush and sync disk buffers
                    f.flush()
                    os.fsync(f.fileno())

        # Atomic move to final target destination
        shutil.move(str(temp_path), str(destination_path))
        logger.info(
            f"Successfully downloaded stream to {destination_path} ({bytes_downloaded} bytes)"
        )

        if progress_callback:
            progress_callback(
                ProgressUpdate(
                    task_id=task_id,
                    status=TaskStatus.COMPLETED,
                    bytes_downloaded=bytes_downloaded,
                    total_bytes=total_bytes or bytes_downloaded,
                    progress_percent=100.0,
                    speed_bytes_sec=0.0,
                    eta_seconds=0.0,
                )
            )

        return destination_path

    except DownloadPausedError:
        # Preserve temporary .part file on disk so download can be resumed seamlessly
        logger.info(f"Stream download paused for task {task_id}; preserved partial file.")
        raise
    except httpx.TimeoutException as exc:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass
        raise NetworkTimeoutError(f"Connection timed out: {exc}") from exc
    except OSError as exc:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass
        raise DiskSpaceError(f"Filesystem write failed: {exc}") from exc
    except Exception:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass
        raise
