"""Background download queue and worker thread orchestration manager."""

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from ..core.config import default_config
from ..core.logging import get_logger
from ..db import default_repository
from ..models.media import MediaFormatInfo, MediaItem, MediaType
from ..models.queue import DownloadTask, ProgressUpdate, TaskStatus
from ..server.loop import send_notification
from ..server.protocol import JsonRpcNotification
from ..utils.naming import format_sequential_filename, get_next_sequence_number, sanitize_username
from .stream import download_stream

logger = get_logger("downloader.manager")


class DownloadManager:
    """Orchestrates background download execution, progress broadcasting, and queue state."""

    def __init__(self, max_concurrent: int | None = None) -> None:
        self.max_concurrent = max_concurrent or default_config.max_concurrent_downloads
        self._executor = ThreadPoolExecutor(
            max_workers=self.max_concurrent, thread_name_prefix="xaku-worker"
        )
        self._lock = threading.Lock()
        self._cancel_events: dict[str, threading.Event] = {}
        self._active_tasks: dict[str, DownloadTask] = {}

    def start_download(
        self,
        media_item: MediaItem,
        selected_format: MediaFormatInfo | None = None,
        destination_path: Path | str | None = None,
    ) -> DownloadTask:
        """Enqueue and launch a background download task."""
        # 1. Resolve source stream URL
        url = (
            selected_format.url
            if (selected_format and selected_format.url)
            else media_item.original_url
        )

        # 2. Resolve destination path if not provided
        if destination_path:
            dest = Path(destination_path)
        else:
            username = sanitize_username(media_item.author or "media")
            is_image = media_item.media_type == MediaType.IMAGE

            ext = "jpg" if is_image else "mp4"
            if selected_format and selected_format.container:
                ext = selected_format.container.lstrip(".")
            elif media_item.available_formats and media_item.available_formats[0].container:
                ext = media_item.available_formats[0].container.lstrip(".")
            else:
                parsed_ext = Path(url.split("?")[0]).suffix.lstrip(".")
                if parsed_ext and len(parsed_ext) <= 5:
                    ext = parsed_ext

            target_dir = (
                default_config.image_download_dir
                if is_image
                else default_config.video_download_dir
            )
            target_dir.mkdir(parents=True, exist_ok=True)
            seq = get_next_sequence_number(target_dir, username, media_item.media_type)
            filename = format_sequential_filename(username, media_item.media_type, seq, ext)
            dest = target_dir / filename

        dest.parent.mkdir(parents=True, exist_ok=True)
        temp_path = dest.with_suffix(dest.suffix + ".part")

        task = DownloadTask(
            id=str(uuid.uuid4()),
            media_item=media_item,
            status=TaskStatus.QUEUED,
            selected_format=selected_format,
            destination_path=dest,
            temp_path=temp_path,
        )

        # Persist task in SQLite
        default_repository.save_download_task(task)

        cancel_event = threading.Event()
        with self._lock:
            self._cancel_events[task.id] = cancel_event
            self._active_tasks[task.id] = task

        self._executor.submit(self._run_task, task, url, cancel_event)
        logger.info(f"Queued download task {task.id} for {dest.name}")
        return task

    def cancel_download(self, task_id: str) -> bool:
        """Signal cancellation for an active or queued download task."""
        with self._lock:
            event = self._cancel_events.get(task_id)
            if event:
                event.set()
                logger.info(f"Cancellation signaled for active download task {task_id}")
                return True

        # Check if task is queued in database and can be marked cancelled directly
        tasks = default_repository.get_download_tasks()
        for t in tasks:
            if t.id == task_id and not t.status.is_terminal:
                t.status = TaskStatus.CANCELLED
                default_repository.save_download_task(t)
                return True
        return False

    def get_tasks(
        self, status: TaskStatus | None = None, limit: int = 50
    ) -> list[DownloadTask]:
        """Query download tasks from the database."""
        return default_repository.get_download_tasks(status=status, limit=limit)

    def _run_task(
        self, task: DownloadTask, url: str, cancel_event: threading.Event
    ) -> None:
        """Worker thread executing the stream download and optional FFmpeg stream merge."""
        task.status = TaskStatus.DOWNLOADING
        default_repository.save_download_task(task)

        def _broadcast(name: str, payload: dict[str, Any]) -> None:
            for method_name in (f"download:{name}", f"download_{name}"):
                try:
                    send_notification(JsonRpcNotification(method=method_name, params=payload))
                except Exception:
                    pass

        # Broadcast download started
        _broadcast("started", {"task": task.model_dump(mode="json")})

        last_db_persist = time.monotonic()

        def progress_callback(update: ProgressUpdate) -> None:
            nonlocal last_db_persist
            task.bytes_downloaded = update.bytes_downloaded
            task.total_bytes = update.total_bytes
            task.progress_percent = update.progress_percent
            task.speed_bytes_sec = update.speed_bytes_sec

            # Broadcast live progress notification
            _broadcast("progress", update.model_dump(mode="json"))

            now = time.monotonic()
            if now - last_db_persist >= 1.0:
                default_repository.save_download_task(task)
                last_db_persist = now

        requires_merge = bool(
            task.selected_format
            and task.selected_format.requires_merge
            and task.destination_path
        )

        # Check if an audio stream is available for merging
        audio_format = None
        if requires_merge:
            for f in task.media_item.available_formats:
                if (
                    (f.video_codec is None or f.video_codec == "none")
                    and f.audio_codec
                    and f.audio_codec != "none"
                    and f.url
                ):
                    audio_format = f
                    break

        video_part = None
        audio_part = None

        try:
            if requires_merge and audio_format and audio_format.url and task.destination_path:
                v_fmt_id = task.selected_format.format_id if task.selected_format else "unknown"
                a_fmt_id = audio_format.format_id
                logger.info(
                    f"Task {task.id} requires FFmpeg merge (video: {v_fmt_id}, audio: {a_fmt_id})"
                )
                dest = task.destination_path
                video_part = dest.with_name(f"{dest.stem}.video.part")
                audio_part = dest.with_name(f"{dest.stem}.audio.part")
                temp_merged = dest.with_name(f"{dest.name}.part")

                # 1. Download video track
                def video_progress(up: ProgressUpdate) -> None:
                    # Scale video progress to 0% - 80%
                    scaled = ProgressUpdate(
                        task_id=task.id,
                        status=TaskStatus.DOWNLOADING,
                        bytes_downloaded=up.bytes_downloaded,
                        total_bytes=up.total_bytes,
                        progress_percent=round(up.progress_percent * 0.8, 1),
                        speed_bytes_sec=up.speed_bytes_sec,
                        detail_message="Downloading video track...",
                    )
                    progress_callback(scaled)

                download_stream(
                    url=url,
                    destination_path=video_part,
                    task_id=task.id,
                    progress_callback=video_progress,
                    cancel_event=cancel_event,
                )

                # 2. Download audio track
                def audio_progress(up: ProgressUpdate) -> None:
                    # Scale audio progress to 80% - 95%
                    scaled = ProgressUpdate(
                        task_id=task.id,
                        status=TaskStatus.DOWNLOADING,
                        bytes_downloaded=task.bytes_downloaded + up.bytes_downloaded,
                        total_bytes=up.total_bytes,
                        progress_percent=round(80.0 + (up.progress_percent * 0.15), 1),
                        speed_bytes_sec=up.speed_bytes_sec,
                        detail_message="Downloading audio track...",
                    )
                    progress_callback(scaled)

                download_stream(
                    url=audio_format.url,
                    destination_path=audio_part,
                    task_id=task.id,
                    progress_callback=audio_progress,
                    cancel_event=cancel_event,
                )

                # 3. Transition to MERGING state
                task.status = TaskStatus.MERGING
                task.progress_percent = 96.0
                default_repository.save_download_task(task)
                _broadcast(
                    "progress",
                    ProgressUpdate(
                        task_id=task.id,
                        status=TaskStatus.MERGING,
                        bytes_downloaded=task.bytes_downloaded,
                        total_bytes=task.total_bytes,
                        progress_percent=96.0,
                        detail_message="Merging audio and video tracks with FFmpeg...",
                    ).model_dump(mode="json"),
                )

                # 4. Perform FFmpeg multiplexing
                from ..processor.ffmpeg import merge_video_audio

                merge_video_audio(
                    video_path=video_part,
                    audio_path=audio_part,
                    output_path=temp_merged,
                    output_container=dest.suffix.lstrip("."),
                    is_cancelled=cancel_event.is_set,
                )

                # 5. Clean up temporary parts and atomically finalize
                if video_part.exists():
                    video_part.unlink(missing_ok=True)
                if audio_part.exists():
                    audio_part.unlink(missing_ok=True)

                import shutil

                shutil.move(str(temp_merged), str(dest))
                final_path = dest
            else:
                # Direct single-stream download
                final_path = download_stream(
                    url=url,
                    destination_path=task.destination_path,
                    task_id=task.id,
                    progress_callback=progress_callback,
                    cancel_event=cancel_event,
                )

            task.mark_completed(final_path)
            default_repository.save_download_task(task)
            logger.info(f"Task {task.id} completed successfully: {final_path}")
            _broadcast("completed", {"task": task.model_dump(mode="json")})

        except Exception as exc:
            # Clean up intermediate part files on failure or cancellation
            if video_part and video_part.exists():
                video_part.unlink(missing_ok=True)
            if audio_part and audio_part.exists():
                audio_part.unlink(missing_ok=True)

            if cancel_event.is_set():
                task.status = TaskStatus.CANCELLED
                logger.info(f"Task {task.id} cancelled.")
                _broadcast("cancelled", {"task_id": task.id})
            else:
                task.mark_failed(str(exc))
                logger.error(f"Task {task.id} failed: {exc}")
                _broadcast("failed", {"task_id": task.id, "error": str(exc)})
            default_repository.save_download_task(task)
        finally:
            with self._lock:
                self._cancel_events.pop(task.id, None)
                self._active_tasks.pop(task.id, None)


# Default singleton instance
default_download_manager = DownloadManager()
