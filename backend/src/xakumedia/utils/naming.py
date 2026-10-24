"""Sequential filename generation and sanitization utilities."""

import re
from pathlib import Path

from ..models.media import MediaType
from .paths import WINDOWS_RESERVED_NAMES

# Characters forbidden in Windows filenames: \ / : * ? " < > |
FORBIDDEN_CHARS_PATTERN = re.compile(r'[\\/:*?"<>|]')
# Matches sequential pattern: {username}_{prefix}_{number}.{ext}
SEQUENCE_PATTERN = re.compile(
    r"^(?P<username>.+)_(?P<prefix>vdo|img)_(?P<num>\d+)\.[^.]+$", re.IGNORECASE
)


def sanitize_username(username: str | None, fallback: str = "media") -> str:
    """Sanitize a username or author string for safe use in Windows filenames."""
    if not username:
        return fallback

    # Strip whitespace and forbidden characters
    cleaned = FORBIDDEN_CHARS_PATTERN.sub("_", username).strip(" .")
    # Normalize multiple underscores and trim boundary underscores/dots
    cleaned = re.sub(r"_+", "_", cleaned).strip("._ ")
    if not cleaned:
        return fallback

    if cleaned.upper() in WINDOWS_RESERVED_NAMES:
        return f"user_{cleaned}"

    return cleaned


def get_media_type_prefix(media_type: MediaType) -> str:
    """Return the sequential filename marker for a media type ('vdo' or 'img')."""
    if media_type == MediaType.VIDEO:
        return "vdo"
    return "img"


def format_sequential_filename(
    username: str,
    media_type: MediaType,
    sequence_number: int,
    extension: str,
) -> str:
    """Format filename according to project standards.

    Examples:
        format_sequential_filename("artist", MediaType.VIDEO, 1, "mp4") -> "artist_vdo_001.mp4"
        format_sequential_filename("artist", MediaType.IMAGE, 12, "png") -> "artist_img_012.png"
    """
    safe_user = sanitize_username(username)
    prefix = get_media_type_prefix(media_type)
    ext = extension.lstrip(".").lower()

    # Format with at least 3 digits (e.g. 001), expanding to 4+ if number >= 1000
    digits = max(3, len(str(sequence_number)))
    padded_number = f"{sequence_number:0{digits}d}"

    return f"{safe_user}_{prefix}_{padded_number}.{ext}"


def extract_sequence_number(filename: str, username: str, media_type: MediaType) -> int | None:
    """Extract sequence number from an existing filename if it matches the pattern."""
    match = SEQUENCE_PATTERN.match(filename)
    if not match:
        return None

    safe_user = sanitize_username(username)
    prefix = get_media_type_prefix(media_type)

    if (
        match.group("username").lower() == safe_user.lower()
        and match.group("prefix").lower() == prefix
    ):
        try:
            return int(match.group("num"))
        except ValueError:
            return None

    return None


def get_next_sequence_number(directory: Path, username: str, media_type: MediaType) -> int:
    """Scan existing directory on disk to find the next sequential number.

    Even if a previous file was manually added or extensions differ (e.g. 001.jpg, 002.png),
    this scans all files to ensure no existing file is ever overwritten.
    """
    if not directory.exists() or not directory.is_dir():
        return 1

    highest = 0
    safe_user = sanitize_username(username)

    for item in directory.iterdir():
        if item.is_file():
            seq = extract_sequence_number(item.name, safe_user, media_type)
            if seq is not None and seq > highest:
                highest = seq

    return highest + 1
