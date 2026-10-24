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
from ..exceptions import DownloadPausedError
from ..models.media import MediaFormatInfo, MediaItem, MediaType
from ..models.queue import DownloadTask, ProgressUpdate, TaskStatus
from ..server.loop import send_notification
from ..server.protocol import JsonRpcNotification
from ..utils.naming import format_sequential_filename, get_next_sequence_number, sanitize_username
from .stream import download_stream

logger = get_logger("downloader.manager")


def _broadcast(name: str, payload: dict[str, Any]) -> None:
    """Send dual-format JSON-RPC notifications (colon and underscore syntax)."""
    for method_name in (f"download:{name}", f"download_{name}"):
        try:
            send_notification(JsonRpcNotification(method=method_name, params=payload))
        except Exception:
            pass


class DownloadManager:
    """Orchestrates background download execution, progress broadcasting, and queue state."""

    def __init__(
        self,
        max_concurrent: int | None = None,
        repository: Any = None,
        throttler: Any = None,
    ) -> None:
        self.max_concurrent = max(
            1, min(10, max_concurrent or default_config.max_concurrent_downloads)
        )
        self.repository = repository or default_repository
        from .throttler import default_throttler

        self.throttler = throttler or default_throttler
        self._executor = ThreadPoolExecutor(max_workers=30, thread_name_prefix="xaku-worker")
        self._lock = threading.Lock()
        self._cancel_events: dict[str, threading.Event] = {}
        self._pause_events: dict[str, threading.Event] = {}
        self._active_tasks: dict[str, DownloadTask] = {}
        self._pending_queue: list[tuple[DownloadTask, str]] = []

    def set_speed_limit(self, kbps: int) -> int:
        """Update maximum bandwidth limit in KB/s (0 = unlimited)."""
        return self.throttler.set_speed_limit(kbps)

    def get_speed_limit(self) -> int:
        """Return the current bandwidth limit in KB/s (0 = unlimited)."""
        return self.throttler.get_speed_limit()

    def set_concurrency(self, concurrency: int) -> int:
        """Update maximum concurrent active download workers (clamped between 1 and 10)."""
        clamped = max(1, min(10, concurrency))
        self.max_concurrent = clamped
        self._schedule_next()
        logger.info(f"Concurrency set to {self.max_concurrent}")
        return self.max_concurrent

    def _enqueue(self, task: DownloadTask, url: str) -> None:
        """Add a task to the pending FIFO queue and schedule available workers."""
        with self._lock:
            self._pending_queue.append((task, url))
        self._schedule_next()

    def _schedule_next(self) -> None:
        """Launch waiting tasks from the pending queue if worker capacity is available."""
        with self._lock:
            while len(self._active_tasks) < self.max_concurrent and self._pending_queue:
                task, url = self._pending_queue.pop(0)
                cancel_event = threading.Event()
                pause_event = threading.Event()
                self._cancel_events[task.id] = cancel_event
                self._pause_events[task.id] = pause_event
                self._active_tasks[task.id] = task
                self._executor.submit(
                    self._run_task, task, url, cancel_event, pause_event
                )

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
        self.repository.save_download_task(task)

        # Enqueue task and attempt scheduling
        self._enqueue(task, url)
        logger.info(f"Queued download task {task.id} for {dest.name}")
        return task

    def start_batch_download(
        self,
        items: list[dict[str, Any] | tuple[Any, ...]],
        target_dir: Path | str | None = None,
    ) -> list[DownloadTask]:
        """Enqueue multiple download tasks with sequential naming and slot scheduling."""
        created_tasks: list[DownloadTask] = []
        seq_tracker: dict[tuple[Path, str, MediaType], int] = {}
        pending_items: list[tuple[DownloadTask, str]] = []

        for entry in items:
            media_item: MediaItem
            selected_format: MediaFormatInfo | None = None
            dest_override: Path | str | None = None

            if isinstance(entry, dict):
                m_raw = entry.get("media_item")
                if isinstance(m_raw, MediaItem):
                    media_item = m_raw
                else:
                    media_item = MediaItem.model_validate(m_raw)

                f_raw = entry.get("selected_format")
                if isinstance(f_raw, MediaFormatInfo):
                    selected_format = f_raw
                elif f_raw:
                    selected_format = MediaFormatInfo.model_validate(f_raw)

                dest_override = entry.get("destination_path")
            elif isinstance(entry, (tuple, list)):
                m_raw = entry[0]
                media_item = (
                    m_raw if isinstance(m_raw, MediaItem) else MediaItem.model_validate(m_raw)
                )
                if len(entry) > 1 and entry[1] is not None:
                    f_raw = entry[1]
                    selected_format = (
                        f_raw
                        if isinstance(f_raw, MediaFormatInfo)
                        else MediaFormatInfo.model_validate(f_raw)
                    )
                if len(entry) > 2 and entry[2] is not None:
                    dest_override = entry[2]
            else:
                continue

            url = (
                selected_format.url
                if (selected_format and selected_format.url)
                else media_item.original_url
            )

            if dest_override:
                dest = Path(dest_override)
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

                item_dir = (
                    Path(target_dir)
                    if target_dir
                    else (
                        default_config.image_download_dir
                        if is_image
                        else default_config.video_download_dir
                    )
                )
                item_dir.mkdir(parents=True, exist_ok=True)

                key = (item_dir, username, media_item.media_type)
                if key not in seq_tracker:
                    seq = get_next_sequence_number(item_dir, username, media_item.media_type)
                    seq_tracker[key] = seq
                else:
                    seq_tracker[key] += 1
                    seq = seq_tracker[key]

                filename = format_sequential_filename(username, media_item.media_type, seq, ext)
                dest = item_dir / filename

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
            self.repository.save_download_task(task)
            created_tasks.append(task)
            pending_items.append((task, url))

        with self._lock:
            self._pending_queue.extend(pending_items)

        self._schedule_next()
        logger.info(f"Queued batch of {len(created_tasks)} tasks.")
        return created_tasks

    def cancel_download(self, task_id: str) -> bool:
        """Signal cancellation for an active or queued download task."""
        with self._lock:
            event = self._cancel_events.get(task_id)
            if event:
                event.set()
                logger.info(f"Cancellation signaled for active download task {task_id}")
                return True

            for i, (task, _) in enumerate(self._pending_queue):
                if task.id == task_id:
                    self._pending_queue.pop(i)
                    task.status = TaskStatus.CANCELLED
                    self.repository.save_download_task(task)
                    _broadcast("cancelled", {"task_id": task_id})
                    logger.info(f"Cancelled pending task {task_id}")
                    return True

        task = self.repository.get_download_task(task_id)
        if task and not task.status.is_terminal:
            task.status = TaskStatus.CANCELLED
            self.repository.save_download_task(task)
            _broadcast("cancelled", {"task_id": task_id})
            return True
        return False

    def pause_download(self, task_id: str) -> bool:
        """Signal pause for an active download or mark a queued task paused."""
        with self._lock:
            event = self._pause_events.get(task_id)
            if event:
                event.set()
                logger.info(f"Pause signaled for active download task {task_id}")
                return True

            for i, (task, _) in enumerate(self._pending_queue):
                if task.id == task_id:
                    self._pending_queue.pop(i)
                    task.status = TaskStatus.PAUSED
                    self.repository.save_download_task(task)
                    _broadcast(
                        "paused",
                        {"task_id": task_id, "task": task.model_dump(mode="json")},
                    )
                    logger.info(f"Paused pending task {task_id}")
                    return True

        task = self.repository.get_download_task(task_id)
        if task and task.status in (TaskStatus.QUEUED, TaskStatus.DOWNLOADING):
            task.status = TaskStatus.PAUSED
            self.repository.save_download_task(task)
            _broadcast(
                "paused",
                {"task_id": task_id, "task": task.model_dump(mode="json")},
            )
            return True

        return False

    def resume_download(self, task_id: str) -> bool:
        """Resume a paused download task."""
        with self._lock:
            if task_id in self._active_tasks or any(
                t.id == task_id for t, _ in self._pending_queue
            ):
                return True

        task = self.repository.get_download_task(task_id)
        if not task or task.status not in (TaskStatus.PAUSED, TaskStatus.QUEUED):
            return False

        task.status = TaskStatus.QUEUED
        self.repository.save_download_task(task)

        url = (
            task.selected_format.url
            if (task.selected_format and task.selected_format.url)
            else task.media_item.original_url
        )
        self._enqueue(task, url)
        _broadcast(
            "resumed",
            {"task_id": task_id, "task": task.model_dump(mode="json")},
        )
        logger.info(f"Resumed task {task_id}")
        return True

    def pause_all(self) -> int:
        """Pause all active and pending download tasks."""
        count = 0
        with self._lock:
            for event in self._pause_events.values():
                event.set()
                count += 1

            for task, _ in self._pending_queue:
                task.status = TaskStatus.PAUSED
                self.repository.save_download_task(task)
                _broadcast(
                    "paused",
                    {"task_id": task.id, "task": task.model_dump(mode="json")},
                )
                count += 1
            self._pending_queue.clear()

        logger.info(f"pause_all signaled for {count} tasks.")
        return count

    def resume_all(self) -> int:
        """Resume all paused download tasks in the database."""
        paused_tasks = self.repository.get_download_tasks(
            status=TaskStatus.PAUSED, limit=200
        )
        resumed_count = 0
        for task in paused_tasks:
            if self.resume_download(task.id):
                resumed_count += 1
        logger.info(f"resume_all re-enqueued {resumed_count} tasks.")
        return resumed_count

    def cancel_all(self) -> int:
        """Cancel all active and pending download tasks."""
        count = 0
        with self._lock:
            for event in self._cancel_events.values():
                event.set()
                count += 1

            for task, _ in self._pending_queue:
                task.status = TaskStatus.CANCELLED
                self.repository.save_download_task(task)
                _broadcast("cancelled", {"task_id": task.id})
                count += 1
            self._pending_queue.clear()

        logger.info(f"cancel_all cancelled {count} tasks.")
        return count

    def clear_completed(self) -> int:
        """Remove completed, failed, and cancelled tasks from database."""
        deleted = self.repository.clear_completed_tasks()
        _broadcast("queue_cleared", {"cleared_count": deleted})
        return deleted

    def get_queue_state(self) -> dict[str, Any]:
        """Get aggregate counts and worker slot metrics for the download queue."""
        with self._lock:
            active_count = len(self._active_tasks)
            pending_count = len(self._pending_queue)

        return {
            "max_concurrent": self.max_concurrent,
            "active_count": active_count,
            "pending_count": pending_count,
            "counts": self.repository.get_queue_counts(),
        }

    def get_tasks(
        self, status: TaskStatus | None = None, limit: int = 50
    ) -> list[DownloadTask]:
        """Query download tasks from the database."""
        return self.repository.get_download_tasks(status=status, limit=limit)

    def recover_interrupted_tasks(
        self, auto_resume: bool | None = None
    ) -> dict[str, Any]:
        """Audit and recover uncompleted or crashed download tasks."""
        from .recovery import TaskRecoveryService

        service = TaskRecoveryService(manager=self)
        summary = service.recover_interrupted_tasks(auto_resume=auto_resume)
        return summary.to_dict()

    def _run_task(
        self,
        task: DownloadTask,
        url: str,
        cancel_event: threading.Event,
        pause_event: threading.Event,
    ) -> None:
        """Worker thread executing the stream download and optional FFmpeg stream merge."""
        task.status = TaskStatus.DOWNLOADING
        self.repository.save_download_task(task)

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
                self.repository.save_download_task(task)
                last_db_persist = now

        requires_merge = bool(
            task.selected_format
            and task.selected_format.requires_merge
            and task.destination_path
        )

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
                v_fmt_id = (
                    task.selected_format.format_id if task.selected_format else "unknown"
                )
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
                    pause_event=pause_event,
                    throttler=self.throttler,
                )

                # 2. Download audio track
                def audio_progress(up: ProgressUpdate) -> None:
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
                    pause_event=pause_event,
                    throttler=self.throttler,
                )

                # 3. Transition to MERGING state
                task.status = TaskStatus.MERGING
                task.progress_percent = 96.0
                self.repository.save_download_task(task)
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
                    pause_event=pause_event,
                    throttler=self.throttler,
                )

            task.mark_completed(final_path)
            self.repository.save_download_task(task)
            logger.info(f"Task {task.id} completed successfully: {final_path}")
            _broadcast("completed", {"task": task.model_dump(mode="json")})

        except DownloadPausedError:
            task.status = TaskStatus.PAUSED
            self.repository.save_download_task(task)
            logger.info(f"Task {task.id} paused by user.")
            _broadcast(
                "paused",
                {"task_id": task.id, "task": task.model_dump(mode="json")},
            )

        except Exception as exc:
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
            self.repository.save_download_task(task)
        finally:
            with self._lock:
                self._cancel_events.pop(task.id, None)
                self._pause_events.pop(task.id, None)
                self._active_tasks.pop(task.id, None)
            self._schedule_next()


# Default singleton instance
default_download_manager = DownloadManager()
