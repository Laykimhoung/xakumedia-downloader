"""Crash recovery service for detecting, auditing, and resuming interrupted download tasks."""

from dataclasses import dataclass, field
from typing import Any

from ..core.logging import get_logger
from ..db.repository import MediaRepository, default_repository
from ..models.queue import DownloadTask, TaskStatus
from .manager import DownloadManager, _broadcast, default_download_manager

logger = get_logger("downloader.recovery")


@dataclass
class RecoverySummary:
    """Telemetry and metrics produced by an interrupted task recovery run."""

    recovered_count: int = 0
    resumed_count: int = 0
    paused_count: int = 0
    completed_count: int = 0
    tasks: list[DownloadTask] = field(default_factory=list)
    auto_resumed: bool = False
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialize recovery summary to a dictionary."""
        return {
            "recovered_count": self.recovered_count,
            "resumed_count": self.resumed_count,
            "paused_count": self.paused_count,
            "completed_count": self.completed_count,
            "tasks": [t.model_dump(mode="json") for t in self.tasks],
            "auto_resumed": self.auto_resumed,
            "message": self.message,
        }


class TaskRecoveryService:
    """Audits local disk state against SQLite task queues to recover interrupted downloads."""

    def __init__(
        self,
        manager: DownloadManager | None = None,
        repository: MediaRepository | None = None,
    ) -> None:
        self.manager = manager or default_download_manager
        self.repository = repository or getattr(self.manager, "repository", default_repository)

    def recover_interrupted_tasks(
        self,
        auto_resume: bool | None = None,
    ) -> RecoverySummary:
        """Scan SQLite for uncompleted tasks, inspect disk .part files, and resume or pause them."""
        uncompleted = self.repository.get_uncompleted_tasks()
        if not uncompleted:
            summary = RecoverySummary(message="No interrupted tasks found on disk or database.")
            logger.info("Task recovery audit completed: 0 interrupted tasks.")
            return summary

        logger.info(f"Task recovery audit found {len(uncompleted)} uncompleted task(s) to process.")
        summary = RecoverySummary()

        should_auto_resume = (
            auto_resume
            if auto_resume is not None
            else bool(self.repository.get_preference("auto_start_downloads", True))
        )
        summary.auto_resumed = should_auto_resume

        tasks_to_resume: list[DownloadTask] = []

        for task in uncompleted:
            dest = task.destination_path

            # 1. Check if the final destination file already exists and is complete on disk
            if dest and dest.exists() and dest.stat().st_size > 0:
                logger.info(
                    f"Task {task.id} destination already complete on disk: {dest.name}"
                )
                task.mark_completed(dest)
                task.bytes_downloaded = dest.stat().st_size
                task.total_bytes = dest.stat().st_size
                task.progress_percent = 100.0
                self.repository.save_download_task(task)
                summary.completed_count += 1
                continue

            requires_merge = bool(
                task.selected_format
                and task.selected_format.requires_merge
                and dest
            )

            if requires_merge and dest:
                # 2. Dual-stream (requires FFmpeg merge) recovery
                video_part = dest.with_name(f"{dest.stem}.video.part")
                video_staging = dest.with_name(f"{dest.stem}.video.part.part")
                audio_part = dest.with_name(f"{dest.stem}.audio.part")
                audio_staging = dest.with_name(f"{dest.stem}.audio.part.part")
                temp_merged = dest.with_name(f"{dest.name}.part")

                # Clean up interrupted/corrupted partial merge output if present
                if temp_merged.exists():
                    try:
                        temp_merged.unlink(missing_ok=True)
                        logger.info(
                            f"Removed interrupted partial merge file: {temp_merged.name}"
                        )
                    except OSError as exc:
                        logger.warning(
                            f"Failed to remove partial merge file {temp_merged}: {exc}"
                        )

                v_size = (
                    video_part.stat().st_size
                    if video_part.exists()
                    else (video_staging.stat().st_size if video_staging.exists() else 0)
                )
                a_size = (
                    audio_part.stat().st_size
                    if audio_part.exists()
                    else (audio_staging.stat().st_size if audio_staging.exists() else 0)
                )
                total_partial = v_size + a_size

                task.bytes_downloaded = total_partial
                task.status = TaskStatus.PAUSED
                if task.total_bytes and task.total_bytes > 0:
                    task.progress_percent = min(
                        95.0, round((total_partial / task.total_bytes) * 100, 1)
                    )
                else:
                    task.progress_percent = 0.0

                self.repository.save_download_task(task)
                summary.recovered_count += 1
                summary.tasks.append(task)
                tasks_to_resume.append(task)

            else:
                # 3. Direct single-stream recovery
                temp_path = task.temp_path or (
                    dest.with_suffix(dest.suffix + ".part") if dest else None
                )
                part_size = 0
                if temp_path and temp_path.exists():
                    try:
                        part_size = temp_path.stat().st_size
                    except OSError:
                        part_size = 0

                task.bytes_downloaded = part_size
                task.status = TaskStatus.PAUSED
                if task.total_bytes and task.total_bytes > 0 and part_size > 0:
                    task.progress_percent = min(
                        99.0, round((part_size / task.total_bytes) * 100, 1)
                    )
                else:
                    task.progress_percent = 0.0

                self.repository.save_download_task(task)
                summary.recovered_count += 1
                summary.tasks.append(task)
                tasks_to_resume.append(task)

        # 4. Auto-resume eligible tasks if configured
        if should_auto_resume:
            for task in tasks_to_resume:
                try:
                    resumed = self.manager.resume_download(task.id)
                    if resumed:
                        summary.resumed_count += 1
                    else:
                        summary.paused_count += 1
                except Exception as exc:
                    logger.warning(f"Failed to auto-resume recovered task {task.id}: {exc}")
                    summary.paused_count += 1
        else:
            summary.paused_count = len(tasks_to_resume)

        summary.message = (
            f"Recovered {summary.recovered_count} interrupted task(s): "
            f"{summary.resumed_count} resumed, {summary.paused_count} paused, "
            f"{summary.completed_count} verified complete."
        )
        logger.info(summary.message)

        # 5. Broadcast recovery notification over JSON-RPC
        _broadcast("recovery_completed", summary.to_dict())

        return summary


# Default singleton instance
default_recovery_service = TaskRecoveryService()
