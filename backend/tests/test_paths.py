"""Unit tests for path traversal validation and safe temporary file locations."""

from pathlib import Path

import pytest

from xakumedia.exceptions.base import InvalidDestinationError
from xakumedia.utils.paths import get_temp_download_path, validate_destination_path


def test_validate_destination_path_allowed(tmp_path: Path) -> None:
    safe_root = tmp_path / "downloads"
    safe_root.mkdir()

    target_file = safe_root / "videos" / "creator_vdo_001.mp4"
    validated = validate_destination_path(target_file, safe_root)

    assert validated == target_file.resolve()


def test_validate_destination_path_traversal_blocked(tmp_path: Path) -> None:
    safe_root = tmp_path / "downloads"
    safe_root.mkdir()

    # Attempt path traversal outside safe root
    malicious_target = safe_root / ".." / "system32" / "payload.exe"

    with pytest.raises(InvalidDestinationError) as exc_info:
        validate_destination_path(malicious_target, safe_root)

    assert exc_info.value.code == "INVALID_DESTINATION_PATH"


def test_get_temp_download_path() -> None:
    final = Path("C:/downloads/videos/artist_vdo_001.mp4")
    temp = get_temp_download_path(final)

    assert temp == Path("C:/downloads/videos/artist_vdo_001.mp4.tmp")


def test_validate_destination_path_null_byte_blocked(tmp_path: Path) -> None:
    safe_root = tmp_path / "downloads"
    safe_root.mkdir()

    with pytest.raises(InvalidDestinationError, match="null byte"):
        validate_destination_path(Path(str(safe_root) + "/video\0.mp4"), safe_root)


def test_validate_destination_path_unc_blocked(tmp_path: Path) -> None:
    safe_root = tmp_path / "downloads"
    safe_root.mkdir()

    with pytest.raises(InvalidDestinationError, match="UNC network paths are not permitted"):
        validate_destination_path(Path("//attacker-server/share/video.mp4"), safe_root)

    with pytest.raises(InvalidDestinationError, match="UNC network paths are not permitted"):
        validate_destination_path(Path(r"\\attacker-server\share\video.mp4"), safe_root)


def test_validate_destination_path_ads_blocked(tmp_path: Path) -> None:
    safe_root = tmp_path / "downloads"
    safe_root.mkdir()

    # NTFS Alternate Data Stream syntax
    ads_file = safe_root / "video.mp4:hidden.exe"
    with pytest.raises(InvalidDestinationError, match="alternate data stream"):
        validate_destination_path(ads_file, safe_root)


def test_validate_destination_path_reserved_device_names_blocked(tmp_path: Path) -> None:
    safe_root = tmp_path / "downloads"
    safe_root.mkdir()

    reserved_names = ["CON", "con.mp4", "NUL", "nul.txt", "AUX", "prn.png", "COM1", "LPT1"]
    for r in reserved_names:
        bad_path = safe_root / r
        with pytest.raises(InvalidDestinationError, match="reserved device name"):
            validate_destination_path(bad_path, safe_root)

