"""Comprehensive regression test suite for Milestone 22: Automated Testing & Regression Review.

Validates:
1. Network disconnects and mid-stream timeouts.
2. HTTP 416 Range Not Satisfiable edge case recovery.
3. Malformed and corrupted cookie profiles.
4. Filesystem write failures and permission denials.
5. Corrupted intermediate staging files (.part.part) in TaskRecoveryService.
6. Provider error mapping and fallback behavior for Direct, Video, and Gallery providers.
7. RPC Dispatcher error response standardization under failure conditions.
"""

import threading
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest

from xakumedia.auth.cookies import (
    get_cookies_dict_from_file,
    parse_netscape_cookies,
)
from xakumedia.db.repository import MediaRepository
from xakumedia.downloader.manager import DownloadManager
from xakumedia.downloader.recovery import TaskRecoveryService
from xakumedia.downloader.stream import download_stream
from xakumedia.exceptions.base import (
    DiskSpaceError,
    DRMProtectedError,
    MediaUnavailableError,
    NetworkTimeoutError,
    PrivateMediaError,
    RateLimitError,
    UnsupportedSourceError,
)
from xakumedia.extractors.gallery import extract_gallery_info
from xakumedia.extractors.video import parse_yt_dlp_error
from xakumedia.models.media import MediaFormatInfo, MediaItem, MediaType
from xakumedia.models.queue import DownloadTask, TaskStatus
from xakumedia.models.url import UrlCategory
from xakumedia.scanners.direct import classify_direct_url
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest

# =============================================================================
# 1. Network Disconnects & Timeout Regressions
# =============================================================================

def test_regression_network_midstream_disconnect(tmp_path: Path) -> None:
    """Verify that a mid-stream connection drop raises NetworkTimeoutError and cleans up staging."""
    dest = tmp_path / "downloads" / "disconnect_test.mp4"
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp_part = dest.with_suffix(".mp4.part")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.is_error = False
    mock_response.headers = {"content-length": "1000000"}

    def error_stream(chunk_size: int = 65536):
        yield b"X" * 32768
        raise httpx.ReadTimeout("Server dropped connection mid-stream")

    mock_response.iter_bytes = error_stream
    mock_response.__enter__.return_value = mock_response
    mock_response.__exit__.return_value = None

    mock_client = MagicMock()
    mock_client.stream.return_value = mock_response
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None

    with patch("httpx.Client", return_value=mock_client):
        with pytest.raises(NetworkTimeoutError) as exc_info:
            download_stream(
                url="https://example.com/video.mp4",
                destination_path=dest,
                task_id="reg-task-disconnect",
                allowed_root=tmp_path,
            )

    assert "Connection timed out" in str(exc_info.value)
    assert not dest.exists()
    assert not temp_part.exists()


def test_regression_download_manager_network_failure(tmp_path: Path) -> None:
    """Verify DownloadManager handles worker network drop, updates FAILED, and frees slot."""
    repo = MediaRepository(tmp_path / "reg_repo.db")
    manager = DownloadManager(max_concurrent=2, repository=repo)

    item = MediaItem(
        id="reg-item-netfail",
        source_url="https://example.com/netfail.mp4",
        original_url="https://example.com/netfail.mp4",
        media_type=MediaType.VIDEO,
        title="Network Fail Video",
        available_formats=[
            MediaFormatInfo(
                format_id="best",
                container="mp4",
                url="https://example.com/netfail.mp4",
                requires_merge=False,
            )
        ],
    )

    with patch(
        "xakumedia.downloader.manager.download_stream",
        side_effect=NetworkTimeoutError("Socket closed abruptly"),
    ):
        task = manager.start_download(
            media_item=item,
            destination_path=tmp_path / "downloads" / "netfail.mp4",
        )

        # Wait briefly for worker thread to finish
        for _ in range(50):
            t = repo.get_download_task(task.id)
            if t and t.status in (TaskStatus.FAILED, TaskStatus.COMPLETED):
                break
            threading.Event().wait(0.05)

    final_task = repo.get_download_task(task.id)
    assert final_task is not None
    assert final_task.status == TaskStatus.FAILED
    assert "Socket closed abruptly" in (final_task.error_message or "")

    # Ensure worker slot was released
    state = manager.get_queue_state()
    assert state["active_count"] == 0


# =============================================================================
# 2. HTTP 416 Range Not Satisfiable Edge Case
# =============================================================================

