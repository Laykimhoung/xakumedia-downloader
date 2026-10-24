"""Unit tests for batch queue orchestration, slot concurrency, and pause/resume."""

import threading
import time
from collections.abc import Generator
from pathlib import Path
from unittest.mock import patch

import pytest

from xakumedia.core.config import default_config
from xakumedia.db import MediaRepository
from xakumedia.downloader import DownloadManager
from xakumedia.exceptions import DownloadPausedError
from xakumedia.models.media import MediaItem, MediaType
from xakumedia.models.queue import TaskStatus
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest


@pytest.fixture
def temp_dest_dir(tmp_path: Path) -> Generator[Path, None, None]:
    """Provide a temporary directory authorized under default_config for download testing."""
    original_dl = default_config.download_dir
    default_config.download_dir = tmp_path / "downloads"
    default_config.ensure_directories()
    try:
        yield default_config.download_dir
    finally:
        default_config.download_dir = original_dl


@pytest.fixture
def temp_db(tmp_path: Path) -> MediaRepository:
    """Fixture providing an isolated SQLite repository."""
    db_file = tmp_path / "xakumedia_test.db"
    return MediaRepository(db_path=db_file)


def create_dummy_item(item_id: str, author: str = "creator") -> MediaItem:
    """Helper creating a sample MediaItem."""
    return MediaItem(
        id=item_id,
        source_url=f"https://example.com/gallery/{item_id}",
        media_type=MediaType.IMAGE,
        title=f"Sample Image {item_id}",
        author=author,
        thumbnail_url=f"https://cdn.example.com/thumb_{item_id}.jpg",
        original_url=f"https://cdn.example.com/img_{item_id}.jpg",
        filesize_bytes=65536,
    )


def test_batch_download_sequential_naming(
    temp_dest_dir: Path, temp_db: MediaRepository
) -> None:
    """Verify batch submission creates sequential non-colliding filenames for same author."""
    with patch("xakumedia.downloader.manager.default_repository", temp_db):
        manager = DownloadManager(max_concurrent=3)
        items = [
            {"media_item": create_dummy_item("item-1", author="art_master")},
            {"media_item": create_dummy_item("item-2", author="art_master")},
            {"media_item": create_dummy_item("item-3", author="art_master")},
        ]
        target_dir = temp_dest_dir / "images"

        with patch("xakumedia.downloader.manager.download_stream"):
            tasks = manager.start_batch_download(items=items, target_dir=target_dir)

        assert len(tasks) == 3
        destinations = [t.destination_path.name for t in tasks if t.destination_path]
        assert destinations == [
            "art_master_img_001.jpg",
            "art_master_img_002.jpg",
            "art_master_img_003.jpg",
        ]


def test_concurrency_throttling_and_scheduling(
    temp_dest_dir: Path, temp_db: MediaRepository
) -> None:
    """Verify concurrency throttling limits active tasks and schedules pending on finish."""
    with patch("xakumedia.downloader.manager.default_repository", temp_db):
        manager = DownloadManager(max_concurrent=2)

        items = [
            {"media_item": create_dummy_item(f"item-{i}", author="bulk_user")}
            for i in range(1, 6)
        ]
        target_dir = temp_dest_dir / "images"

        release_event = threading.Event()

        def slow_download(*args, **kwargs):
            release_event.wait(timeout=2.0)
            return Path(kwargs.get("destination_path") or temp_dest_dir / "dummy.jpg")

        with patch("xakumedia.downloader.manager.download_stream", side_effect=slow_download):
            manager.start_batch_download(items=items, target_dir=target_dir)
            time.sleep(0.05)

            state = manager.get_queue_state()
            assert state["max_concurrent"] == 2
            assert state["active_count"] == 2
            assert state["pending_count"] == 3

            release_event.set()
            time.sleep(0.2)

            state_after = manager.get_queue_state()
            assert state_after["pending_count"] <= 1


