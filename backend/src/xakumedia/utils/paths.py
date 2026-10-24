"""Filesystem path security and temporary file utilities."""

from pathlib import Path

from ..exceptions.base import InvalidDestinationError

WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
}


def validate_destination_path(target_path: Path, allowed_root: Path) -> Path:
    """Validate that target_path resides safely within allowed_root, preventing path traversal,
    NTFS alternate data streams, reserved device names, UNC traversal, and null byte exploits.
    """
    raw_str = str(target_path)

    # 1. Reject null bytes
    if "\0" in raw_str:
        raise InvalidDestinationError(
            f"Destination path contains forbidden null byte characters: '{target_path}'",
            details={"target": raw_str, "reason": "null_byte"},
        )

    # 2. Reject UNC network paths
    if raw_str.startswith(("\\\\", "//")):
        raise InvalidDestinationError(
            f"UNC network paths are not permitted for destination storage: '{target_path}'",
            details={"target": raw_str, "reason": "unc_path"},
        )

    # 3. Reject NTFS alternate data streams (ADS) in filename
    if ":" in target_path.name:
        raise InvalidDestinationError(
            f"Destination filename '{target_path.name}' contains forbidden "
            "NTFS alternate data stream syntax (':').",
            details={
                "target": raw_str,
                "filename": target_path.name,
                "reason": "alternate_data_stream",
            },
        )

    # 4. Reject Windows reserved device names
    for part in target_path.parts:
        # Strip trailing dots or spaces which Windows would normalize
        part_clean = part.strip(". ")
        stem_clean = Path(part_clean).stem.upper()
        if stem_clean in WINDOWS_RESERVED_NAMES or part_clean.upper() in WINDOWS_RESERVED_NAMES:
            raise InvalidDestinationError(
                f"Destination path component '{part}' uses a Windows reserved device name.",
                details={
                    "target": raw_str,
                    "reserved_name": part,
                    "reason": "reserved_device_name",
                },
            )

    # 5. Prevent path traversal through standard resolution
    resolved_target = target_path.resolve()
    resolved_root = allowed_root.resolve()

    try:
        resolved_target.relative_to(resolved_root)
    except ValueError:
        raise InvalidDestinationError(
            f"Destination path '{target_path}' is outside the authorized download directory "
            f"'{allowed_root}'.",
            details={
                "target": raw_str,
                "allowed_root": str(allowed_root),
                "reason": "path_traversal",
            },
        )

    return resolved_target


def get_temp_download_path(final_path: Path) -> Path:
    """Generate temporary file path used during active file streaming."""
    return final_path.with_name(f"{final_path.name}.tmp")