def test_regression_http_416_with_complete_part_file(tmp_path: Path) -> None:
    """Verify that HTTP 416 with an existing partial file treats the file as complete."""
    dest = tmp_path / "downloads" / "complete_416.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp_part = dest.with_suffix(".jpg.part")
    temp_part.write_bytes(b"EXISTING_COMPLETE_DATA")

    mock_response = MagicMock()
    mock_response.status_code = 416
    mock_response.reason_phrase = "Range Not Satisfiable"
    mock_response.is_error = True
    mock_response.__enter__.return_value = mock_response
    mock_response.__exit__.return_value = None

    mock_client = MagicMock()
    mock_client.stream.return_value = mock_response
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None

    with patch("httpx.Client", return_value=mock_client):
        res = download_stream(
            url="https://example.com/img.jpg",
            destination_path=dest,
            task_id="reg-416",
            allowed_root=tmp_path,
        )

    assert res == dest
    assert dest.exists()
    assert dest.read_bytes() == b"EXISTING_COMPLETE_DATA"
    assert not temp_part.exists()


# =============================================================================
# 3. Malformed and Corrupted Cookie Profiles
# =============================================================================

def test_regression_malformed_cookie_parsing(tmp_path: Path) -> None:
    """Verify Netscape cookie parser tolerates corrupt lines, missing fields, and bad timestamps."""
    corrupted_content = """# Netscape HTTP Cookie File
# Invalid header line
bad_line_with_too_few_parts
.example.com\tTRUE\t/\tTRUE\tnot_an_int\tsession_id\tabc123
#HttpOnly_.safe.org\tFALSE\t/api\tTRUE\t1999999999\tauth_token\txyz890
\t\t\t\t\t\t
.empty.com\tTRUE\t/\tFALSE\t1700000000\t\tno_name
.valid.com\tTRUE\t/\tFALSE\t1750000000\tpref\tdark
"""
    cookies = parse_netscape_cookies(corrupted_content)

    # Line 1: bad_line (skipped)
    # Line 2: non_int expiry -> fallback to 0
    # Line 3: #HttpOnly_ valid cookie
    # Line 4: empty tabs (skipped)
    # Line 5: empty name (skipped)
    # Line 6: valid cookie
    assert len(cookies) == 3

    c1 = cookies[0]
    assert c1.domain == ".example.com"
    assert c1.name == "session_id"
    assert c1.expiration == 0  # Graceful fallback for non-integer timestamp

    c2 = cookies[1]
    assert c2.domain == ".safe.org"
    assert c2.name == "auth_token"
    assert c2.path == "/api"

    c3 = cookies[2]
    assert c3.domain == ".valid.com"
    assert c3.name == "pref"
    assert c3.value == "dark"


def test_regression_cookie_dict_from_corrupted_file(tmp_path: Path) -> None:
    """Verify get_cookies_dict_from_file handles missing and unreadable files safely."""
    # 1. Non-existent file
    missing = tmp_path / "nonexistent_cookies.txt"
    assert get_cookies_dict_from_file(missing) == {}

    # 2. Corrupt/binary file
    bin_file = tmp_path / "binary_cookie.dat"
    bin_file.write_bytes(b"\x00\xff\xfe\x01\x02\x03\x04")
    # Should not crash, returns dict of whatever could be parsed
    result = get_cookies_dict_from_file(bin_file)
    assert isinstance(result, dict)


# =============================================================================
# 4. Filesystem Write Failures & Permission Denials
# =============================================================================

def test_regression_filesystem_permission_denial(tmp_path: Path) -> None:
    """Verify that PermissionError during write raises DiskSpaceError and cleans up staging."""
    dest = tmp_path / "downloads" / "readonly_file.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.is_error = False
    mock_response.headers = {"content-length": "5000"}
    mock_response.iter_bytes.return_value = [b"Chunk 1"]
    mock_response.__enter__.return_value = mock_response
    mock_response.__exit__.return_value = None

    mock_client = MagicMock()
    mock_client.stream.return_value = mock_response
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = None

    with patch("httpx.Client", return_value=mock_client):
        with patch("builtins.open", side_effect=PermissionError("Permission denied: EACCES")):
            with pytest.raises(DiskSpaceError) as exc_info:
                download_stream(
                    url="https://example.com/test.jpg",
                    destination_path=dest,
                    task_id="reg-perm-fail",
                    allowed_root=tmp_path,
                )

    assert "Filesystem write failed" in str(exc_info.value)
    assert not dest.exists()


# =============================================================================
# 5. Corrupted Intermediate Files & Task Recovery Regressions
# =============================================================================

