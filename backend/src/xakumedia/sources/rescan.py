"""Incremental rescan service and differential media discovery for saved sources."""

from datetime import UTC, datetime

from gallery_dl import extractor as gdl_extractor

from ..core.logging import get_logger
from ..db import default_repository
from ..db.repository import MediaRepository
from ..exceptions.base import UnsupportedSourceError
from ..extractors.gallery import extract_gallery_info
from ..extractors.video import extract_video_info
from ..models.media import MediaItem
from ..models.source import IncrementalScanResult, RescanAllSummary, SavedSource
from ..models.url import ClassifiedUrl
from ..scanners.direct import classify_direct_url

logger = get_logger("sources.rescan")


def scan_source_url(url: str) -> tuple[ClassifiedUrl | None, list[MediaItem]]:
    """Scan and extract media items from a URL using direct, gallery, or video adapters."""
    classified: ClassifiedUrl | None = None
    media_items: list[MediaItem] = []

    # 1. Probe for direct media URL
    try:
        classified, direct_item = classify_direct_url(url)
        if direct_item is not None:
            media_items = [direct_item]
    except UnsupportedSourceError:
        pass

    # 2. Check gallery-dl extractor
    if not media_items:
        try:
            if gdl_extractor.find(url):
                classified, media_items = extract_gallery_info(url)
        except UnsupportedSourceError:
            pass

    # 3. Check yt-dlp platform video extractor
    if not media_items:
        try:
            classified, video_item = extract_video_info(url)
            if video_item is not None:
                media_items = [video_item]
        except Exception as exc:
            logger.warning(f"Video extraction failed for {url}: {exc}")

    return classified, media_items


def incremental_rescan_source(
    source_or_id: str | SavedSource,
    repository: MediaRepository | None = None,
) -> IncrementalScanResult:
    """Perform an incremental rescan of a saved source, distinguishing newly found items."""
    repo = repository or default_repository

    if isinstance(source_or_id, SavedSource):
        source = source_or_id
    else:
        found = repo.get_source(source_or_id)
        if not found:
            raise ValueError(f"Saved source not found: {source_or_id}")
        source = found

    logger.info(f"Starting incremental rescan for source '{source.title}' ({source.url})...")

    # Retrieve already known item URLs for this source
    known_urls = repo.get_known_item_urls_for_source(source.url)
    classified, discovered_items = scan_source_url(source.url)

    now = datetime.now(UTC).isoformat()
    new_items: list[MediaItem] = []
    existing_items: list[MediaItem] = []

    for item in discovered_items:
        is_known = (
            item.original_url in known_urls
            or item.source_url in known_urls
        )
        if is_known:
            existing_items.append(item)
        else:
            new_items.append(item)

    # Persist scan history event
    if classified and discovered_items:
        try:
            repo.save_scan_result(classified, discovered_items)
        except Exception as exc:
            logger.warning(f"Could not persist scan history during rescan: {exc}")

    # Update source statistics
    repo.update_source_scan_stats(source.id, len(discovered_items), now)
    updated_source = repo.get_source(source.id) or source

    logger.info(
        f"Incremental rescan complete for '{source.title}': "
        f"{len(discovered_items)} total found, {len(new_items)} new items."
    )

    return IncrementalScanResult(
        source=updated_source,
        total_found=len(discovered_items),
        new_items=new_items,
        existing_items=existing_items,
        new_item_count=len(new_items),
        scanned_at=now,
    )


def rescan_all_sources(
    repository: MediaRepository | None = None,
    tag: str | None = None,
) -> RescanAllSummary:
    """Perform incremental rescan across all saved sources."""
    repo = repository or default_repository
    sources = repo.list_saved_sources(tag=tag)

    summary = RescanAllSummary(sources_checked=len(sources))

    for src in sources:
        try:
            res = incremental_rescan_source(src, repository=repo)
            summary.results.append(res)
            summary.total_items_found += res.total_found
            summary.total_new_items += res.new_item_count
        except Exception as exc:
            logger.error(f"Error rescanning source {src.id} ({src.url}): {exc}")
            summary.errors[src.id] = str(exc)

    return summary
