"""URL category and classification data models."""

from enum import StrEnum

from pydantic import BaseModel, Field


class UrlCategory(StrEnum):
    """Categorized URL source types."""

    DIRECT_IMAGE = "direct_image"
    DIRECT_VIDEO = "direct_video"
    SOCIAL_POST = "social_post"
    GALLERY = "gallery"
    CHANNEL = "channel"
    UNKNOWN = "unknown"


class ClassifiedUrl(BaseModel):
    """Normalized output from URL classification."""

    raw_url: str
    normalized_url: str
    category: UrlCategory = UrlCategory.UNKNOWN
    platform: str | None = None
    domain: str | None = None
    author_hint: str | None = None
    title_hint: str | None = None
    is_supported: bool = True
    requires_auth: bool = False
    metadata_extra: dict[str, str] = Field(default_factory=dict)
