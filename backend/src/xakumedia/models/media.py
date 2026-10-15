"""Normalized domain models for discovered and processed media items."""

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from .quality import VideoResolution


class MediaType(StrEnum):
    """Primary media stream category."""

    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"


class MediaFormatInfo(BaseModel):
    """Metadata describing a specific available media format/stream."""

    format_id: str
    container: str | None = None
    resolution: str | None = None
    video_codec: str | None = None
    audio_codec: str | None = None
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    filesize_bytes: int | None = None
    is_direct_stream: bool = True
    url: str | None = None
    requires_merge: bool = False
    format_note: str | None = None

    @property
    def resolution_sort_key(self) -> int:
        """Helper for sorting formats from lowest to highest resolution."""
        if self.height:
            return self.height
        if self.width:
            return int(self.width * 9 / 16)
        return 0


class MediaItem(BaseModel):
    """Normalized media item discovered during scanning."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_url: str
    media_type: MediaType
    title: str | None = None
    author: str = "media"
    thumbnail_url: str | None = None
    original_url: str
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    filesize_bytes: int | None = None
    available_formats: list[MediaFormatInfo] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata_extra: dict[str, Any] = Field(default_factory=dict)

    @property
    def dimensions_label(self) -> str | None:
        """Formatted human-readable dimensions (e.g., 1920x1080)."""
        if self.width and self.height:
            return f"{self.width}x{self.height}"
        return None

    def find_best_format(
        self, max_resolution: VideoResolution | None = None
    ) -> MediaFormatInfo | None:
        """Find the highest quality video format bounded by max_resolution."""
        if not self.available_formats:
            return None

        threshold = max_resolution.height_threshold if max_resolution else None
        candidates = self.available_formats

        if threshold:
            bounded = [f for f in candidates if (f.height or 0) <= threshold]
            if bounded:
                candidates = bounded

        return max(candidates, key=lambda f: f.resolution_sort_key, default=None)
