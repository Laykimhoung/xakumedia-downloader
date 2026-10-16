"""Unit tests for the yt-dlp video extractor adapter and format normalizer."""

from unittest.mock import MagicMock, patch

import pytest

from xakumedia.exceptions.base import (
    DRMProtectedError,
    MediaUnavailableError,
    PrivateMediaError,
    RateLimitError,
    SSRFBlockedError,
    UnsupportedSourceError,
)
from xakumedia.extractors.video import (
    extract_video_info,
    normalize_formats,
    parse_yt_dlp_error,
)
from xakumedia.models.media import MediaType
from xakumedia.models.url import UrlCategory


def test_normalize_formats() -> None:
    raw_formats = [
        {
            "format_id": "sb0",
            "format_note": "storyboard",
            "vcodec": "none",
            "acodec": "none",
        },
        {
            "format_id": "137",
            "ext": "mp4",
            "height": 1080,
            "width": 1920,
            "fps": 30,
            "vcodec": "avc1.640028",
            "acodec": "none",  # Video only -> requires_merge True
            "filesize": 45000000,
            "url": "https://video.example.com/1080p.mp4",
        },
        {
            "format_id": "22",
            "ext": "mp4",
            "height": 720,
            "width": 1280,
            "fps": 30,
            "vcodec": "avc1.4d401f",
            "acodec": "mp4a.40.2",  # Video + Audio -> requires_merge False
            "filesize": 25000000,
            "url": "https://video.example.com/720p.mp4",
        },
        {
            "format_id": "140",
            "ext": "m4a",
            "height": None,
            "width": None,
            "vcodec": "none",
            "acodec": "mp4a.40.2",  # Audio only
            "filesize": 5000000,
            "url": "https://video.example.com/audio.m4a",
        },
    ]

    formats = normalize_formats(raw_formats)

    # Storyboard should be filtered out
    assert len(formats) == 3

    # Sorted by resolution: 1080p first, then 720p, then audio
    assert formats[0].format_id == "137"
    assert formats[0].height == 1080
    assert formats[0].resolution == "1080p"
    assert formats[0].requires_merge is True
    assert formats[0].is_direct_stream is False

    assert formats[1].format_id == "22"
    assert formats[1].height == 720
    assert formats[1].requires_merge is False
    assert formats[1].is_direct_stream is True

    assert formats[2].format_id == "140"
    assert formats[2].audio_codec == "mp4a.40.2"


def test_parse_yt_dlp_errors() -> None:
    url = "https://example.com/video"

    err = parse_yt_dlp_error("Private video. Sign in if you've been granted access", url)
    assert isinstance(err, PrivateMediaError)

    err = parse_yt_dlp_error("Video unavailable. This video has been removed", url)
    assert isinstance(err, MediaUnavailableError)

    err = parse_yt_dlp_error("HTTP Error 429: Too Many Requests", url)
    assert isinstance(err, RateLimitError)

    err = parse_yt_dlp_error("This video is DRM protected and cannot be extracted", url)
    assert isinstance(err, DRMProtectedError)

    err = parse_yt_dlp_error("Unsupported URL: https://example.com/unknown", url)
    assert isinstance(err, UnsupportedSourceError)


def test_extract_video_info_mocked() -> None:
    sample_info = {
        "id": "dQw4w9WgXcQ",
        "title": "Never Gonna Give You Up",
        "uploader": "Rick Astley",
        "uploader_id": "RickAstleyVEVO",
        "channel": "Rick Astley",
        "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        "duration": 213,
        "width": 1920,
        "height": 1080,
        "webpage_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "extractor_key": "Youtube",
        "view_count": 1500000000,
        "formats": [
            {
                "format_id": "22",
                "ext": "mp4",
                "height": 720,
                "width": 1280,
                "fps": 30,
                "vcodec": "avc1.4d401f",
                "acodec": "mp4a.40.2",
                "filesize": 35000000,
                "url": "https://googlevideo.example.com/videoplayback",
            }
        ],
    }

    mock_ydl_instance = MagicMock()
    mock_ydl_instance.extract_info.return_value = sample_info

    with (
        patch("yt_dlp.YoutubeDL") as mock_ydl_cls,
        patch("socket.getaddrinfo", return_value=[(2, 1, 0, "", ("142.250.190.46", 80))]),
    ):
        mock_ydl_cls.return_value.__enter__.return_value = mock_ydl_instance

        classified, item = extract_video_info("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        assert classified.is_supported is True
        assert classified.category == UrlCategory.DIRECT_VIDEO
        assert classified.platform == "Youtube"
        assert classified.author_hint == "Rick Astley"
        assert classified.title_hint == "Never Gonna Give You Up"

        assert item.media_type == MediaType.VIDEO
        assert item.title == "Never Gonna Give You Up"
        assert item.author == "Rick Astley"
        assert item.duration_seconds == 213.0
        assert item.width == 1920
        assert item.height == 1080
        assert len(item.available_formats) == 1
        assert item.available_formats[0].format_id == "22"
        assert item.available_formats[0].resolution == "720p"


def test_extract_video_info_ssrf_blocked() -> None:
    with pytest.raises(SSRFBlockedError):
        extract_video_info("http://127.0.0.1/internal_video.mp4")
