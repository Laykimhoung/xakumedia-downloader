"""Unit tests for sequential filename generation and collision-prevention logic."""

from pathlib import Path

from xakumedia.models.media import MediaType
from xakumedia.utils.naming import (
    extract_sequence_number,
    format_sequential_filename,
    get_next_sequence_number,
    sanitize_username,
)


def test_sanitize_username() -> None:
    assert sanitize_username("normal_user") == "normal_user"
    assert sanitize_username("bad:user/name*?test") == "bad_user_name_test"
    assert sanitize_username("..leading.and.trailing..") == "leading.and.trailing"
    assert sanitize_username("   whitespace   ") == "whitespace"
    assert sanitize_username("") == "media"
    assert sanitize_username(None) == "media"
    assert sanitize_username(":::***???") == "media"


def test_format_sequential_filename() -> None:
    # Video standard padding
    assert format_sequential_filename("artist", MediaType.VIDEO, 1, "mp4") == "artist_vdo_001.mp4"
    assert (
        format_sequential_filename("artist", MediaType.VIDEO, 25, "webm") == "artist_vdo_025.webm"
    )

    # Image standard padding
    assert (
        format_sequential_filename("photographer", MediaType.IMAGE, 7, ".jpg")
        == "photographer_img_007.jpg"
    )
    assert (
        format_sequential_filename("photographer", MediaType.IMAGE, 99, "PNG")
        == "photographer_img_099.png"
    )

    # 4-digit expansion for 1000+ items
    assert (
        format_sequential_filename("creator", MediaType.VIDEO, 1000, "mkv")
        == "creator_vdo_1000.mkv"
    )
    assert (
        format_sequential_filename("creator", MediaType.IMAGE, 10500, "webp")
        == "creator_img_10500.webp"
    )


def test_extract_sequence_number() -> None:
    assert extract_sequence_number("artist_vdo_001.mp4", "artist", MediaType.VIDEO) == 1
    assert extract_sequence_number("artist_img_042.jpg", "artist", MediaType.IMAGE) == 42

    # Different user or prefix should return None
    assert extract_sequence_number("other_vdo_001.mp4", "artist", MediaType.VIDEO) is None
    assert extract_sequence_number("artist_img_001.jpg", "artist", MediaType.VIDEO) is None
    assert extract_sequence_number("random_filename.mp4", "artist", MediaType.VIDEO) is None


def test_get_next_sequence_number(tmp_path: Path) -> None:
    # 1. Empty directory starts at 1
    assert get_next_sequence_number(tmp_path, "artist", MediaType.VIDEO) == 1

    # 2. Add sequential files on disk
    (tmp_path / "artist_vdo_001.mp4").touch()
    (tmp_path / "artist_vdo_002.webm").touch()
    assert get_next_sequence_number(tmp_path, "artist", MediaType.VIDEO) == 3

    # 3. Handle manual gaps (e.g. 001 and 009 on disk)
    (tmp_path / "artist_vdo_009.mp4").touch()
    assert get_next_sequence_number(tmp_path, "artist", MediaType.VIDEO) == 10

    # 4. Videos and images have independent sequences
    assert get_next_sequence_number(tmp_path, "artist", MediaType.IMAGE) == 1
    (tmp_path / "artist_img_001.jpg").touch()
    assert get_next_sequence_number(tmp_path, "artist", MediaType.IMAGE) == 2

    # 5. Different usernames have independent sequences
    assert get_next_sequence_number(tmp_path, "other_creator", MediaType.VIDEO) == 1
