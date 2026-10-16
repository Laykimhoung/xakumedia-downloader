"""Tests for gallery extraction and error normalization using gallery-dl."""

from unittest.mock import MagicMock, patch

import pytest
from gallery_dl.exception import (
    AuthenticationError,
    HttpError,
    NoExtractorError,
    NotFoundError,
)

from xakumedia.exceptions.base import (
    MediaUnavailableError,
    PrivateMediaError,
    RateLimitError,
    SecurityError,
    UnsupportedSourceError,
)
from xakumedia.extractors.gallery import (
    extract_gallery_info,
    parse_gallery_dl_error,
)
from xakumedia.models.media import MediaType
from xakumedia.models.url import UrlCategory
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest


def test_parse_gallery_dl_error() -> None:
    """Ensure gallery-dl exceptions map to domain errors."""
    url = "https://example.com/gallery/123"

    assert isinstance(
        parse_gallery_dl_error(NoExtractorError(), url),
        UnsupportedSourceError,
    )
    assert isinstance(
        parse_gallery_dl_error(AuthenticationError("Login required"), url),
        PrivateMediaError,
    )
    assert isinstance(
        parse_gallery_dl_error(NotFoundError("Not found"), url),
        MediaUnavailableError,
    )

    http_429 = HttpError("Rate limit exceeded", MagicMock(status_code=429))
    assert isinstance(parse_gallery_dl_error(http_429, url), RateLimitError)

    http_404 = HttpError("Not found", MagicMock(status_code=404))
    assert isinstance(parse_gallery_dl_error(http_404, url), MediaUnavailableError)

    http_403 = HttpError("Forbidden", MagicMock(status_code=403))
    assert isinstance(parse_gallery_dl_error(http_403, url), PrivateMediaError)


def test_extract_gallery_ssrf_blocked() -> None:
    """Ensure SSRF protection blocks private / loopback gallery URLs."""
    with pytest.raises(SecurityError):
        extract_gallery_info("http://127.0.0.1:8000/album/private")


def test_extract_gallery_unsupported_url() -> None:
    """Ensure URLs with no matching gallery-dl extractor raise UnsupportedSourceError."""
    with patch("gallery_dl.extractor.find", return_value=None):
        with pytest.raises(UnsupportedSourceError) as exc_info:
            extract_gallery_info("https://example.com/unsupported-collection")
        assert "No gallery extractor supports this URL" in exc_info.value.message


def test_extract_gallery_success() -> None:
    """Verify successful gallery extraction into multiple MediaItem models."""
    mock_extractor = MagicMock()
    mock_extractor.category = "artstation"
    mock_extractor.subcategory = "artwork"

    mock_job = MagicMock()
    mock_job.exception = None
    mock_job.data_urls = [
        "https://cdn.artstation.com/p/assets/images/001.jpg",
        "https://cdn.artstation.com/p/assets/images/002.png",
        "https://cdn.artstation.com/p/assets/videos/clip.mp4",
    ]
    mock_job.data_meta = [
        {
            "extension": "jpg",
            "width": 1920,
            "height": 1080,
            "filesize": 1024000,
            "title": "Concept 1",
        },
        {"extension": "png", "width": 3840, "height": 2160, "filesize": 4096000},
        {
            "extension": "mp4",
            "width": 1280,
            "height": 720,
            "filesize": 8192000,
            "title": "Animation",
        },
    ]
    mock_job.data_post = [
        {"title": "Sci-Fi Environment Design", "author": "concept_artist_99"}
    ]

    with (
        patch("gallery_dl.extractor.find", return_value=mock_extractor),
        patch("xakumedia.extractors.gallery.DataJob", return_value=mock_job),
    ):
        classified, items = extract_gallery_info("https://www.artstation.com/artwork/sample")

    assert classified.category == UrlCategory.GALLERY
    assert classified.platform == "artstation"
    assert classified.author_hint == "concept_artist_99"
    assert classified.title_hint == "Sci-Fi Environment Design"
    assert len(items) == 3

    # Check item 1 (Image)
    assert items[0].media_type == MediaType.IMAGE
    assert items[0].title == "Concept 1"
    assert items[0].author == "concept_artist_99"
    assert items[0].width == 1920
    assert items[0].height == 1080
    assert items[0].available_formats[0].container == "jpg"
    assert items[0].metadata_extra["gallery_index"] == 1
    assert items[0].metadata_extra["gallery_total"] == 3

    # Check item 2 (PNG auto-titled with album title)
    assert items[1].media_type == MediaType.IMAGE
    assert items[1].title == "Sci-Fi Environment Design - 2"
    assert items[1].width == 3840
    assert items[1].available_formats[0].container == "png"

    # Check item 3 (Video)
    assert items[2].media_type == MediaType.VIDEO
    assert items[2].title == "Animation"
    assert items[2].available_formats[0].container == "mp4"


def test_extract_gallery_empty_results() -> None:
    """Ensure MediaUnavailableError is raised if a gallery extractor returns 0 items."""
    mock_extractor = MagicMock()
    mock_job = MagicMock()
    mock_job.exception = None
    mock_job.data_urls = []
    mock_job.data_meta = []
    mock_job.data_post = []

    with (
        patch("gallery_dl.extractor.find", return_value=mock_extractor),
        patch("xakumedia.extractors.gallery.DataJob", return_value=mock_job),
    ):
        with pytest.raises(MediaUnavailableError):
            extract_gallery_info("https://imgur.com/gallery/empty123")


def test_extract_gallery_job_exception() -> None:
    """Ensure exceptions stored on DataJob are converted and raised."""
    mock_extractor = MagicMock()
    mock_job = MagicMock()
    mock_job.exception = AuthenticationError("Members only post")

    with (
        patch("gallery_dl.extractor.find", return_value=mock_extractor),
        patch("xakumedia.extractors.gallery.DataJob", return_value=mock_job),
    ):
        with pytest.raises(PrivateMediaError):
            extract_gallery_info("https://example.com/gallery/secret")


def test_dispatcher_extract_gallery_rpc() -> None:
    """Verify that extract_gallery is registered and callable via RPC dispatcher."""
    dispatcher = RpcDispatcher()

    mock_extractor = MagicMock()
    mock_extractor.category = "imgur"

    mock_job = MagicMock()
    mock_job.exception = None
    mock_job.data_urls = ["https://i.imgur.com/pic1.jpg", "https://i.imgur.com/pic2.jpg"]
    mock_job.data_meta = [{"extension": "jpg"}, {"extension": "jpg"}]
    mock_job.data_post = [{"title": "Album Demo", "author": "photographer"}]

    with (
        patch("gallery_dl.extractor.find", return_value=mock_extractor),
        patch("xakumedia.extractors.gallery.DataJob", return_value=mock_job),
    ):
        req = JsonRpcRequest(
            id="test-gal-1",
            method="extract_gallery",
            params={"url": "https://imgur.com/gallery/mock1"},
        )
        res = dispatcher.dispatch(req)

    assert res.error is None
    assert res.result is not None
    assert res.result["classified_url"]["category"] == "gallery"
    assert len(res.result["media_items"]) == 2
    assert res.result["media_item"]["title"] == "Album Demo - 1"