def test_regression_recovery_with_stale_staging_and_complete_destination(tmp_path: Path) -> None:
    """Verify TaskRecoveryService handles destination complete when stale .part exists."""
    repo = MediaRepository(tmp_path / "recovery_reg.db")
    service = TaskRecoveryService(repository=repo)

    dest = tmp_path / "downloads" / "recovered_item.mp4"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(b"COMPLETED_MEDIA_PAYLOAD_12345")

    # Stale .part file leftover from abrupt power loss
    stale_part = dest.with_suffix(".mp4.part")
    stale_part.write_bytes(b"PARTIAL_DATA")

    media_item = MediaItem(
        id="item-rec-1",
        source_url="https://example.com/rec.mp4",
        original_url="https://example.com/rec.mp4",
        media_type=MediaType.VIDEO,
        title="Recovered Item",
    )
    repo.save_media_item(media_item)

    task = DownloadTask(
        id="task-recovery-reg-1",
        media_item=media_item,
        destination_path=dest,
        status=TaskStatus.DOWNLOADING,
        bytes_downloaded=5000,
        total_bytes=len(b"COMPLETED_MEDIA_PAYLOAD_12345"),
    )
    repo.save_download_task(task)

    summary = service.recover_interrupted_tasks(auto_resume=False)

    assert summary.completed_count == 1
    recovered_task = repo.get_download_task(task.id)
    assert recovered_task is not None
    assert recovered_task.status == TaskStatus.COMPLETED
    assert recovered_task.progress_percent == 100.0


# =============================================================================
# 6. Provider Error Mapping & Fallbacks
# =============================================================================

def test_regression_direct_scanner_non_media_types() -> None:
    """Verify classify_direct_url rejects HTML and unsupported binary content gracefully."""
    mock_headers = httpx.Headers({"content-type": "text/html; charset=utf-8"})

    with patch(
        "xakumedia.scanners.direct.probe_direct_url",
        return_value=(mock_headers, 200, "https://example.com/article"),
    ):
        classified, item = classify_direct_url("https://example.com/article")
        assert classified.category == UrlCategory.UNKNOWN
        assert not classified.is_supported
        assert item is None


def test_regression_yt_dlp_error_parser_matrix() -> None:
    """Verify parse_yt_dlp_error accurately maps all platform error string patterns."""
    dummy_url = "https://example.com/video"
    assert isinstance(
        parse_yt_dlp_error("This video is DRM protected and cannot be extracted", dummy_url),
        DRMProtectedError,
    )
    assert isinstance(
        parse_yt_dlp_error(
            "Private video. Sign in if you've been granted access to this video", dummy_url
        ),
        PrivateMediaError,
    )
    assert isinstance(
        parse_yt_dlp_error("HTTP Error 429: Too Many Requests", dummy_url),
        RateLimitError,
    )
    assert isinstance(
        parse_yt_dlp_error(
            "Video unavailable. This video has been removed by the uploader", dummy_url
        ),
        MediaUnavailableError,
    )
    assert isinstance(
        parse_yt_dlp_error("Unsupported URL: https://unknown-host.org/media/123", dummy_url),
        UnsupportedSourceError,
    )


def test_regression_gallery_dl_empty_results() -> None:
    """Verify gallery_dl extractor raises MediaUnavailableError when 0 items are extracted."""
    with patch("xakumedia.extractors.gallery.gdl_extractor.find", return_value=MagicMock()):
        mock_job = MagicMock()
        mock_job.exception = None
        mock_job.data_urls = []
        with patch("xakumedia.extractors.gallery.DataJob", return_value=mock_job):
            with pytest.raises(MediaUnavailableError) as exc_info:
                extract_gallery_info("https://example.com/gallery/empty_album")

    assert "No media items found in gallery" in str(exc_info.value)


# =============================================================================
# 7. RPC Dispatcher Standardized Error Responses
# =============================================================================

def test_regression_rpc_dispatcher_error_structure() -> None:
    """Verify RpcDispatcher standardizes domain and system errors into compliant JSON-RPC 2.0."""
    dispatcher = RpcDispatcher()

    # 1. Invalid method name -> MethodNotFound (-32601)
    req1 = JsonRpcRequest(id="req-1", method="nonexistent_method", params={})
    resp1 = dispatcher.dispatch(req1)
    assert resp1.error is not None
    assert resp1.error.code == -32601
    assert "Method 'nonexistent_method' not found" in resp1.error.message

    # 2. SSRF Loopback violation -> Domain error (-32000)
    req2 = JsonRpcRequest(
        id="req-2",
        method="classify_url",
        params={"url": "http://127.0.0.1:8080/secret.jpg"},
    )
    resp2 = dispatcher.dispatch(req2)
    assert resp2.error is not None
    assert resp2.error.code == -32000
    assert "blocked for security" in resp2.error.message

    # 3. Missing required parameters -> InvalidParams (-32602)
    req3 = JsonRpcRequest(id="req-3", method="start_download", params={})
    resp3 = dispatcher.dispatch(req3)
    assert resp3.error is not None
    assert resp3.error.code == -32602
    assert "Parameter 'media_item' is required" in resp3.error.message
