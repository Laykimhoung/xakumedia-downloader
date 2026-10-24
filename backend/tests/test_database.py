"""Unit tests for SQLite database schema, connections, and repository layer."""

from pathlib import Path

import pytest

from xakumedia.db.connection import get_db_connection, get_db_session
from xakumedia.db.repository import MediaRepository
from xakumedia.db.schema import get_current_version, init_schema
from xakumedia.models.media import MediaFormatInfo, MediaItem, MediaType
from xakumedia.models.queue import DownloadTask, TaskStatus
from xakumedia.models.url import ClassifiedUrl, UrlCategory
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest


@pytest.fixture
def temp_db(tmp_path: Path) -> Path:
    """Create a temporary sqlite database path for isolated test execution."""
    return tmp_path / "test_xakumedia.db"


@pytest.fixture
def repo(temp_db: Path) -> MediaRepository:
    """Instantiate MediaRepository against an isolated temporary database."""
    return MediaRepository(temp_db)


def test_schema_initialization(temp_db: Path) -> None:
    """Verify that init_schema creates all tables and sets schema version to 2."""
    conn = get_db_connection(temp_db)
    try:
        init_schema(conn)
        assert get_current_version(conn) == 2

        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}

        expected_tables = {
            "schema_version",
            "scan_history",
            "media_items",
            "scan_history_items",
            "download_tasks",
            "app_preferences",
            "cookie_profiles",
            "domain_headers",
        }
        assert expected_tables.issubset(tables)
    finally:
        conn.close()


def test_connection_pragmas(temp_db: Path) -> None:
    """Verify performance and foreign key pragmas on new connections."""
    conn = get_db_connection(temp_db)
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys")
        assert cursor.fetchone()[0] == 1

        cursor.execute("PRAGMA journal_mode")
        assert cursor.fetchone()[0].lower() == "wal"
    finally:
        conn.close()


def test_session_rollback_on_error(temp_db: Path) -> None:
    """Verify that get_db_session rolls back uncommitted changes on exceptions."""
    conn = get_db_connection(temp_db)
    init_schema(conn)
    conn.close()

    with pytest.raises(RuntimeError):
        with get_db_session(temp_db) as s:
            s.execute(
                "INSERT INTO app_preferences (key, value) VALUES ('test_key', 'test_val')"
            )
            raise RuntimeError("Forced error inside transaction")

    with get_db_session(temp_db) as s:
        cursor = s.execute("SELECT value FROM app_preferences WHERE key = 'test_key'")
        assert cursor.fetchone() is None


def test_save_and_query_scan_history(repo: MediaRepository) -> None:
    """Verify saving scan events and reconstructing items from history."""
    classified = ClassifiedUrl(
        raw_url="https://example.com/gallery/art123",
        normalized_url="https://example.com/gallery/art123",
        category=UrlCategory.GALLERY,
        platform="portfolio",
        domain="example.com",
        title_hint="Cyberpunk City",
        author_hint="artist_neo",
        is_supported=True,
    )

    item1 = MediaItem(
        source_url="https://example.com/gallery/art123",
        media_type=MediaType.IMAGE,
        title="Cyberpunk City - 1",
        author="artist_neo",
        thumbnail_url="https://example.com/thumb1.jpg",
        original_url="https://example.com/img1.jpg",
        width=1920,
        height=1080,
        available_formats=[
            MediaFormatInfo(format_id="orig", container="jpg", width=1920, height=1080)
        ],
    )
    item2 = MediaItem(
        source_url="https://example.com/gallery/art123",
        media_type=MediaType.IMAGE,
        title="Cyberpunk City - 2",
        author="artist_neo",
        thumbnail_url="https://example.com/thumb2.jpg",
        original_url="https://example.com/img2.jpg",
        width=2560,
        height=1440,
    )

    scan_id = repo.save_scan_result(classified, [item1, item2])
    assert scan_id is not None

    history = repo.get_scan_history(limit=10)
    assert len(history) == 1
    assert history[0]["id"] == scan_id
    assert history[0]["domain"] == "example.com"
    assert history[0]["item_count"] == 2
    assert history[0]["title_hint"] == "Cyberpunk City"
    assert history[0]["preview_thumbnail"] == "https://example.com/thumb1.jpg"

    scan_items = repo.get_scan_items(scan_id)
    assert len(scan_items) == 2
    assert scan_items[0].title == "Cyberpunk City - 1"
    assert scan_items[0].width == 1920
    assert scan_items[1].height == 1440


