"""XakuMedia - Local-first Windows Desktop Bulk Media Downloader Engine."""

from .core.config import AppConfig, default_config
from .core.logging import get_logger, setup_logging
from .exceptions import (
    ConfigurationError,
    DiskSpaceError,
    DownloadError,
    ExtractionError,
    FileIntegrityError,
    InvalidDestinationError,
    MediaUnavailableError,
    NetworkTimeoutError,
    SecurityError,
    SSRFBlockedError,
    UnsupportedSourceError,
    UrlClassificationError,
    XakuMediaError,
)
from .models import (
    ClassifiedUrl,
    DownloadTask,
    ImageFormat,
    ImageQualityPreset,
    MediaFormatInfo,
    MediaItem,
    MediaType,
    ProgressUpdate,
    TaskStatus,
    UrlCategory,
    VideoContainer,
    VideoResolution,
)
from .scanners import classify_direct_url, probe_direct_url
from .utils.security import validate_url_security

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "AppConfig",
    "default_config",
    "setup_logging",
    "get_logger",
    "XakuMediaError",
    "ConfigurationError",
    "UrlClassificationError",
    "ExtractionError",
    "MediaUnavailableError",
    "UnsupportedSourceError",
    "DownloadError",
    "NetworkTimeoutError",
    "FileIntegrityError",
    "DiskSpaceError",
    "SecurityError",
    "SSRFBlockedError",
    "InvalidDestinationError",
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
    "classify_direct_url",
    "probe_direct_url",
    "validate_url_security",
]
