"""Unit tests for domain models, validation, and format selection."""

from xakumedia.models.media import MediaFormatInfo, MediaItem, MediaType
from xakumedia.models.quality import VideoResolution
from xakumedia.models.queue import DownloadTask, TaskStatus
from xakumedia.models.url import ClassifiedUrl, UrlCategory


def test_media_item_creation() -> None:
    item = MediaItem(
        source_url="https://example.com/photo/123",
        media_type=MediaType.IMAGE,
        original_url="https://example.com/direct.jpg",
        title="Sample Nature Photo",
        author="nature_photographer",
        width=1920,
        height=1080,
    )

    assert item.id is not None
    assert item.author == "nature_photographer"
    assert item.dimensions_label == "1920x1080"
    assert item.media_type == MediaType.IMAGE


def test_find_best_format_selection() -> None:
    formats = [
        MediaFormatInfo(format_id="360", height=360, width=640),
        MediaFormatInfo(format_id="720", height=720, width=1280),
        MediaFormatInfo(format_id="1080", height=1080, width=1920),
        MediaFormatInfo(format_id="2160", height=2160, width=3840),
    ]

    item = MediaItem(
        source_url="https://example.com/video/456",
        media_type=MediaType.VIDEO,
        original_url="https://example.com/master.m3u8",
        available_formats=formats,
    )

    # 1. Without limit -> should return 2160p (4K)
    best_unlimited = item.find_best_format()
    assert best_unlimited is not None
    assert best_unlimited.format_id == "2160"

    # 2. With 1080p limit -> should return 1080p
    best_1080 = item.find_best_format(max_resolution=VideoResolution.RES_1080P)
    assert best_1080 is not None
    assert best_1080.format_id == "1080"

    # 3. With 720p limit -> should return 720p
    best_720 = item.find_best_format(max_resolution=VideoResolution.RES_720P)
    assert best_720 is not None
    assert best_720.format_id == "720"


def test_download_task_lifecycle() -> None:
    item = MediaItem(
        source_url="https://example.com/art/1",
        media_type=MediaType.IMAGE,
        original_url="https://example.com/art.png",
    )

    task = DownloadTask(media_item=item)
    assert task.status == TaskStatus.QUEUED
    assert not task.status.is_terminal
    assert not task.status.is_active

    task.status = TaskStatus.DOWNLOADING
    assert task.status.is_active

    from pathlib import Path

    final_file = Path("C:/downloads/images/art_img_001.png")
    task.mark_completed(final_file)

    assert task.status == TaskStatus.COMPLETED
    assert task.status.is_terminal
    assert task.progress_percent == 100.0
    assert task.destination_path == final_file
    assert task.completed_at is not None


def test_classified_url_defaults() -> None:
    classified = ClassifiedUrl(
        raw_url="https://example.com/post/99",
        normalized_url="https://example.com/post/99",
        category=UrlCategory.SOCIAL_POST,
        platform="custom",
    )

    assert classified.is_supported is True
    assert classified.requires_auth is False
    assert classified.category == UrlCategory.SOCIAL_POST
