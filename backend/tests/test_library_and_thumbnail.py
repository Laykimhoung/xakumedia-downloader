"""Unit tests for media library search/filter/export and thumbnail generation/caching."""

import subprocess
import uuid
from pathlib import Path

import pytest
from PIL import Image

from xakumedia.db.repository import MediaRepository
from xakumedia.models.media import MediaFormatInfo, MediaItem, MediaType
from xakumedia.models.queue import DownloadTask, TaskStatus
from xakumedia.processor.ffmpeg import find_ffmpeg
from xakumedia.processor.thumbnail import (
    generate_image_thumbnail,
    generate_media_thumbnail,
    generate_video_thumbnail,
    get_cached_thumbnail_path,
)
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest


@pytest.fixture
def repo(tmp_path: Path) -> MediaRepository:
    """Provide a fresh isolated SQLite MediaRepository."""
    db_file = tmp_path / "test_library.db"
    return MediaRepository(db_path=db_file)


@pytest.fixture
def sample_image_file(tmp_path: Path) -> Path:
    """Generate a 800x600 test JPEG image."""
    img_path = tmp_path / "test_hires.jpg"
    img = Image.new("RGB", (800, 600), color=(220, 50, 50))
    img.save(img_path, format="JPEG")
    return img_path


@pytest.fixture
def sample_video_file(tmp_path: Path) -> Path:
    """Generate a 1-second 320x240 synthetic test video using FFmpeg."""
    ffmpeg_bin = find_ffmpeg()
    if not ffmpeg_bin:
        pytest.skip("FFmpeg not available on system")

    v_path = tmp_path / "test_short.mp4"
    cmd = [
        str(ffmpeg_bin),
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=1:size=320x240:rate=10",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(v_path),
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return v_path


def test_generate_image_thumbnail(sample_image_file: Path, tmp_path: Path):
    """Verify that Pillow generates a downscaled WebP thumbnail."""
    out_thumb = tmp_path / "thumb.webp"
    result = generate_image_thumbnail(sample_image_file, out_thumb, max_size=(200, 200))

    assert result.is_file()
    assert result.stat().st_size > 0

    with Image.open(result) as thumb:
        assert thumb.format == "WEBP"
        assert thumb.width <= 200
        assert thumb.height <= 200


def test_generate_video_thumbnail(sample_video_file: Path, tmp_path: Path):
    """Verify that FFmpeg extracts a video keyframe as a WebP thumbnail."""
    out_thumb = tmp_path / "v_thumb.webp"
    result = generate_video_thumbnail(
        sample_video_file, out_thumb, timestamp_sec=0.5, max_width=240
    )

    assert result.is_file()
    assert result.stat().st_size > 0

    with Image.open(result) as thumb:
        assert thumb.format == "WEBP"
        assert thumb.width <= 240


def test_generate_media_thumbnail_caching(sample_image_file: Path):
    """Verify that generate_media_thumbnail returns cached=True on repeat calls."""
    item_id = f"test-item-{uuid.uuid4()}"
    cached_path = get_cached_thumbnail_path(item_id)
    cached_path.unlink(missing_ok=True)

    # First call - generated fresh
    res1 = generate_media_thumbnail(sample_image_file, item_id=item_id, media_type="image")
    assert res1["cached"] is False
    assert Path(res1["thumbnail_path"]).is_file()

    # Second call - served from cache
    res2 = generate_media_thumbnail(sample_image_file, item_id=item_id, media_type="image")
    assert res2["cached"] is True
    assert res2["thumbnail_path"] == res1["thumbnail_path"]

    # Cleanup
    cached_path.unlink(missing_ok=True)


def test_query_saved_media_filtering_and_sorting(repo: MediaRepository):
    """Test searching, filtering by media type & container, and sorting in media library."""
    item1 = MediaItem(
        id="item-cyber-vdo",
        source_url="https://example.com/cyberpunk",
        original_url="https://example.com/cyberpunk.mp4",
        media_type=MediaType.VIDEO,
        title="Cyberpunk 2077 Night City",
        author="CDPR",
        filesize_bytes=50000000,
        available_formats=[MediaFormatInfo(format_id="1080p", container="mp4")],
    )
    item2 = MediaItem(
        id="item-anime-img",
        source_url="https://example.com/art/anime",
        original_url="https://example.com/art/anime.png",
        media_type=MediaType.IMAGE,
        title="Anime Landscape Sunset",
        author="Makoto",
        filesize_bytes=2000000,
        available_formats=[MediaFormatInfo(format_id="orig", container="png")],
    )
    item3 = MediaItem(
        id="item-nature-vdo",
        source_url="https://example.com/nature",
        original_url="https://example.com/nature.webm",
        media_type=MediaType.VIDEO,
        title="Deep Forest Waterfall",
        author="NatureGeek",
        filesize_bytes=100000000,
        available_formats=[MediaFormatInfo(format_id="4k", container="webm")],
    )

    repo.save_media_item(item1, is_saved=True)
    repo.save_media_item(item2, is_saved=True)
    repo.save_media_item(item3, is_saved=True)

    # 1. Search by query 'cyber'
    res_search = repo.query_saved_media(query="cyber")
    assert len(res_search) == 1
    assert res_search[0].id == "item-cyber-vdo"

    # 2. Filter by media_type 'image'
    res_type = repo.query_saved_media(media_type="image")
    assert len(res_type) == 1
    assert res_type[0].id == "item-anime-img"

    # 3. Filter by container 'webm'
    res_container = repo.query_saved_media(container="webm")
    assert len(res_container) == 1
    assert res_container[0].id == "item-nature-vdo"

    # 4. Sort by size descending
    res_size_desc = repo.query_saved_media(sort_by="size_desc")
    assert len(res_size_desc) == 3
    assert res_size_desc[0].id == "item-nature-vdo"  # 100MB
    assert res_size_desc[1].id == "item-cyber-vdo"   # 50MB
    assert res_size_desc[2].id == "item-anime-img"   # 2MB


def test_export_media_metadata(repo: MediaRepository, tmp_path: Path):
    """Verify exporting comprehensive media metadata and download task info."""
    item = MediaItem(
        id="item-meta-test",
        source_url="https://example.com/art/wallpaper",
        original_url="https://example.com/art/wallpaper.jpg",
        media_type=MediaType.IMAGE,
        title="Nebula Galaxy",
        author="AstroArtist",
        filesize_bytes=4500000,
        available_formats=[MediaFormatInfo(format_id="orig", container="jpg")],
    )
    repo.save_media_item(item, is_saved=True)

    task = DownloadTask(
        id="task-meta-test",
        media_item=item,
        status=TaskStatus.COMPLETED,
        destination_path=str(tmp_path / "nebula.jpg"),
    )
    repo.save_download_task(task)

    exported = repo.export_media_metadata(item.id)
    assert exported["media_item"]["title"] == "Nebula Galaxy"
    assert exported["media_item"]["author"] == "AstroArtist"
    assert exported["download_task"] is not None
    assert exported["download_task"]["status"] == "completed"
    assert "exported_at" in exported


def test_delete_downloaded_media(repo: MediaRepository, tmp_path: Path):
    """Verify deleting download task record and removing actual file from disk."""
    dummy_file = tmp_path / "to_delete.mp4"
    dummy_file.write_bytes(b"dummy video data")

    item = MediaItem(
        id="item-del-test",
        source_url="https://example.com/del",
        original_url="https://example.com/del.mp4",
        media_type=MediaType.VIDEO,
        title="Delete Me",
        author="Tester",
    )
    task = DownloadTask(
        id="task-del-test",
        media_item=item,
        status=TaskStatus.COMPLETED,
        destination_path=str(dummy_file),
    )
    repo.save_download_task(task)

    assert dummy_file.exists()

    result = repo.delete_downloaded_media(task.id, delete_file_from_disk=True)
    assert result["deleted"] is True
    assert result["file_deleted"] is True
    assert not dummy_file.exists()


def test_dispatcher_library_and_thumbnail_rpcs(repo: MediaRepository, sample_image_file: Path):
    """Verify new RPC handlers in RpcDispatcher."""
    dispatcher = RpcDispatcher(repository=repo)

    # 1. Test generate_thumbnail RPC
    req1 = JsonRpcRequest(
        id=1,
        method="generate_thumbnail",
        params={
            "source_path": str(sample_image_file),
            "item_id": "rpc-test-thumb",
            "media_type": "image",
        },
    )
    resp1 = dispatcher.dispatch(req1)
    assert resp1.error is None
    assert "thumbnail_path" in resp1.result

    # 2. Test query_saved_media RPC
    item = MediaItem(
        id="item-rpc-query",
        source_url="https://example.com/rpc",
        original_url="https://example.com/rpc.jpg",
        media_type=MediaType.IMAGE,
        title="RPC Image Title",
        author="RPC Author",
    )
    repo.save_media_item(item, is_saved=True)

    req2 = JsonRpcRequest(
        id=2,
        method="query_saved_media",
        params={"query": "RPC Image"},
    )
    resp2 = dispatcher.dispatch(req2)
    assert resp2.error is None
    assert resp2.result["count"] == 1
    assert resp2.result["items"][0]["title"] == "RPC Image Title"

    # 3. Test export_media_metadata RPC
    req3 = JsonRpcRequest(
        id=3,
        method="export_media_metadata",
        params={"media_id": "item-rpc-query"},
    )
    resp3 = dispatcher.dispatch(req3)
    assert resp3.error is None
    assert resp3.result["media_item"]["id"] == "item-rpc-query"