def test_pause_and_resume_download(temp_dest_dir: Path, temp_db: MediaRepository) -> None:
    """Verify active task can be paused preserving .part file and subsequently resumed."""
    with patch("xakumedia.downloader.manager.default_repository", temp_db):
        manager = DownloadManager(max_concurrent=2)
        item = create_dummy_item("item-pause-1", author="pauser")
        target_dir = temp_dest_dir / "images"

        paused_signaled = threading.Event()

        def pausable_stream(*args, **kwargs):
            pause_event = kwargs.get("pause_event")
            for _ in range(50):
                if pause_event and pause_event.is_set():
                    paused_signaled.set()
                    raise DownloadPausedError("Paused")
                time.sleep(0.02)
            return Path(kwargs["destination_path"])

        with patch("xakumedia.downloader.manager.download_stream", side_effect=pausable_stream):
            task = manager.start_download(
                media_item=item, destination_path=target_dir / "test.jpg"
            )
            time.sleep(0.05)

            paused = manager.pause_download(task.id)
            assert paused is True

            paused_signaled.wait(timeout=1.0)
            time.sleep(0.1)

            saved_task = temp_db.get_download_task(task.id)
            assert saved_task is not None
            assert saved_task.status == TaskStatus.PAUSED

            resumed = manager.resume_download(task.id)
            assert resumed is True

            state = manager.get_queue_state()
            assert state["active_count"] >= 1 or state["pending_count"] >= 1


def test_pause_all_and_resume_all(temp_dest_dir: Path, temp_db: MediaRepository) -> None:
    """Verify pause_all pauses all active/pending tasks and resume_all re-enqueues them."""
    with patch("xakumedia.downloader.manager.default_repository", temp_db):
        manager = DownloadManager(max_concurrent=2)
        items = [{"media_item": create_dummy_item(f"pause-all-{i}")} for i in range(1, 4)]

        def hanging_stream(*args, **kwargs):
            pause_event = kwargs.get("pause_event")
            while not (pause_event and pause_event.is_set()):
                time.sleep(0.02)
            raise DownloadPausedError("Paused all")

        with patch("xakumedia.downloader.manager.download_stream", side_effect=hanging_stream):
            manager.start_batch_download(items=items, target_dir=temp_dest_dir / "images")
            time.sleep(0.05)

            paused_count = manager.pause_all()
            assert paused_count >= 2
            time.sleep(0.1)

            tasks = temp_db.get_download_tasks(status=TaskStatus.PAUSED)
            assert len(tasks) >= 2

            with patch(
                "xakumedia.downloader.manager.download_stream",
                return_value=temp_dest_dir / "images" / "f.jpg",
            ):
                resumed_count = manager.resume_all()
                assert resumed_count >= 2


def test_cancel_all(temp_dest_dir: Path, temp_db: MediaRepository) -> None:
    """Verify cancel_all cancels both executing and pending tasks."""
    with patch("xakumedia.downloader.manager.default_repository", temp_db):
        manager = DownloadManager(max_concurrent=1)
        items = [{"media_item": create_dummy_item(f"cancel-all-{i}")} for i in range(1, 4)]

        def cancellable_stream(*args, **kwargs):
            cancel_event = kwargs.get("cancel_event")
            while not (cancel_event and cancel_event.is_set()):
                time.sleep(0.02)
            return Path(kwargs["destination_path"])

        with patch("xakumedia.downloader.manager.download_stream", side_effect=cancellable_stream):
            manager.start_batch_download(items=items, target_dir=temp_dest_dir / "images")
            time.sleep(0.05)

            cancelled_count = manager.cancel_all()
            assert cancelled_count >= 2
            time.sleep(0.1)

            state = manager.get_queue_state()
            assert state["pending_count"] == 0


