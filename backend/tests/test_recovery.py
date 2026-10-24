"""Automated tests for task queue crash recovery and interrupted download resumption."""

import tempfile
from pathlib import Path

import pytest

from xakumedia.db import MediaRepository
from xakumedia.downloader.manager import DownloadManager
from xakumedia.downloader.recovery import TaskRecoveryService
from xakumedia.models.media import MediaFormatInfo, MediaItem, MediaType
from xakumedia.models.queue import DownloadTask, TaskStatus
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest


@pytest.fixture
def temp_workspace():
    """Create a temporary directory for database and file testing."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def repo(temp_workspace: Path) -> MediaRepository:
    """Create an isolated MediaRepository instance."""
    db_path = temp_workspace / "test_recovery.db"
    return MediaRepository(db_path=db_path)


@pytest.fixture
def sample_media_item() -> MediaItem:
    """Create a sample MediaItem for queue testing."""
    return MediaItem(
        source_url="https://example.com/video.mp4",
        original_url="https://example.com/video.mp4",
        source_domain="example.com",
        media_type=MediaType.VIDEO,
        title="Test Interrupted Video",
        author="xakuraii",
    )


def test_recovery_no_tasks(repo: MediaRepository, temp_workspace: Path) -> None:
    """Assert recovery runs cleanly when no interrupted tasks exist."""
    manager = DownloadManager(max_concurrent=3)
    service = TaskRecoveryService(manager=manager, repository=repo)

    summary = service.recover_interrupted_tasks()
    assert summary.recovered_count == 0
    assert summary.resumed_count == 0
    assert summary.paused_count == 0
    assert summary.completed_count == 0
    assert "No interrupted tasks found" in summary.message


def test_recovery_single_stream_with_partial_file(
    repo: MediaRepository, temp_workspace: Path, sample_media_item: MediaItem
) -> None:
    """Assert single-stream task with existing .part file is audited and transitioned to PAUSED."""
    manager = DownloadManager(max_concurrent=3)
    service = TaskRecoveryService(manager=manager, repository=repo)

    dest = temp_workspace / "xakuraii_vdo_001.mp4"
    part_file = temp_workspace / "xakuraii_vdo_001.mp4.part"
    part_file.write_bytes(b"A" * 450)

    task = DownloadTask(
        id="test-task-partial",
        media_item=sample_media_item,
        status=TaskStatus.DOWNLOADING,
        destination_path=dest,
        temp_path=part_file,
        bytes_downloaded=100,
        total_bytes=1000,
        progress_percent=10.0,
    )
    repo.save_download_task(task)

    summary = service.recover_interrupted_tasks(auto_resume=False)

    assert summary.recovered_count == 1
    assert summary.paused_count == 1
    assert summary.resumed_count == 0

    updated = repo.get_download_task("test-task-partial")
    assert updated is not None
    assert updated.status == TaskStatus.PAUSED
    assert updated.bytes_downloaded == 450
    assert updated.progress_percent == 45.0


def test_recovery_single_stream_missing_part_file(
    repo: MediaRepository, temp_workspace: Path, sample_media_item: MediaItem
) -> None:
    """Assert task with missing .part file resets bytes to 0 and transitions to PAUSED."""
    manager = DownloadManager(max_concurrent=3)
    service = TaskRecoveryService(manager=manager, repository=repo)

    dest = temp_workspace / "missing_vdo_002.mp4"
    part_file = temp_workspace / "missing_vdo_002.mp4.part"

    task = DownloadTask(
        id="test-task-missing",
        media_item=sample_media_item,
        status=TaskStatus.DOWNLOADING,
        destination_path=dest,
        temp_path=part_file,
        bytes_downloaded=300,
        total_bytes=1000,
        progress_percent=30.0,
    )
    repo.save_download_task(task)

    summary = service.recover_interrupted_tasks(auto_resume=False)

    assert summary.recovered_count == 1
    updated = repo.get_download_task("test-task-missing")
    assert updated is not None
    assert updated.status == TaskStatus.PAUSED
    assert updated.bytes_downloaded == 0
    assert updated.progress_percent == 0.0


def test_recovery_destination_already_complete_on_disk(
    repo: MediaRepository, temp_workspace: Path, sample_media_item: MediaItem
) -> None:
    """Assert task whose destination file already exists and is complete is marked COMPLETED."""
    manager = DownloadManager(max_concurrent=3)
    service = TaskRecoveryService(manager=manager, repository=repo)

    dest = temp_workspace / "already_done_003.mp4"
    dest.write_bytes(b"COMPLETED_DATA_BYTES" * 50)  # non-empty file

    task = DownloadTask(
        id="test-task-completed",
        media_item=sample_media_item,
        status=TaskStatus.DOWNLOADING,
        destination_path=dest,
        total_bytes=len(b"COMPLETED_DATA_BYTES" * 50),
    )
    repo.save_download_task(task)

    summary = service.recover_interrupted_tasks(auto_resume=False)

    assert summary.completed_count == 1
    assert summary.recovered_count == 0

    updated = repo.get_download_task("test-task-completed")
    assert updated is not None
    assert updated.status == TaskStatus.COMPLETED
    assert updated.progress_percent == 100.0


def test_recovery_dual_stream_interrupted_merge(
    repo: MediaRepository, temp_workspace: Path, sample_media_item: MediaItem
) -> None:
    """Assert interrupted FFmpeg merge cleans up partial output and audits video/audio parts."""
    manager = DownloadManager(max_concurrent=3)
    service = TaskRecoveryService(manager=manager, repository=repo)

    dest = temp_workspace / "dual_stream_004.mp4"
    video_part = temp_workspace / "dual_stream_004.video.part"
    audio_part = temp_workspace / "dual_stream_004.audio.part"
    corrupt_merged = temp_workspace / "dual_stream_004.mp4.part"

    video_part.write_bytes(b"V" * 600)
    audio_part.write_bytes(b"A" * 200)
    corrupt_merged.write_bytes(b"CORRUPTED_INCOMPLETE_OUTPUT")

    format_info = MediaFormatInfo(
        format_id="bestvideo+bestaudio",
        container="mp4",
        requires_merge=True,
    )

    task = DownloadTask(
        id="test-task-dual-merge",
        media_item=sample_media_item,
        status=TaskStatus.MERGING,
        selected_format=format_info,
        destination_path=dest,
        total_bytes=1000,
    )
    repo.save_download_task(task)

    summary = service.recover_interrupted_tasks(auto_resume=False)

    assert summary.recovered_count == 1
    # Corrupt merged file should be unlinked
    assert not corrupt_merged.exists()
    # Video and audio parts preserved
    assert video_part.exists()
    assert audio_part.exists()

    updated = repo.get_download_task("test-task-dual-merge")
    assert updated is not None
    assert updated.status == TaskStatus.PAUSED
    assert updated.bytes_downloaded == 800  # 600 + 200


def test_recovery_auto_resume(
    repo: MediaRepository, temp_workspace: Path, sample_media_item: MediaItem
) -> None:
    """Assert auto_resume=True immediately re-queues recovered tasks into DownloadManager."""
    manager = DownloadManager(max_concurrent=2, repository=repo)
    service = TaskRecoveryService(manager=manager, repository=repo)

    dest = temp_workspace / "auto_resume_005.mp4"
    part_file = temp_workspace / "auto_resume_005.mp4.part"
    part_file.write_bytes(b"A" * 250)

    task = DownloadTask(
        id="test-task-autoresume",
        media_item=sample_media_item,
        status=TaskStatus.DOWNLOADING,
        destination_path=dest,
        temp_path=part_file,
        total_bytes=1000,
    )
    repo.save_download_task(task)

    summary = service.recover_interrupted_tasks(auto_resume=True)

    assert summary.recovered_count == 1
    assert summary.resumed_count == 1
    assert summary.auto_resumed is True

    # Task should now be active or queued in the manager
    state = manager.get_queue_state()
    assert (state["active_count"] + state["pending_count"]) >= 1

    manager.cancel_all()
    manager._executor.shutdown(wait=True, cancel_futures=True)


def test_rpc_dispatch_recover_interrupted_tasks() -> None:
    """Assert recover_interrupted_tasks handler dispatches over JSON-RPC."""
    dispatcher = RpcDispatcher()
    req = JsonRpcRequest(
        id="req-recover-01",
        method="recover_interrupted_tasks",
        params={"auto_resume": False},
    )

    resp = dispatcher.dispatch(req)
    assert resp.error is None
    assert isinstance(resp.result, dict)
    assert "recovered_count" in resp.result
    assert "resumed_count" in resp.result
    assert "paused_count" in resp.result
    assert "completed_count" in resp.result
    assert "message" in resp.result
