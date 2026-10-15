"""Task queue and progress reporting models for background download operations."""

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, Field

from .media import MediaFormatInfo, MediaItem


class TaskStatus(StrEnum):
    """Lifecycle status of a download task."""

    QUEUED = "queued"
    SCANNING = "scanning"
    DOWNLOADING = "downloading"
    MERGING = "merging"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"

    @property
    def is_terminal(self) -> bool:
        """Return True if status represents a finished task."""
        return self in (self.COMPLETED, self.FAILED, self.CANCELLED)

    @property
    def is_active(self) -> bool:
        """Return True if task is currently executing network or disk I/O."""
        return self in (self.SCANNING, self.DOWNLOADING, self.MERGING)


class ProgressUpdate(BaseModel):
    """Structured progress telemetry emitted during download execution."""

    task_id: str
    status: TaskStatus
    bytes_downloaded: int = 0
    total_bytes: int | None = None
    progress_percent: float = 0.0
    speed_bytes_sec: float = 0.0
    eta_seconds: float | None = None
    detail_message: str | None = None


class DownloadTask(BaseModel):
    """Persistent download task record."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    media_item: MediaItem
    status: TaskStatus = TaskStatus.QUEUED
    selected_format: MediaFormatInfo | None = None
    destination_path: Path | None = None
    temp_path: Path | None = None
    bytes_downloaded: int = 0
    total_bytes: int | None = None
    progress_percent: float = 0.0
    speed_bytes_sec: float = 0.0
    error_message: str | None = None
    retry_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None

    def mark_completed(self, final_path: Path) -> None:
        """Mark task as successfully completed with final disk path."""
        self.status = TaskStatus.COMPLETED
        self.destination_path = final_path
        self.progress_percent = 100.0
        self.completed_at = datetime.now(UTC)

    def mark_failed(self, error_message: str) -> None:
        """Mark task as failed with error details."""
        self.status = TaskStatus.FAILED
        self.error_message = error_message
        self.completed_at = datetime.now(UTC)
