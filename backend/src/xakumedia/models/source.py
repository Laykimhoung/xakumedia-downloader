"""Data models for bookmarked media sources and incremental rescan operations."""

from datetime import UTC, datetime

from pydantic import BaseModel, Field

from .media import MediaItem


class SavedSource(BaseModel):
    """Represents a bookmarked media source (channel, gallery, artist profile)."""

    id: str
    url: str
    title: str
    platform: str | None = None
    category: str | None = None
    author: str | None = None
    thumbnail_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    last_scanned_at: str | None = None
    last_item_count: int = Field(default=0, ge=0)
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class IncrementalScanResult(BaseModel):
    """Results of an incremental scan comparing newly discovered items with existing records."""

    source: SavedSource
    total_found: int = Field(default=0, ge=0)
    new_items: list[MediaItem] = Field(default_factory=list)
    existing_items: list[MediaItem] = Field(default_factory=list)
    new_item_count: int = Field(default=0, ge=0)
    scanned_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class RescanAllSummary(BaseModel):
    """Aggregated summary of an incremental rescan across all saved sources."""

    sources_checked: int = 0
    total_items_found: int = 0
    total_new_items: int = 0
    results: list[IncrementalScanResult] = Field(default_factory=list)
    errors: dict[str, str] = Field(default_factory=dict)
