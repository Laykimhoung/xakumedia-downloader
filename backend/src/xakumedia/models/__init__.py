"""Models package for XakuMedia."""

from .media import MediaFormatInfo, MediaItem, MediaType
from .quality import ImageFormat, ImageQualityPreset, VideoContainer, VideoResolution
from .queue import DownloadTask, ProgressUpdate, TaskStatus
from .url import ClassifiedUrl, UrlCategory

__all__ = [
    "MediaType",
    "MediaFormatInfo",
    "MediaItem",
    "VideoResolution",
    "VideoContainer",
    "ImageFormat",
    "ImageQualityPreset",
    "UrlCategory",
    "ClassifiedUrl",
    "TaskStatus",
    "ProgressUpdate",
    "DownloadTask",
]
