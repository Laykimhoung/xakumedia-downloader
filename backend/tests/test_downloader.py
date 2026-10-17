"""Unit tests for chunked streaming downloader and download manager."""

import threading
from collections.abc import Generator
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from xakumedia.core.config import default_config
from xakumedia.db.repository import MediaRepository
from xakumedia.downloader.manager import DownloadManager
from xakumedia.downloader.stream import download_stream
from xakumedia.exceptions.base import (
    DownloadCancelledError,
    InvalidDestinationError,
    SSRFBlockedError,
)
from xakumedia.models.media import MediaFormatInfo, MediaItem, MediaType
from xakumedia.models.queue import ProgressUpdate, TaskStatus
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
def test_media_item() -> MediaItem:
    """Fixture providing a sample MediaItem."""
    return MediaItem(
        id="item-test-123",
        source_url="https://example.com/art/neo_tokyo",
        original_url="https://cdn.example.com/images/neo_tokyo.jpg",
        media_type=MediaType.IMAGE,
        title="Neo Tokyo Night",
        author="artist_neo",
        thumbnail_url="https://cdn.example.com/thumbs/neo_tokyo.jpg",
        filesize_bytes=1024 * 128,
        available_formats=[
            MediaFormatInfo(
                format_id="orig",
                container="jpg",
                width=1920,
                height=1080,
                url="https://cdn.example.com/images/neo_tokyo.jpg",
            )
        ],
    )


def test_download_stream_success(temp_dest_dir: Path) -> None:
    """Verify streaming download creates target file, cleans up .part, and emits progress."""
    dest = temp_dest_dir / "images" / "neo_tokyo_001.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload_chunks = [b"A" * 32768, b"B" * 32768, b"C" * 32768]
    expected_content = b"".join(payload_chunks)

    progress_events: list[ProgressUpdate] = []

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.is_error = False
    mock_response.headers = {"content-length": str(len(expected_content))}
    mock_response.iter_bytes.return_value = payload_chunks
    mock_response.__enter__.return_value = mock_response
    mock_response.__exit__.return_value = None

    mock_client = MagicMock()
    mock_client.stream.return_value = mock_response
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None

    with patch("httpx.Client", return_value=mock_client):
        final_path = download_stream(
            url="https://cdn.example.com/img.jpg",
            destination_path=dest,
            task_id="task-stream-1",
            progress_callback=lambda u: progress_events.append(u),
        )

    assert final_path == dest
    assert dest.exists()
    assert dest.read_bytes() == expected_content
    # Temporary part file must be removed after successful atomic move
    assert not dest.with_suffix(".jpg.part").exists()
    assert len(progress_events) >= 1
    assert progress_events[-1].status == TaskStatus.COMPLETED
    assert progress_events[-1].progress_percent == 100.0


def test_download_stream_cancellation(temp_dest_dir: Path) -> None:
    """Verify that cancellation stops writing, deletes .part file, and raises error."""
    dest = temp_dest_dir / "images" / "cancel_test.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)

    cancel_event = threading.Event()
    cancel_event.set()  # Signal cancellation immediately

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.is_error = False
    mock_response.headers = {"content-length": "100000"}
    mock_response.iter_bytes.return_value = [b"X" * 1024, b"Y" * 1024]
    mock_response.__enter__.return_value = mock_response
    mock_response.__exit__.return_value = None

    mock_client = MagicMock()
    mock_client.stream.return_value = mock_response
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None

    with patch("httpx.Client", return_value=mock_client):
        with pytest.raises(DownloadCancelledError):
            download_stream(
                url="https://cdn.example.com/img.jpg",
                destination_path=dest,
                task_id="task-stream-cancel",
                cancel_event=cancel_event,
            )

    assert not dest.exists()
    assert not dest.with_suffix(".jpg.part").exists()


def test_download_stream_ssrf_protection(temp_dest_dir: Path) -> None:
    """Verify that private IP addresses and metadata endpoints are blocked in downloader."""
    dest = temp_dest_dir / "images" / "ssrf_block.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)

    with pytest.raises(SSRFBlockedError):
        download_stream(
            url="http://127.0.0.1/malicious.jpg",
            destination_path=dest,
            task_id="task-ssrf-1",
        )

    with pytest.raises(SSRFBlockedError):
        download_stream(
            url="http://169.254.169.254/latest/meta-data/",
            destination_path=dest,
            task_id="task-ssrf-2",
        )


