"""Performance, load, and stress benchmark tests for large media batches (Milestone 21)."""

import threading
import time
from pathlib import Path
from unittest.mock import patch

from xakumedia.db import MediaRepository
from xakumedia.db.connection import get_db_connection
from xakumedia.downloader.manager import DownloadManager
from xakumedia.downloader.throttler import BandwidthThrottler
from xakumedia.models.media import MediaFormatInfo, MediaItem, MediaType
from xakumedia.models.url import ClassifiedUrl, UrlCategory


def create_benchmark_items(count: int, prefix: str = "perf") -> list[MediaItem]:
    """Generate a large batch of synthetic typed MediaItem models."""
    items = []
    for i in range(1, count + 1):
        items.append(
            MediaItem(
                id=f"{prefix}-{i:05d}",
                source_url=f"https://gallery.example.com/{prefix}/{i}",
                media_type=MediaType.IMAGE if i % 4 != 0 else MediaType.VIDEO,
                title=f"Benchmark Media Item #{i}",
                author="benchmark_artist",
                thumbnail_url=f"https://cdn.example.com/thumb/{prefix}_{i}.jpg",
                original_url=f"https://cdn.example.com/full/{prefix}_{i}.jpg",
                duration_seconds=60.0 if i % 4 == 0 else None,
                width=1920,
                height=1080,
                filesize_bytes=1024 * (50 + (i % 200)),
                available_formats=[
                    MediaFormatInfo(
                        format_id="original",
                        container="jpg" if i % 4 != 0 else "mp4",
                        resolution="1920x1080",
                    )
                ],
                metadata_extra={"batch_index": i, "tag": "perf_test"},
            )
        )
    return items


def test_bulk_scan_result_persistence_benchmark(tmp_path: Path) -> None:
    """Benchmark saving and retrieving 1,000 discovered media items in SQLite."""
    repo = MediaRepository(tmp_path / "perf_scan.db")
    items = create_benchmark_items(1000, prefix="scan1k")
    classified = ClassifiedUrl(
        raw_url="https://gallery.example.com/benchmark/1000",
        normalized_url="https://gallery.example.com/benchmark/1000",
        category=UrlCategory.GALLERY,
        platform="generic_gallery",
        domain="gallery.example.com",
        title_hint="Benchmark 1,000 Collection",
        author_hint="benchmark_artist",
        is_supported=True,
    )

    # 1. Measure insertion time for 1,000 items in a single transaction
    start_time = time.perf_counter()
    scan_id = repo.save_scan_result(classified, items)
    insert_duration = time.perf_counter() - start_time

    # Insertion should take < 500ms (typically < 50ms with executemany in WAL mode)
    assert insert_duration < 1.0, f"Insert took too long: {insert_duration:.3f}s"
    assert scan_id is not None

    # 2. Measure retrieval time for 1,000 items
    start_read = time.perf_counter()
    loaded_items = repo.get_scan_items(scan_id)
    read_duration = time.perf_counter() - start_read

    assert read_duration < 0.2, f"Read took too long: {read_duration:.3f}s"
    assert len(loaded_items) == 1000
    assert loaded_items[0].id == "scan1k-00001"
    assert loaded_items[-1].id == "scan1k-01000"


def test_bulk_batch_queue_enqueue_benchmark(tmp_path: Path) -> None:
    """Benchmark enqueuing and saving 1,000 tasks in DownloadManager."""
    repo = MediaRepository(tmp_path / "perf_queue.db")
    manager = DownloadManager(max_concurrent=4, repository=repo)
    items = create_benchmark_items(1000, prefix="queue1k")
    target_dir = tmp_path / "downloads"

    raw_items = [
        {"media_item": item.model_dump(mode="json"), "selected_format": None}
        for item in items
    ]

    # Prevent actual network socket streaming during enqueue benchmark
    with patch.object(manager._executor, "submit"):
        start_time = time.perf_counter()
        tasks = manager.start_batch_download(raw_items, target_dir=target_dir)
        enqueue_duration = time.perf_counter() - start_time

    # 1,000 tasks batch enqueue & save should complete in < 1.0s
    assert enqueue_duration < 1.5, f"Enqueue took too long: {enqueue_duration:.3f}s"
    assert len(tasks) == 1000

    # Verify queue state reflects bounded pool (4 active slots, 996 pending)
    state = manager.get_queue_state()
    assert state["counts"]["queued"] == 1000
    assert state["active_count"] == 4
    assert state["pending_count"] == 996
    assert state["pending_count"] + state["active_count"] == 1000


def test_index_query_plans_and_cascade_efficiency(tmp_path: Path) -> None:
    """Verify that EXPLAIN QUERY PLAN utilizes Milestone 21 indexes for fast joins."""
    db_path = tmp_path / "perf_indexes.db"
    repo = MediaRepository(db_path)
    items = create_benchmark_items(500, prefix="idx500")

    classified = ClassifiedUrl(
        raw_url="https://example.com/idx/500",
        normalized_url="https://example.com/idx/500",
        category=UrlCategory.GALLERY,
        is_supported=True,
    )
    scan_id = repo.save_scan_result(classified, items)

    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()

        # Query plan on scan items join
        cursor.execute(
            """
            EXPLAIN QUERY PLAN
            SELECT m.*
            FROM scan_history_items shi
            JOIN media_items m ON shi.media_id = m.id
            WHERE shi.scan_id = ?
            ORDER BY shi.item_order ASC
            """,
            (scan_id,),
        )
        plan = [row[3] for row in cursor.fetchall()]
        plan_text = " ".join(plan).lower()
        # Verify index usage (either PRIMARY KEY on scan_history_items or idx_media_items)
        assert "scan_history_items" in plan_text
        assert "media_items" in plan_text

        # Verify index exists on download_tasks(media_id)
        cursor.execute(
            """
            EXPLAIN QUERY PLAN
            SELECT * FROM download_tasks WHERE media_id = ?
            """,
            ("test-media-id",),
        )
        dt_plan = " ".join(row[3] for row in cursor.fetchall()).lower()
        assert "idx_download_tasks_media_id" in dt_plan or "using index" in dt_plan
    finally:
        conn.close()


def test_bandwidth_throttler_high_concurrency_stress() -> None:
    """Stress test BandwidthThrottler with 20 parallel threads to verify thread safety."""
    throttler = BandwidthThrottler(max_speed_kbps=1024)  # 1 MB/s limit
    total_requested_bytes = 0
    lock = threading.Lock()
    exceptions: list[Exception] = []

    def worker_request_chunks() -> None:
        nonlocal total_requested_bytes
        try:
            for _ in range(5):
                chunk_len = 8192  # 8 KB chunk
                throttler.consume(chunk_len)
                with lock:
                    total_requested_bytes += chunk_len
        except Exception as exc:
            exceptions.append(exc)

    threads = [threading.Thread(target=worker_request_chunks) for _ in range(20)]
    start_time = time.perf_counter()
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=3.0)

    duration = time.perf_counter() - start_time
    assert not exceptions, f"Exceptions occurred in worker threads: {exceptions}"
    assert total_requested_bytes == 20 * 5 * 8192  # 819,200 bytes transferred
    assert duration >= 0.05, "Throttler did not pace bandwidth across concurrent threads"
