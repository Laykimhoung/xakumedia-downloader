"""Unit tests for configuration handling and standard directories."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from xakumedia.core.config import AppConfig
from xakumedia.models.quality import VideoResolution


def test_default_config_paths() -> None:
    config = AppConfig()

    assert config.app_name == "XakuMedia"
    assert config.version == "0.1.0"
    assert isinstance(config.data_dir, Path)
    assert isinstance(config.cache_dir, Path)
    assert isinstance(config.download_dir, Path)
    assert config.video_download_dir == config.download_dir / "videos"
    assert config.image_download_dir == config.download_dir / "images"
    assert config.logs_dir == config.data_dir / "logs"


def test_config_validation_constraints() -> None:
    # Max concurrency must be between 1 and 16
    with pytest.raises(ValidationError):
        AppConfig(max_concurrent_downloads=0)

    with pytest.raises(ValidationError):
        AppConfig(max_concurrent_downloads=20)

    # Theme must be dark, light, or system
    with pytest.raises(ValidationError):
        AppConfig(theme="neon")


def test_custom_config_overrides(tmp_path: Path) -> None:
    custom_dir = tmp_path / "custom_downloads"
    config = AppConfig(
        download_dir=custom_dir,
        max_concurrent_downloads=8,
        default_video_resolution=VideoResolution.RES_2160P,
        theme="light",
    )

    assert config.download_dir == custom_dir
    assert config.max_concurrent_downloads == 8
    assert config.default_video_resolution == VideoResolution.RES_2160P
    assert config.theme == "light"
    assert config.video_download_dir == custom_dir / "videos"
