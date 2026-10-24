"""Unit tests for Saved Sources, Incremental Rescan, and differential discovery."""

from pathlib import Path
from unittest.mock import patch

import pytest

from xakumedia.db.repository import MediaRepository
from xakumedia.models.media import MediaItem, MediaType
from xakumedia.models.source import IncrementalScanResult, RescanAllSummary, SavedSource
from xakumedia.models.url import ClassifiedUrl, UrlCategory
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest
from xakumedia.sources.rescan import incremental_rescan_source, rescan_all_sources


@pytest.fixture
def temp_db(tmp_path: Path) -> Path:
    """Create a temporary database path for sources tests."""
    return tmp_path / "test_sources.db"


@pytest.fixture
def repo(temp_db: Path) -> MediaRepository:
    """Instantiate MediaRepository on isolated temp database."""
    return MediaRepository(temp_db)


def test_saved_source_model() -> None:
    source = SavedSource(
        id="src-123",
        url="https://artstation.com/artist/projects",
        title="Artist Portfolio",
        platform="artstation",
        category="gallery",
        tags=["3d", "character"],
    )
    assert source.id == "src-123"
    assert source.platform == "artstation"
    assert "3d" in source.tags
    assert source.last_item_count == 0


def test_saved_sources_repository_crud(repo: MediaRepository) -> None:
    source = SavedSource(
        id="src-1",
        url="https://youtube.com/@techchannel",
        title="Tech Reviews Channel",
        platform="youtube",
        category="channel",
        author="TechGuru",
        tags=["tech", "video"],
    )
    saved = repo.save_source(source)
    assert saved.id == "src-1"
    assert saved.title == "Tech Reviews Channel"

    # Get by ID
    retrieved = repo.get_source("src-1")
    assert retrieved is not None
    assert retrieved.url == "https://youtube.com/@techchannel"
    assert retrieved.author == "TechGuru"
    assert "video" in retrieved.tags

    # Get by URL
    by_url = repo.get_source_by_url("https://youtube.com/@techchannel")
    assert by_url is not None
    assert by_url.id == "src-1"

    # Update stats
    repo.update_source_scan_stats("src-1", 42, "2026-10-24T12:00:00Z")
    updated = repo.get_source("src-1")
    assert updated.last_item_count == 42
    assert updated.last_scanned_at == "2026-10-24T12:00:00Z"

    # List & filter by tag
    source2 = SavedSource(
        id="src-2",
        url="https://deviantart.com/animeartist",
        title="Anime Illustrations",
        platform="deviantart",
        tags=["anime", "art"],
    )
    repo.save_source(source2)

    all_sources = repo.list_saved_sources()
    assert len(all_sources) == 2

    anime_sources = repo.list_saved_sources(tag="anime")
    assert len(anime_sources) == 1
    assert anime_sources[0].id == "src-2"

    # Delete
    deleted = repo.delete_saved_source("src-1")
    assert deleted is True
    assert repo.get_source("src-1") is None
    assert len(repo.list_saved_sources()) == 1


def test_incremental_rescan_differential_discovery(repo: MediaRepository) -> None:
    source = SavedSource(
        id="src-art",
        url="https://example.com/gallery/art",
        title="Concept Art",
        platform="example",
        category="gallery",
    )
    repo.save_source(source)

    # Media items: item1 is known from earlier scan, item2 is brand new
    item1 = MediaItem(
        id="item-old-1",
        source_url="https://example.com/gallery/art/old1",
        media_type=MediaType.IMAGE,
        title="Old Item 1",
        original_url="https://cdn.example.com/old1.jpg",
    )
    item2 = MediaItem(
        id="item-new-2",
        source_url="https://example.com/gallery/art/new2",
        media_type=MediaType.IMAGE,
        title="Brand New Item 2",
        original_url="https://cdn.example.com/new2.jpg",
    )

    # Seed initial scan with item1 so it becomes a known item
    classified = ClassifiedUrl(
        raw_url=source.url,
        normalized_url=source.url,
        category=UrlCategory.GALLERY,
    )
    repo.save_scan_result(classified, [item1])

    # Verify item1 is known
    known = repo.get_known_item_urls_for_source(source.url)
    assert item1.original_url in known

    # Mock scan_source_url returning both item1 (existing) and item2 (new)
    with patch(
        "xakumedia.sources.rescan.scan_source_url",
        return_value=(classified, [item1, item2]),
    ):
        result: IncrementalScanResult = incremental_rescan_source(source, repository=repo)

        assert result.total_found == 2
        assert result.new_item_count == 1
        assert len(result.new_items) == 1
        assert result.new_items[0].id == "item-new-2"
        assert len(result.existing_items) == 1
        assert result.existing_items[0].id == "item-old-1"
        assert result.source.last_item_count == 2


