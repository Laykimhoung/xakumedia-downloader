"""Unit tests for application preferences persistence and RPC dispatching."""

from pathlib import Path

import pytest

from xakumedia.core.config import default_config
from xakumedia.db.repository import MediaRepository
from xakumedia.models.quality import ImageFormat, VideoContainer, VideoResolution
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.protocol import JsonRpcRequest


@pytest.fixture
def temp_db(tmp_path: Path) -> Path:
    """Create a temporary sqlite database path for isolated test execution."""
    return tmp_path / "test_prefs.db"


@pytest.fixture
def repo(temp_db: Path) -> MediaRepository:
    """Instantiate MediaRepository against an isolated temporary database."""
    return MediaRepository(temp_db)


def test_default_preferences(repo: MediaRepository) -> None:
    """Verify that default preferences reflect the system defaults when none are stored."""
    prefs = repo.get_all_preferences()
    assert "download_dir" in prefs
    assert prefs["max_concurrent_downloads"] == 4
    assert prefs["default_video_resolution"] == "1080p"
    assert prefs["default_video_container"] == "mp4"
    assert prefs["default_image_format"] == "original"
    assert prefs["theme"] == "dark"


def test_set_and_get_single_preference(repo: MediaRepository) -> None:
    """Verify storing and fetching a single key-value preference."""
    assert repo.get_preference("custom_key") is None
    assert repo.get_preference("custom_key", default="fallback") == "fallback"

    repo.set_preference("custom_key", "custom_value")
    assert repo.get_preference("custom_key") == "custom_value"

    repo.set_preference("numeric_setting", 42)
    assert repo.get_preference("numeric_setting") == 42


def test_update_preferences_batch(repo: MediaRepository, tmp_path: Path) -> None:
    """Verify batch updating preferences with validation and runtime application."""
    custom_dir = tmp_path / "custom_downloads"
    custom_dir.mkdir(parents=True, exist_ok=True)

    updates = {
        "download_dir": str(custom_dir),
        "max_concurrent_downloads": 6,
        "default_video_resolution": "2160p",
        "default_video_container": "mkv",
        "default_image_format": "png",
        "theme": "light",
        "request_timeout_seconds": 45.0,
    }

    updated = repo.update_preferences(updates)
    assert updated["max_concurrent_downloads"] == 6
    assert updated["default_video_resolution"] == "2160p"
    assert updated["default_video_container"] == "mkv"
    assert updated["default_image_format"] == "png"
    assert updated["theme"] == "light"
    assert updated["request_timeout_seconds"] == 45.0

    # Verify that default_config runtime singleton was updated
    assert default_config.max_concurrent_downloads == 6
    assert default_config.default_video_resolution == VideoResolution.RES_2160P
    assert default_config.default_video_container == VideoContainer.MKV
    assert default_config.default_image_format == ImageFormat.PNG
    assert default_config.theme == "light"


def test_update_preferences_validation(repo: MediaRepository) -> None:
    """Verify value clamping and validation on invalid inputs."""
    # Concurrency clamped between 1 and 16
    res = repo.update_preferences({"max_concurrent_downloads": 999})
    assert res["max_concurrent_downloads"] == 16

    res2 = repo.update_preferences({"max_concurrent_downloads": -5})
    assert res2["max_concurrent_downloads"] == 1

    # Invalid theme raises ValueError
    with pytest.raises(ValueError, match="Invalid theme"):
        repo.update_preferences({"theme": "neon-green"})


def test_reset_preferences(repo: MediaRepository) -> None:
    """Verify resetting preferences restores standard factory defaults."""
    repo.update_preferences({"theme": "light", "max_concurrent_downloads": 8})
    assert repo.get_preference("theme") == "light"

    restored = repo.reset_preferences()
    assert restored["theme"] == "dark"
    assert restored["max_concurrent_downloads"] == 4
    assert default_config.theme == "dark"


def test_preferences_rpc_dispatcher(repo: MediaRepository, tmp_path: Path) -> None:
    """Verify get_preferences, update_preferences, and reset_preferences JSON-RPC methods."""
    dispatcher = RpcDispatcher(repository=repo)

    # 1. get_preferences
    req1 = JsonRpcRequest(id=1, method="get_preferences", params={})
    resp1 = dispatcher.dispatch(req1)
    assert resp1.result is not None
    assert resp1.result["theme"] in ("dark", "light", "system")

    # 2. update_preferences
    custom_dir = tmp_path / "rpc_downloads"
    req2 = JsonRpcRequest(
        id=2,
        method="update_preferences",
        params={
            "preferences": {
                "download_dir": str(custom_dir),
                "max_concurrent_downloads": 5,
                "theme": "dark",
            }
        },
    )
    resp2 = dispatcher.dispatch(req2)
    assert resp2.result is not None
    assert resp2.result["max_concurrent_downloads"] == 5

    # 3. reset_preferences
    req3 = JsonRpcRequest(id=3, method="reset_preferences", params={})
    resp3 = dispatcher.dispatch(req3)
    assert resp3.result is not None
    assert resp3.result["max_concurrent_downloads"] == 4
