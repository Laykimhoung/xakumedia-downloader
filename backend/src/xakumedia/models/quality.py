"""Quality, format, and resolution models for video and image pipelines."""

from enum import StrEnum


class VideoResolution(StrEnum):
    """Source video resolution targets."""

    BEST = "best"
    RES_2160P = "2160p"
    RES_1440P = "1440p"
    RES_1080P = "1080p"
    RES_720P = "720p"
    RES_480P = "480p"
    RES_360P = "360p"

    @property
    def height_threshold(self) -> int | None:
        """Return numerical vertical pixel height for resolution comparison."""
        mapping = {
            self.RES_2160P: 2160,
            self.RES_1440P: 1440,
            self.RES_1080P: 1080,
            self.RES_720P: 720,
            self.RES_480P: 480,
            self.RES_360P: 360,
        }
        return mapping.get(self)


class VideoContainer(StrEnum):
    """Video container format preferences."""

    ORIGINAL = "original"
    MP4 = "mp4"
    WEBM = "webm"
    MKV = "mkv"


class ImageFormat(StrEnum):
    """Supported image format options."""

    ORIGINAL = "original"
    JPG = "jpg"
    PNG = "png"
    WEBP = "webp"
    AVIF = "avif"


class ImageQualityPreset(StrEnum):
    """Compression presets for image transformation."""

    ORIGINAL = "original"
    HIGH = "high"
    BALANCED = "balanced"
    COMPACT = "compact"
