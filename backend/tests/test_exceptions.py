"""Unit tests for exception hierarchies and serialization."""

from xakumedia.exceptions.base import (
    ExtractionError,
    MediaUnavailableError,
    SSRFBlockedError,
    UnsupportedSourceError,
    XakuMediaError,
)


def test_exception_serialization() -> None:
    err = SSRFBlockedError(
        "Connection to loopback address 127.0.0.1 is denied by security policy.",
        details={"ip": "127.0.0.1", "host": "localhost"},
    )

    data = err.to_dict()
    assert data["error"] == "SSRFBlockedError"
    assert data["code"] == "SSRF_BLOCKED"
    assert "loopback address" in data["message"]
    assert data["details"]["ip"] == "127.0.0.1"


def test_exception_inheritance() -> None:
    unsupported = UnsupportedSourceError("Unknown video site")
    unavailable = MediaUnavailableError("Post deleted")

    assert isinstance(unsupported, ExtractionError)
    assert isinstance(unsupported, XakuMediaError)
    assert isinstance(unavailable, ExtractionError)
    assert isinstance(unavailable, XakuMediaError)