def test_download_stream_invalid_destination(tmp_path: Path) -> None:
    """Verify path traversal outside authorized directories is rejected."""
    unauthorized_dest = tmp_path / "outside_allowed" / "secret.exe"

    with pytest.raises(InvalidDestinationError):
        download_stream(
            url="https://cdn.example.com/file.exe",
            destination_path=unauthorized_dest,
            task_id="task-path-1",
        )


def test_download_manager_start_and_complete(
    temp_dest_dir: Path, test_media_item: MediaItem, tmp_path: Path
) -> None:
    """Verify DownloadManager creates sequential filenames, persists tasks, and executes."""
    repo = MediaRepository(tmp_path / "test_dm.db")

    import xakumedia.downloader.manager as dm_mod

    with patch.object(dm_mod, "default_repository", repo):
        manager = DownloadManager(max_concurrent=2)

        # Mock stream download to succeed immediately
        with patch.object(dm_mod, "download_stream") as mock_stream:
            mock_stream.side_effect = lambda url, destination_path, **kwargs: destination_path

            task = manager.start_download(media_item=test_media_item)
            assert task is not None
            assert task.status in (TaskStatus.QUEUED, TaskStatus.DOWNLOADING, TaskStatus.COMPLETED)
            assert "artist_neo_img_" in task.destination_path.name

            # Wait briefly for worker thread to finish
            manager._executor.shutdown(wait=True)

            stored = repo.get_download_tasks(limit=10)
            assert len(stored) >= 1
            assert stored[0].status == TaskStatus.COMPLETED
            assert stored[0].media_item.title == "Neo Tokyo Night"


def test_download_manager_cancellation(
    temp_dest_dir: Path, test_media_item: MediaItem, tmp_path: Path
) -> None:
    """Verify DownloadManager can signal cancellation to active tasks."""
    repo = MediaRepository(tmp_path / "test_dm_cancel.db")

    import xakumedia.downloader.manager as dm_mod

    with patch.object(dm_mod, "default_repository", repo):
        manager = DownloadManager(max_concurrent=2)

        blocker_event = threading.Event()

        def slow_stream(url: str, destination_path: Path, **kwargs: Any) -> Path:
            cancel_ev = kwargs.get("cancel_event")
            while not (cancel_ev and cancel_ev.is_set()):
                if blocker_event.is_set():
                    break
                threading.Event().wait(0.05)
            if cancel_ev and cancel_ev.is_set():
                raise DownloadCancelledError("Cancelled")
            return destination_path

        with patch.object(dm_mod, "download_stream", side_effect=slow_stream):
            task = manager.start_download(media_item=test_media_item)

            # Signal cancellation
            cancelled = manager.cancel_download(task.id)
            assert cancelled is True

            manager._executor.shutdown(wait=True)
            stored = repo.get_download_tasks(limit=5)
            assert len(stored) == 1
            assert stored[0].status == TaskStatus.CANCELLED


def test_dispatcher_download_rpc(
    temp_dest_dir: Path, test_media_item: MediaItem, tmp_path: Path
) -> None:
    """Verify JSON-RPC endpoints for download task start, query, and cancellation."""
    repo = MediaRepository(tmp_path / "test_rpc_dm.db")
    dispatcher = RpcDispatcher()

    import xakumedia.db as db_mod
    import xakumedia.downloader.manager as dm_mod

    with (
        patch.object(db_mod, "default_repository", repo),
        patch.object(dm_mod, "default_repository", repo),
    ):
        with patch.object(dm_mod, "download_stream") as mock_stream:
            mock_stream.side_effect = lambda url, destination_path, **kwargs: destination_path

            # 1. start_download RPC
            req_start = JsonRpcRequest(
                id="rpc-dl-1",
                method="start_download",
                params={"media_item": test_media_item.model_dump()},
            )
            res_start = dispatcher.dispatch(req_start)
            assert res_start.error is None
            assert res_start.result is not None
            task_dict = res_start.result["task"]
            assert task_dict["media_item"]["title"] == "Neo Tokyo Night"
            task_id = task_dict["id"]

            # 2. get_download_tasks RPC
            req_tasks = JsonRpcRequest(
                id="rpc-dl-2",
                method="get_download_tasks",
                params={},
            )
            res_tasks = dispatcher.dispatch(req_tasks)
            assert res_tasks.error is None
            assert res_tasks.result["count"] >= 1

            # 3. cancel_download RPC
            req_cancel = JsonRpcRequest(
                id="rpc-dl-3",
                method="cancel_download",
                params={"task_id": task_id},
            )
            res_cancel = dispatcher.dispatch(req_cancel)
            assert res_cancel.error is None
            assert "cancelled" in res_cancel.result
