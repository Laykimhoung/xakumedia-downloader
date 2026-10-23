"""Local media thumbnail generation and disk caching using Pillow and FFmpeg."""

import subprocess
from pathlib import Path
from typing import Any

from PIL import Image

from ..core.config import default_config
from ..core.logging import get_logger
from ..exceptions.base import MediaProcessingError
from .ffmpeg import find_ffmpeg

logger = get_logger("processor.thumbnail")


def get_cached_thumbnail_path(item_id: str) -> Path:
    """Return the deterministic cache path for a media item's thumbnail."""
    default_config.thumbnails_dir.mkdir(parents=True, exist_ok=True)
    safe_id = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in item_id)
    return default_config.thumbnails_dir / f"{safe_id}.webp"


def generate_image_thumbnail(
    image_path: Path,
    output_path: Path,
    max_size: tuple[int, int] = (360, 360),
    quality: int = 85,
) -> Path:
    """Generate a lightweight WebP thumbnail from an existing local image using Pillow."""
    if not image_path.exists():
        raise FileNotFoundError(f"Source image '{image_path}' not found.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_output = output_path.with_suffix(".tmp.webp")

    try:
        with Image.open(image_path) as img:
            # Handle orientation if present in EXIF
            try:
                from PIL import ImageOps

                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            # Convert to RGB or RGBA depending on transparency
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                thumb = img.convert("RGBA")
            else:
                thumb = img.convert("RGB")

            thumb.thumbnail(max_size, Image.Resampling.LANCZOS)
            thumb.save(temp_output, format="WEBP", quality=quality, method=4)

        temp_output.replace(output_path)
        size = output_path.stat().st_size
        logger.info(f"Generated image thumbnail: {output_path} ({size} bytes)")
        return output_path
    except Exception as err:
        if temp_output.exists():
            temp_output.unlink(missing_ok=True)
        if isinstance(err, FileNotFoundError):
            raise
        msg = f"Failed to generate image thumbnail for '{image_path}': {err}"
        raise MediaProcessingError(msg) from err


def generate_video_thumbnail(
    video_path: Path,
    output_path: Path,
    timestamp_sec: float = 1.0,
    max_width: int = 480,
    quality: int = 85,
) -> Path:
    """Extract a representative video frame and encode as a WebP thumbnail using FFmpeg."""
    if not video_path.exists():
        raise FileNotFoundError(f"Source video '{video_path}' not found.")

    ffmpeg_bin = find_ffmpeg()
    if not ffmpeg_bin:
        raise MediaProcessingError("FFmpeg binary is required to generate video thumbnails.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_output = output_path.with_suffix(".tmp.webp")

    # Command: seek to timestamp, grab 1 frame, scale to max width, save as webp
    cmd = [
        str(ffmpeg_bin),
        "-y",
        "-ss",
        f"{max(0.0, timestamp_sec):.2f}",
        "-i",
        str(video_path),
        "-vframes",
        "1",
        "-vf",
        f"scale='min({max_width},iw)':-1",
        "-q:v",
        str(100 - quality),
        str(temp_output),
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, shell=False)
        if proc.returncode != 0 or not temp_output.exists() or temp_output.stat().st_size == 0:
            # Fallback to frame 0 if timestamp was beyond short video duration
            if timestamp_sec > 0:
                cmd[3] = "0.00"
                proc = subprocess.run(cmd, capture_output=True, text=True, check=False, shell=False)

        if proc.returncode != 0 or not temp_output.exists() or temp_output.stat().st_size == 0:
            err_msg = proc.stderr.strip() if proc.stderr else "Unknown FFmpeg error"
            raise MediaProcessingError(f"FFmpeg thumbnail extraction failed: {err_msg}")

        temp_output.replace(output_path)
        size = output_path.stat().st_size
        logger.info(f"Generated video thumbnail: {output_path} ({size} bytes)")
        return output_path
    except Exception as err:
        if temp_output.exists():
            temp_output.unlink(missing_ok=True)
        if isinstance(err, (FileNotFoundError, MediaProcessingError)):
            raise
        msg = f"Failed to extract video thumbnail for '{video_path}': {err}"
        raise MediaProcessingError(msg) from err


def generate_media_thumbnail(
    source_path: Path | str,
    item_id: str,
    media_type: str = "image",
    force_regenerate: bool = False,
    timestamp_sec: float = 1.0,
) -> dict[str, Any]:
    """Generate or retrieve a cached thumbnail for a local media file."""
    src = Path(source_path)
    if not src.exists():
        raise FileNotFoundError(f"Media source file '{src}' does not exist.")

    cached_path = get_cached_thumbnail_path(item_id)
    if not force_regenerate and cached_path.exists() and cached_path.stat().st_size > 0:
        return {
            "item_id": item_id,
            "thumbnail_path": str(cached_path),
            "cached": True,
            "size_bytes": cached_path.stat().st_size,
        }

    mtype = media_type.lower()
    if mtype == "video":
        out = generate_video_thumbnail(src, cached_path, timestamp_sec=timestamp_sec)
    else:
        out = generate_image_thumbnail(src, cached_path)

    return {
        "item_id": item_id,
        "thumbnail_path": str(out),
        "cached": False,
        "size_bytes": out.stat().st_size,
    }
