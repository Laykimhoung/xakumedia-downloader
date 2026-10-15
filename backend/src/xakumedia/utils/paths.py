"""Filesystem path security and temporary file utilities."""

from pathlib import Path

from ..exceptions.base import InvalidDestinationError


def validate_destination_path(target_path: Path, allowed_root: Path) -> Path:
    """Validate that target_path resides safely within allowed_root, preventing path traversal."""
    resolved_target = target_path.resolve()
    resolved_root = allowed_root.resolve()

    try:
        resolved_target.relative_to(resolved_root)
    except ValueError:
        raise InvalidDestinationError(
            f"Destination path '{target_path}' is outside the authorized download directory "
            f"'{allowed_root}'.",
            details={"target": str(target_path), "allowed_root": str(allowed_root)},
        )

    return resolved_target


def get_temp_download_path(final_path: Path) -> Path:
    """Generate temporary file path used during active file streaming."""
    return final_path.with_name(f"{final_path.name}.tmp")
