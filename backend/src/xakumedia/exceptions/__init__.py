"""Exceptions package for XakuMedia."""

from .base import (
    ConfigurationError,
    DiskSpaceError,
    DownloadError,
    DRMProtectedError,
    ExtractionError,
    FileIntegrityError,
    InvalidDestinationError,
    MediaUnavailableError,
    NetworkTimeoutError,
    PrivateMediaError,
    RateLimitError,
    SecurityError,
    SSRFBlockedError,
    UnsupportedSourceError,
    UrlClassificationError,
    XakuMediaError,
)

__all__ = [
    "XakuMediaError",
    "ConfigurationError",
    "UrlClassificationError",
    "ExtractionError",
    "MediaUnavailableError",
    "UnsupportedSourceError",
    "PrivateMediaError",
    "RateLimitError",
    "DRMProtectedError",
    "DownloadError",
    "NetworkTimeoutError",
    "FileIntegrityError",
    "DiskSpaceError",
    "SecurityError",
    "SSRFBlockedError",
    "InvalidDestinationError",
]
