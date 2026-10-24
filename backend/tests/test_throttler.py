"""Tests for thread-safe bandwidth throttling, token bucket rate limiting, and RPC dispatching."""

import threading
import time
from pathlib import Path
from unittest.mock import MagicMock

from xakumedia.core.config import default_config
from xakumedia.db.repository import MediaRepository
from xakumedia.downloader.stream import download_stream
from xakumedia.downloader.throttler import BandwidthThrottler
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest


def test_throttler_unlimited():
    """Verify that 0 KB/s speed limit imposes zero delay."""
    throttler = BandwidthThrottler(max_speed_kbps=0)
    assert throttler.get_speed_limit() == 0

    slept = throttler.consume(1024 * 1024)
    assert slept == 0.0

    throttler.set_speed_limit(-10)
    assert throttler.get_speed_limit() == 0
    assert throttler.consume(500000) == 0.0


def test_throttler_dynamic_adjustment():
    """Verify dynamic on-the-fly adjustment of bandwidth limit."""
    throttler = BandwidthThrottler(max_speed_kbps=500)
    assert throttler.get_speed_limit() == 500

    new_limit = throttler.set_speed_limit(1024)
    assert new_limit == 1024
    assert throttler.get_speed_limit() == 1024

    # Clamping test
    clamped = throttler.set_speed_limit(2_000_000)
    assert clamped == 1_000_000
    assert throttler.get_speed_limit() == 1_000_000


def test_throttler_token_consumption():
    """Verify that exceeding token capacity causes sleeping proportional to deficit."""
    # 100 KB/s limit -> capacity is 128KB minimum
    throttler = BandwidthThrottler(max_speed_kbps=100)

    # First drain initial tokens
    throttler._tokens = 0.0
    throttler._last_refill = time.monotonic()

    # Consuming 10KB (10240 bytes) at 100KB/s (102400 B/s) requires ~0.1s
    start = time.monotonic()
    slept = throttler.consume(10 * 1024)
    elapsed = time.monotonic() - start

    assert slept > 0.05
    assert elapsed >= 0.07


def test_throttler_cancellation_responsive():
    """Verify that a set cancel_event aborts sleeping immediately."""
    throttler = BandwidthThrottler(max_speed_kbps=10)
    throttler._tokens = 0.0
    throttler._last_refill = time.monotonic()

    cancel_event = threading.Event()
    cancel_event.set()

    start = time.monotonic()
    slept = throttler.consume(100 * 1024, cancel_event=cancel_event)
    elapsed = time.monotonic() - start

    assert slept == 0.0
    assert elapsed < 0.1


def test_throttler_concurrent_threads():
    """Verify that multiple concurrent threads can consume tokens safely without deadlock."""
    throttler = BandwidthThrottler(max_speed_kbps=500)
    errors: list[Exception] = []

    def worker():
        try:
            for _ in range(5):
                throttler.consume(1024)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=3.0)

    assert not errors
    assert all(not t.is_alive() for t in threads)


def test_stream_with_throttler(tmp_path: Path, monkeypatch):
    """Verify that download_stream invokes throttler.consume."""
    throttler = BandwidthThrottler(max_speed_kbps=1000)
    consume_spy = MagicMock(wraps=throttler.consume)
    throttler.consume = consume_spy

    chunk_data = b"x" * (64 * 1024)

    class MockStreamResponse:
        status_code = 200
        is_error = False
        headers = {"content-length": str(len(chunk_data))}

        def iter_bytes(self, chunk_size=None):
            yield chunk_data

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    class MockClient:
        def __init__(self, **kwargs):
            pass

        def stream(self, method, url):
            return MockStreamResponse()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    import httpx

    monkeypatch.setattr(httpx, "Client", MockClient)

    dest = tmp_path / "stream_throttled.bin"
    final_path = download_stream(
        url="https://example.com/stream.bin",
        destination_path=dest,
        task_id="test-throttle-task",
        throttler=throttler,
        allowed_root=tmp_path,
    )

    assert final_path.exists()
    assert consume_spy.called
    assert consume_spy.call_count >= 1


def test_dispatcher_speed_limit_rpc():
    """Verify set_speed_limit and get_speed_limit via JSON-RPC dispatcher."""
    dispatcher = RpcDispatcher()

    # Get speed limit initially
    req_get = JsonRpcRequest(id="1", method="get_speed_limit", params={})
    res_get = dispatcher.dispatch(req_get)
    assert res_get.error is None
    assert "speed_limit_kbps" in res_get.result

    # Set speed limit to 2048 KB/s
    req_set = JsonRpcRequest(
        id="2", method="set_speed_limit", params={"speed_limit_kbps": 2048}
    )
    res_set = dispatcher.dispatch(req_set)
    assert res_set.error is None
    assert res_set.result["speed_limit_kbps"] == 2048

    # Verify updated speed limit
    res_get2 = dispatcher.dispatch(req_get)
    assert res_get2.result["speed_limit_kbps"] == 2048

    # Reset speed limit to 0 (unlimited)
    req_reset = JsonRpcRequest(
        id="3", method="set_speed_limit", params={"speed_limit_kbps": 0}
    )
    res_reset = dispatcher.dispatch(req_reset)
    assert res_reset.result["speed_limit_kbps"] == 0


def test_preferences_speed_limit_persistence(tmp_path: Path):
    """Verify that max_download_speed_kbps is stored and reloaded in repository."""
    db_file = tmp_path / "test_prefs.db"
    repo = MediaRepository(db_path=db_file)

    # Initial preferences should have max_download_speed_kbps
    prefs = repo.get_all_preferences()
    assert "max_download_speed_kbps" in prefs
    assert prefs["max_download_speed_kbps"] == 0

    # Update speed limit preference
    updated = repo.update_preferences({"max_download_speed_kbps": 1500})
    assert updated["max_download_speed_kbps"] == 1500
    assert default_config.max_download_speed_kbps == 1500

    # Reload from database in new repository instance
    repo2 = MediaRepository(db_path=db_file)
    loaded = repo2.load_saved_preferences()
    assert loaded["max_download_speed_kbps"] == 1500

    # Reset preferences
    reset = repo2.reset_preferences()
    assert reset["max_download_speed_kbps"] == 0
    assert default_config.max_download_speed_kbps == 0