def test_clear_scan_history(repo: MediaRepository) -> None:
    """Verify clearing single scan events vs full history wipe."""
    classified = ClassifiedUrl(
        raw_url="https://test.com/img.jpg",
        normalized_url="https://test.com/img.jpg",
        category=UrlCategory.DIRECT_IMAGE,
    )
    item = MediaItem(
        source_url="https://test.com/img.jpg",
        media_type=MediaType.IMAGE,
        original_url="https://test.com/img.jpg",
    )
    scan_id = repo.save_scan_result(classified, [item])

    assert len(repo.get_scan_history()) == 1
    deleted = repo.clear_scan_history(scan_id)
    assert deleted == 1
    assert len(repo.get_scan_history()) == 0


def test_saved_media_library(repo: MediaRepository) -> None:
    """Verify bookmarking, querying, toggling, and deleting saved media items."""
    item = MediaItem(
        source_url="https://example.com/clip.mp4",
        media_type=MediaType.VIDEO,
        title="Nature Clip",
        author="videographer",
        original_url="https://example.com/clip.mp4",
        duration_seconds=42.5,
    )

    repo.save_media_item(item, is_saved=True)
    saved_items = repo.get_saved_media()
    assert len(saved_items) == 1
    assert saved_items[0].title == "Nature Clip"

    # Toggle to un-saved
    new_state = repo.toggle_save_media(item.id)
    assert new_state is False
    assert len(repo.get_saved_media()) == 0

    # Toggle back to saved
    new_state = repo.toggle_save_media(item.id)
    assert new_state is True
    assert len(repo.get_saved_media()) == 1

    # Delete
    deleted = repo.delete_media_item(item.id)
    assert deleted is True
    assert len(repo.get_saved_media()) == 0


def test_download_task_persistence(repo: MediaRepository) -> None:
    """Verify persisting and querying download queue tasks."""
    media = MediaItem(
        source_url="https://example.com/song.mp3",
        media_type=MediaType.AUDIO,
        title="Soundtrack",
        original_url="https://example.com/song.mp3",
    )
    task = DownloadTask(
        media_item=media,
        status=TaskStatus.QUEUED,
        bytes_downloaded=5000,
        total_bytes=10000,
        progress_percent=50.0,
    )

    repo.save_download_task(task)
    tasks = repo.get_download_tasks(status=TaskStatus.QUEUED)
    assert len(tasks) == 1
    assert tasks[0].id == task.id
    assert tasks[0].media_item.title == "Soundtrack"
    assert tasks[0].progress_percent == 50.0


def test_dispatcher_database_rpc(temp_db: Path) -> None:
    """Verify JSON-RPC database handler registration and execution."""
    custom_repo = MediaRepository(temp_db)
    dispatcher = RpcDispatcher()

    # Pre-populate a saved media item using custom repo
    media = MediaItem(
        source_url="https://test.com/photo.png",
        media_type=MediaType.IMAGE,
        title="Wallpaper",
        original_url="https://test.com/photo.png",
    )
    custom_repo.save_media_item(media, is_saved=True)

    # Dispatch get_saved_media using monkeypatched default_repository
    import xakumedia.db as db_mod

    original_repo = db_mod.default_repository
    db_mod.default_repository = custom_repo

    try:
        req = JsonRpcRequest(
            id="test-db-1",
            method="get_saved_media",
            params={},
        )
        res = dispatcher.dispatch(req)
        assert res.error is None
        assert res.result is not None
        assert res.result["count"] == 1
        assert res.result["items"][0]["title"] == "Wallpaper"

        # Test toggle_save_media
        toggle_req = JsonRpcRequest(
            id="test-db-2",
            method="toggle_save_media",
            params={"media_id": media.id},
        )
        toggle_res = dispatcher.dispatch(toggle_req)
        assert toggle_res.result["is_saved"] is False

        # Test get_scan_history
        hist_req = JsonRpcRequest(
            id="test-db-3",
            method="get_scan_history",
            params={"limit": 10},
        )
        hist_res = dispatcher.dispatch(hist_req)
        assert hist_res.error is None
        assert "items" in hist_res.result
    finally:
        db_mod.default_repository = original_repo
