"""Exceptions package for XakuMedia."""

from .base import (
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

__all__ = [
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
]
