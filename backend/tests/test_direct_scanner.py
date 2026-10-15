"""Unit tests for direct media scanner, MIME classification, and header probing."""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from xakumedia.exceptions.base import (
    MediaUnavailableError,
    SSRFBlockedError,
    UnsupportedSourceError,
)
from xakumedia.models.media import MediaType
from xakumedia.models.url import UrlCategory
from xakumedia.scanners.direct import (
    classify_direct_url,
    extract_filename_from_headers,
)


def create_mock_response(
    status_code: int = 200,
    headers: dict[str, str] | None = None,
    url: str = "https://example.com/media",
) -> httpx.Response:
    req = httpx.Request("HEAD", url)
    return httpx.Response(status_code, headers=headers or {}, request=req)


def test_extract_filename_from_headers() -> None:
    # From Content-Disposition standard filename
    headers = httpx.Headers({"content-disposition": 'attachment; filename="nature_photo.jpg"'})
    assert (
        extract_filename_from_headers(headers, "https://example.com/download")
        == "nature_photo.jpg"
    )

    # From Content-Disposition UTF-8 encoded
    headers = httpx.Headers({"content-disposition": "inline; filename*=UTF-8''tokyo%20night.png"})
    assert extract_filename_from_headers(headers, "https://example.com/pic") == "tokyo night.png"

    # Fallback to URL path
    headers = httpx.Headers({})
    assert (
        extract_filename_from_headers(headers, "https://example.com/assets/video_sample.mp4?v=2")
        == "video_sample.mp4"
    )


def test_classify_direct_image() -> None:
    mock_resp = create_mock_response(
        200,
        headers={
            "content-type": "image/png; charset=binary",
            "content-length": "1048576",
            "content-disposition": 'inline; filename="avatar.png"',
        },
        url="https://cdn.example.com/avatar.png",
    )

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.head.return_value = mock_resp

    with patch("socket.getaddrinfo", return_value=[(2, 1, 0, "", ("93.184.216.34", 80))]):
        classified, item = classify_direct_url(
            "https://cdn.example.com/avatar.png", client=mock_client
        )

    assert classified.is_supported is True
    assert classified.category == UrlCategory.DIRECT_IMAGE
    assert classified.domain == "cdn.example.com"
    assert item is not None
    assert item.media_type == MediaType.IMAGE
    assert item.filesize_bytes == 1048576
    assert item.title == "avatar"
    assert len(item.available_formats) == 1
    assert item.available_formats[0].container == "png"


def test_classify_direct_video() -> None:
    mock_resp = create_mock_response(
        200,
        headers={
            "content-type": "video/mp4",
            "content-length": "52428800",
        },
        url="https://video.example.com/clip_01.mp4",
    )

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.head.return_value = mock_resp

    with patch("socket.getaddrinfo", return_value=[(2, 1, 0, "", ("93.184.216.34", 80))]):
        classified, item = classify_direct_url(
            "https://video.example.com/clip_01.mp4", client=mock_client
        )

    assert classified.is_supported is True
    assert classified.category == UrlCategory.DIRECT_VIDEO
    assert item is not None
    assert item.media_type == MediaType.VIDEO
    assert item.filesize_bytes == 52428800
    assert item.title == "clip_01"


def test_classify_octet_stream_with_media_ext() -> None:
    mock_resp = create_mock_response(
        200,
        headers={
            "content-type": "application/octet-stream",
            "content-disposition": 'attachment; filename="render.webp"',
            "content-length": "204800",
        },
        url="https://assets.example.com/download?id=123",
    )

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.head.return_value = mock_resp

    with patch("socket.getaddrinfo", return_value=[(2, 1, 0, "", ("93.184.216.34", 80))]):
        classified, item = classify_direct_url(
            "https://assets.example.com/download?id=123", client=mock_client
        )

    assert classified.is_supported is True
    assert classified.category == UrlCategory.DIRECT_IMAGE
    assert item is not None
    assert item.available_formats[0].container == "webp"


def test_classify_html_webpage_not_direct() -> None:
    mock_resp = create_mock_response(
        200,
        headers={"content-type": "text/html; charset=utf-8"},
        url="https://example.com/article",
    )

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.head.return_value = mock_resp

    with patch("socket.getaddrinfo", return_value=[(2, 1, 0, "", ("93.184.216.34", 80))]):
        classified, item = classify_direct_url(
            "https://example.com/article", client=mock_client
        )

    assert classified.is_supported is False
    assert classified.category == UrlCategory.UNKNOWN
    assert item is None


def test_classify_http_404_not_found() -> None:
    mock_resp = create_mock_response(404, url="https://example.com/missing.mp4")
    mock_client = MagicMock(spec=httpx.Client)
    mock_client.head.return_value = mock_resp

    with patch("socket.getaddrinfo", return_value=[(2, 1, 0, "", ("93.184.216.34", 80))]):
        with pytest.raises(MediaUnavailableError, match="HTTP 404"):
            classify_direct_url("https://example.com/missing.mp4", client=mock_client)


def test_classify_unsupported_media_type() -> None:
    mock_resp = create_mock_response(
        200,
        headers={"content-type": "application/pdf"},
        url="https://example.com/document.pdf",
    )
    mock_client = MagicMock(spec=httpx.Client)
    mock_client.head.return_value = mock_resp

    with patch("socket.getaddrinfo", return_value=[(2, 1, 0, "", ("93.184.216.34", 80))]):
        with pytest.raises(UnsupportedSourceError, match="supported direct image or video"):
            classify_direct_url("https://example.com/document.pdf", client=mock_client)


def test_classify_ssrf_blocked_early() -> None:
    with pytest.raises(SSRFBlockedError):
        classify_direct_url("http://127.0.0.1/private.mp4")