def test_rescan_all_sources(repo: MediaRepository) -> None:
    s1 = SavedSource(
        id="s1",
        url="https://example.com/feed1",
        title="Feed 1",
    )
    s2 = SavedSource(
        id="s2",
        url="https://example.com/feed2",
        title="Feed 2",
    )
    repo.save_source(s1)
    repo.save_source(s2)

    item = MediaItem(
        id="item-x",
        source_url="https://example.com/item_x",
        media_type=MediaType.IMAGE,
        original_url="https://cdn.example.com/x.jpg",
    )
    classified = ClassifiedUrl(
        raw_url="https://example.com/feed",
        normalized_url="https://example.com/feed",
        category=UrlCategory.GALLERY,
    )

    with patch(
        "xakumedia.sources.rescan.scan_source_url",
        return_value=(classified, [item]),
    ):
        summary: RescanAllSummary = rescan_all_sources(repository=repo)
        assert summary.sources_checked == 2
        assert summary.total_items_found == 2
        assert summary.total_new_items == 2
        assert len(summary.results) == 2


def test_dispatcher_source_endpoints(repo: MediaRepository) -> None:
    dispatcher = RpcDispatcher(repository=repo)

    # 1. save_source
    req = JsonRpcRequest(
        id="1",
        method="save_source",
        params={
            "id": "disp-src-1",
            "url": "https://artstation.com/coolartist",
            "title": "Cool Artist",
            "platform": "artstation",
            "tags": ["concept", "mecha"],
        },
    )
    res = dispatcher.dispatch(req)
    assert res.error is None
    assert res.result["source"]["id"] == "disp-src-1"
    assert res.result["source"]["title"] == "Cool Artist"

    # 2. get_saved_sources
    req = JsonRpcRequest(id="2", method="get_saved_sources")
    res = dispatcher.dispatch(req)
    assert res.error is None
    assert res.result["count"] == 1
    assert res.result["sources"][0]["id"] == "disp-src-1"

    # 3. get_source
    req = JsonRpcRequest(id="3", method="get_source", params={"source_id": "disp-src-1"})
    res = dispatcher.dispatch(req)
    assert res.error is None
    assert res.result["source"]["title"] == "Cool Artist"

    # 4. rescan_source (mocked)
    item = MediaItem(
        id="item-art-1",
        source_url="https://artstation.com/coolartist/artwork1",
        media_type=MediaType.IMAGE,
        original_url="https://cdn.artstation.com/img1.jpg",
    )
    classified = ClassifiedUrl(
        raw_url="https://artstation.com/coolartist",
        normalized_url="https://artstation.com/coolartist",
        category=UrlCategory.GALLERY,
    )

    with patch(
        "xakumedia.sources.rescan.scan_source_url",
        return_value=(classified, [item]),
    ):
        req = JsonRpcRequest(id="4", method="rescan_source", params={"source_id": "disp-src-1"})
        res = dispatcher.dispatch(req)
        assert res.error is None
        assert res.result["result"]["new_item_count"] == 1
        assert res.result["result"]["total_found"] == 1

    # 5. delete_saved_source
    req = JsonRpcRequest(
        id="5",
        method="delete_saved_source",
        params={"source_id": "disp-src-1"},
    )
    res = dispatcher.dispatch(req)
    assert res.error is None
    assert res.result["deleted"] is True
