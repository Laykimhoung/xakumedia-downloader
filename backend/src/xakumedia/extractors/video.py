"""Video metadata extraction and format normalization using yt-dlp."""

from typing import Any
from urllib.parse import urlsplit

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError

from ..core.logging import get_logger
from ..exceptions.base import (
    DRMProtectedError,
    ExtractionError,
    MediaUnavailableError,
    PrivateMediaError,
    RateLimitError,
    UnsupportedSourceError,
)
from ..models.media import MediaFormatInfo, MediaItem, MediaType
from ..models.url import ClassifiedUrl, UrlCategory
from ..utils.security import validate_url_security

logger = get_logger("extractors.video")


def parse_yt_dlp_error(error_message: str, url: str) -> ExtractionError:
    """Map yt-dlp error text to specific domain exceptions."""
    lower_msg = error_message.lower()

    if any(k in lower_msg for k in ("private video", "sign in", "members-only", "login required")):
        return PrivateMediaError(
            f"Video is private or requires authentication: {error_message}",
            details={"url": url},
        )
    if any(k in lower_msg for k in ("unavailable", "removed", "not exist", "not found", "404")):
        return MediaUnavailableError(
            f"Video is unavailable or was removed: {error_message}",
            details={"url": url},
        )
    if any(k in lower_msg for k in ("429", "too many requests", "rate limit")):
        return RateLimitError(
            f"Rate limited by video platform: {error_message}",
            details={"url": url},
        )
    if any(k in lower_msg for k in ("drm", "protected")):
        return DRMProtectedError(
            f"Video is protected by DRM: {error_message}",
            details={"url": url},
        )
    if any(
        k in lower_msg for k in ("unsupported url", "no suitable extractor", "is not a valid url")
    ):
        return UnsupportedSourceError(
            f"No video extractor supports this URL: {url}",
            details={"url": url},
        )

    return ExtractionError(f"Extraction failed: {error_message}", details={"url": url})


def normalize_formats(raw_formats: list[dict[str, Any]]) -> list[MediaFormatInfo]:
    """Parse and normalize raw yt-dlp format dictionaries into MediaFormatInfo models."""
    normalized: list[MediaFormatInfo] = []

    for f in raw_formats:
        vcodec = f.get("vcodec") or "none"
        acodec = f.get("acodec") or "none"

        # Skip storyboards, mhtml, and non-media streams
        if vcodec == "none" and acodec == "none":
            continue
        format_note = str(f.get("format_note") or "").lower()
        if "storyboard" in format_note:
            continue

        format_id = str(f.get("format_id") or "unknown")
        container = f.get("ext")
        height = f.get("height")
        width = f.get("width")
        fps = float(f["fps"]) if f.get("fps") else None
        filesize = f.get("filesize") or f.get("filesize_approx")

        # Determine if separate audio/video stream requiring FFmpeg merge
        is_video = vcodec != "none"
        has_audio = acodec != "none"
        requires_merge = is_video and not has_audio

        resolution_str = f"{height}p" if height else (f.get("resolution") or None)

        normalized.append(
            MediaFormatInfo(
                format_id=format_id,
                container=container,
                resolution=resolution_str,
                video_codec=vcodec if vcodec != "none" else None,
                audio_codec=acodec if acodec != "none" else None,
                width=width,
                height=height,
                fps=fps,
                filesize_bytes=filesize,
                is_direct_stream=not requires_merge,
                url=f.get("url"),
                requires_merge=requires_merge,
                format_note=f.get("format_note"),
            )
        )

    # Sort formats from highest resolution to lowest
    normalized.sort(key=lambda fmt: (fmt.height or 0, fmt.filesize_bytes or 0), reverse=True)
    return normalized


def extract_video_info(
    url: str,
    ydl_opts: dict[str, Any] | None = None,
) -> tuple[ClassifiedUrl, MediaItem]:
    """Extract metadata and stream formats for a video URL without downloading the media.

    Returns:
        tuple[ClassifiedUrl, MediaItem]
    """
    safe_url = validate_url_security(url)

    base_opts: dict[str, Any] = {
        "extract_flat": False,
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "simulate": True,
        "noplaylist": True,
        "socket_timeout": 15,
    }
    if ydl_opts:
        base_opts.update(ydl_opts)

    try:
        with yt_dlp.YoutubeDL(base_opts) as ydl:
            info = ydl.extract_info(safe_url, download=False)
    except (DownloadError, ExtractorError) as exc:
        raise parse_yt_dlp_error(str(exc), safe_url) from exc
    except Exception as exc:
        logger.error(f"Unexpected error extracting video from {url}: {exc}", exc_info=True)
        raise ExtractionError(
            f"Unexpected extraction failure: {exc}", details={"url": url}
        ) from exc

    if not info:
        raise MediaUnavailableError(f"Could not extract video metadata from: {url}")

    # Handle playlist/multi-item response by taking the first item if flat
    if "entries" in info:
        entries = [e for e in info.get("entries", []) if e]
        if not entries:
            raise MediaUnavailableError(f"No video entries found in source: {url}")
        info = entries[0]

    parsed = urlsplit(safe_url)
    domain = parsed.netloc

    title = info.get("title") or "Untitled Video"
    author = (
        info.get("uploader")
        or info.get("channel")
        or info.get("creator")
        or info.get("uploader_id")
        or domain
    )
    thumbnail = info.get("thumbnail")
    duration = float(info["duration"]) if info.get("duration") else None
    extractor_key = info.get("extractor_key") or info.get("extractor") or "Generic"
    webpage_url = info.get("webpage_url") or safe_url

    formats = normalize_formats(info.get("formats", []))

    # Calculate overall filesize estimate from best format if root filesize is missing
    filesize = info.get("filesize") or info.get("filesize_approx")
    if not filesize and formats:
        filesize = formats[0].filesize_bytes

    classified = ClassifiedUrl(
        raw_url=url,
        normalized_url=webpage_url,
        category=UrlCategory.DIRECT_VIDEO,
        platform=extractor_key,
        domain=domain,
        author_hint=author,
        title_hint=title,
        is_supported=True,
    )

    media_item = MediaItem(
        source_url=url,
        original_url=webpage_url,
        media_type=MediaType.VIDEO,
        title=title,
        author=author,
        thumbnail_url=thumbnail,
        duration_seconds=duration,
        width=info.get("width") or (formats[0].width if formats else None),
        height=info.get("height") or (formats[0].height if formats else None),
        filesize_bytes=filesize,
        available_formats=formats,
        metadata_extra={
            "extractor": extractor_key,
            "view_count": str(info.get("view_count") or ""),
            "like_count": str(info.get("like_count") or ""),
        },
    )

    return classified, media_item
