"""Media processing, format conversion, and FFmpeg stream multiplexing package."""

from .ffmpeg import (
    convert_container,
    extract_audio,
    find_ffmpeg,
    find_ffprobe,
    get_ffmpeg_info,
    get_ffmpeg_version,
    inspect_media,
    merge_video_audio,
)
from .thumbnail import (
    generate_image_thumbnail,
    generate_media_thumbnail,
    generate_video_thumbnail,
    get_cached_thumbnail_path,
)

__all__ = [
    "find_ffmpeg",
    "find_ffprobe",
    "get_ffmpeg_version",
    "get_ffmpeg_info",
    "inspect_media",
    "merge_video_audio",
    "convert_container",
    "extract_audio",
    "generate_image_thumbnail",
    "generate_video_thumbnail",
    "generate_media_thumbnail",
    "get_cached_thumbnail_path",
]