def test_clear_completed(temp_dest_dir: Path, temp_db: MediaRepository) -> None:
    """Verify clear_completed removes finished tasks while keeping active/pending."""
    with (
        patch("xakumedia.downloader.manager.default_repository", temp_db),
        patch(
            "xakumedia.downloader.manager.download_stream",
            return_value=temp_dest_dir / "images" / "done.jpg",
        ),
    ):
        manager = DownloadManager(max_concurrent=2)
        item1 = create_dummy_item("done-1")
        item2 = create_dummy_item("failed-2")

        with patch.object(manager._executor, "submit"):
            t1 = manager.start_download(
                item1, destination_path=temp_dest_dir / "images" / "done.jpg"
            )
            t2 = manager.start_download(
                item2, destination_path=temp_dest_dir / "images" / "fail.jpg"
            )

        t1.status = TaskStatus.COMPLETED
        temp_db.save_download_task(t1)

        t2.status = TaskStatus.FAILED
        temp_db.save_download_task(t2)

        cleared = manager.clear_completed()
        assert cleared >= 2

        tasks = temp_db.get_download_tasks()
        assert not any(t.id in (t1.id, t2.id) for t in tasks)


def test_rpc_batch_queue_dispatcher(temp_dest_dir: Path, temp_db: MediaRepository) -> None:
    """Verify all Milestone 13 JSON-RPC endpoints via RpcDispatcher."""
    dispatcher = RpcDispatcher(repository=temp_db)

    with (
        patch("xakumedia.db.default_repository", temp_db),
        patch("xakumedia.downloader.manager.default_repository", temp_db),
        patch(
            "xakumedia.downloader.manager.download_stream",
            return_value=temp_dest_dir / "images" / "test.jpg",
        ),
    ):
        # 1. set_download_concurrency
        res = dispatcher.dispatch(
            JsonRpcRequest(
                id="c-1",
                method="set_download_concurrency",
                params={"concurrency": 4},
            )
        )
        assert res.error is None
        assert res.result["max_concurrent"] == 4

        # 2. get_download_queue_state
        res = dispatcher.dispatch(
            JsonRpcRequest(id="q-1", method="get_download_queue_state", params={})
        )
        assert res.error is None
        assert res.result["max_concurrent"] == 4

        # 3. start_batch_download
        batch_items = [
            {"media_item": create_dummy_item("rpc-batch-1").model_dump(mode="json")},
            {"media_item": create_dummy_item("rpc-batch-2").model_dump(mode="json")},
        ]
        res = dispatcher.dispatch(
            JsonRpcRequest(
                id="b-1",
                method="start_batch_download",
                params={"items": batch_items, "target_dir": str(temp_dest_dir / "images")},
            )
        )
        assert res.error is None
        assert res.result["count"] == 2
        task_id = res.result["tasks"][0]["id"]

        # 4. pause_download
        res = dispatcher.dispatch(
            JsonRpcRequest(id="p-1", method="pause_download", params={"task_id": task_id})
        )
        assert res.error is None
        assert "paused" in res.result

        # 5. resume_download
        res = dispatcher.dispatch(
            JsonRpcRequest(id="r-1", method="resume_download", params={"task_id": task_id})
        )
        assert res.error is None
        assert "resumed" in res.result

        # 6. pause_all_downloads
        res = dispatcher.dispatch(
            JsonRpcRequest(id="pa-1", method="pause_all_downloads", params={})
        )
        assert res.error is None
        assert "paused_count" in res.result

        # 7. resume_all_downloads
        res = dispatcher.dispatch(
            JsonRpcRequest(id="ra-1", method="resume_all_downloads", params={})
        )
        assert res.error is None
        assert "resumed_count" in res.result

        # 8. cancel_all_downloads
        res = dispatcher.dispatch(
            JsonRpcRequest(id="ca-1", method="cancel_all_downloads", params={})
        )
        assert res.error is None
        assert "cancelled_count" in res.result

        # 9. clear_completed_downloads
        res = dispatcher.dispatch(
            JsonRpcRequest(id="cc-1", method="clear_completed_downloads", params={})
        )
        assert res.error is None
        assert "cleared_count" in res.result
