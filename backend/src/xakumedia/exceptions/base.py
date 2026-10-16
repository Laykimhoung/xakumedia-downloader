"""Domain exception hierarchies for XakuMedia."""

from typing import Any


class XakuMediaError(Exception):
    """Base exception for all XakuMedia errors."""

    def __init__(
        self, message: str, code: str = "INTERNAL_ERROR", details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "code": self.code,
            "details": self.details,
        }


# Configuration & Environment
class ConfigurationError(XakuMediaError):
    """Raised when configuration or runtime environment is invalid."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="CONFIG_ERROR", details=details)


# URL Classification & Extraction
class UrlClassificationError(XakuMediaError):
    """Raised when URL classification fails or URL is malformed."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="URL_CLASSIFICATION_ERROR", details=details)


class ExtractionError(XakuMediaError):
    """Base class for media extraction failures."""

    def __init__(
        self, message: str, code: str = "EXTRACTION_ERROR", details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message, code=code, details=details)


class MediaUnavailableError(ExtractionError):
    """Raised when target media has been deleted, privated, or is inaccessible."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="MEDIA_UNAVAILABLE", details=details)


class UnsupportedSourceError(ExtractionError):
    """Raised when no extraction provider supports the provided URL."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="UNSUPPORTED_SOURCE", details=details)


class PrivateMediaError(ExtractionError):
    """Raised when target media requires authentication or is private."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="PRIVATE_MEDIA", details=details)


class RateLimitError(ExtractionError):
    """Raised when upstream server or platform throttles or rate limits requests."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="RATE_LIMITED", details=details)


class DRMProtectedError(ExtractionError):
    """Raised when media is protected by Digital Rights Management."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="DRM_PROTECTED", details=details)


# Download & File Processing
class DownloadError(XakuMediaError):
    """Base class for download execution failures."""

    def __init__(
        self, message: str, code: str = "DOWNLOAD_ERROR", details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message, code=code, details=details)


class NetworkTimeoutError(DownloadError):
    """Raised when network requests exceed configured timeout limits."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="NETWORK_TIMEOUT", details=details)


class FileIntegrityError(DownloadError):
    """Raised when a downloaded file fails size or format integrity verification."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="FILE_INTEGRITY_ERROR", details=details)


class DiskSpaceError(DownloadError):
    """Raised when destination drive lacks sufficient free space."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="INSUFFICIENT_DISK_SPACE", details=details)


# Security
class SecurityError(XakuMediaError):
    """Base class for security and safety policy violations."""

    def __init__(
        self, message: str, code: str = "SECURITY_VIOLATION", details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message, code=code, details=details)


class SSRFBlockedError(SecurityError):
    """Raised when a URL attempts to connect to localhost, loopback, or private network IPs."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="SSRF_BLOCKED", details=details)


class InvalidDestinationError(SecurityError):
    """Raised when a destination path attempts directory traversal outside designated folders."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="INVALID_DESTINATION_PATH", details=details)
