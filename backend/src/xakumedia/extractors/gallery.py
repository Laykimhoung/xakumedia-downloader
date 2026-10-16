"""Gallery and multi-image collection extraction using gallery-dl."""

from typing import Any
from urllib.parse import urlsplit

import gallery_dl.config as gdl_config
import gallery_dl.extractor as gdl_extractor
from gallery_dl.exception import (
    AuthenticationError,
    AuthorizationError,
    HttpError,
    NoExtractorError,
    NotFoundError,
)
from gallery_dl.job import DataJob

from ..core.logging import get_logger
from ..exceptions.base import (
    ExtractionError,
    MediaUnavailableError,
    PrivateMediaError,
    RateLimitError,
    UnsupportedSourceError,
)
from ..models.media import MediaFormatInfo, MediaItem, MediaType
from ..models.url import ClassifiedUrl, UrlCategory
from ..utils.security import validate_url_security

logger = get_logger("extractors.gallery")


def parse_gallery_dl_error(exc: Exception, url: str) -> ExtractionError:
    """Map gallery-dl exceptions to XakuMedia domain exceptions."""
    if isinstance(exc, NoExtractorError):
        return UnsupportedSourceError(
            f"No gallery extractor supports this URL: {url}",
            details={"url": url},
        )
    if isinstance(exc, (AuthenticationError, AuthorizationError)):
        return PrivateMediaError(
            f"Gallery requires authentication or is private: {exc}",
            details={"url": url},
        )
    if isinstance(exc, NotFoundError):
        return MediaUnavailableError(
            f"Gallery was not found or was removed: {exc}",
            details={"url": url},
        )
    if isinstance(exc, HttpError):
        status = getattr(exc, "status", None)
        err_str = str(exc).lower()
        if status == 429 or "429" in err_str or "rate" in err_str:
            return RateLimitError(
                f"Rate limited by gallery host: {exc}",
                details={"url": url},
            )
        if status == 404 or "404" in err_str or "not found" in err_str:
            return MediaUnavailableError(
                f"Gallery item not found: {exc}",
                details={"url": url},
            )
        if status in (401, 403) or any(code in err_str for code in ("401", "403", "forbidden")):
            return PrivateMediaError(
                f"Access denied to gallery: {exc}",
                details={"url": url},
            )

    err_msg = str(exc)
    lower = err_msg.lower()
    if any(k in lower for k in ("sign in", "private", "members-only", "login required")):
        return PrivateMediaError(
            f"Gallery is private or requires authentication: {err_msg}",
            details={"url": url},
        )
    if any(k in lower for k in ("429", "too many requests", "rate limit")):
        return RateLimitError(
            f"Rate limited by gallery host: {err_msg}",
            details={"url": url},
        )
    if any(k in lower for k in ("not found", "404", "does not exist", "removed")):
        return MediaUnavailableError(
            f"Gallery is unavailable or was removed: {err_msg}",
            details={"url": url},
        )

    return ExtractionError(
        f"Gallery extraction failed: {err_msg}",
        details={"url": url},
    )


def extract_gallery_info(
    url: str,
    timeout: int = 15,
) -> tuple[ClassifiedUrl, list[MediaItem]]:
    """Extract metadata and media items from a gallery or album URL without downloading files.

    Returns:
        tuple[ClassifiedUrl, list[MediaItem]]
    """
    safe_url = validate_url_security(url)

    # 1. Probe if a gallery-dl extractor recognizes this URL
    ext_instance = gdl_extractor.find(safe_url)
    if not ext_instance:
        raise UnsupportedSourceError(
            f"No gallery extractor supports this URL: {url}",
            details={"url": url},
        )

    # 2. Configure gallery-dl options
    gdl_config.set(("extractor",), "timeout", timeout)

    # 3. Collect media metadata using DataJob with file=None to prevent stdout pollution
    try:
        job = DataJob(safe_url, file=None)
        job.run()
    except Exception as exc:
        raise parse_gallery_dl_error(exc, safe_url) from exc

    if job.exception:
        raise parse_gallery_dl_error(job.exception, safe_url)

    if not job.data_urls:
        raise MediaUnavailableError(
            f"No media items found in gallery: {url}",
            details={"url": url},
        )

    parsed = urlsplit(safe_url)
    domain = parsed.netloc

    post_info: dict[str, Any] = job.data_post[0] if job.data_post else {}
    album_title = (
        post_info.get("title")
        or post_info.get("description")
        or (f"{domain} Gallery" if domain else "Gallery")
    )
    author = (
        post_info.get("author")
        or post_info.get("user")
        or post_info.get("artist")
        or post_info.get("uploader")
        or "gallery"
    )

    items: list[MediaItem] = []
    total_items = len(job.data_urls)

    for idx, media_url in enumerate(job.data_urls):
        meta: dict[str, Any] = job.data_meta[idx] if idx < len(job.data_meta) else {}

        # Determine file extension and container
        ext = meta.get("extension")
        if not ext and "." in media_url.split("?")[0]:
            ext = media_url.split("?")[0].rsplit(".", 1)[-1].lower()
        if not ext:
            ext = "jpg"

        # Categorize media type (some galleries include short mp4/webm clips or animated gifs)
        is_video = ext.lower() in ("mp4", "webm", "mkv", "mov", "avi")
        media_type = MediaType.VIDEO if is_video else MediaType.IMAGE

        item_title = meta.get("title") or meta.get("filename")
        if not item_title:
            item_title = f"{album_title} - {idx + 1}" if total_items > 1 else album_title

        item_author = (
            meta.get("author")
            or meta.get("user")
            or meta.get("artist")
            or author
        )

        width = meta.get("width")
        height = meta.get("height")
        filesize = meta.get("filesize") or meta.get("size")
        thumb_url = meta.get("thumbnail") or (media_url if media_type == MediaType.IMAGE else None)

        format_info = MediaFormatInfo(
            format_id="original",
            container=ext,
            resolution=f"{width}x{height}" if width and height else None,
            width=width,
            height=height,
            filesize_bytes=filesize,
            is_direct_stream=True,
            url=media_url,
            requires_merge=False,
            format_note=meta.get("format") or "original",
        )

        items.append(
            MediaItem(
                source_url=safe_url,
                media_type=media_type,
                title=item_title,
                author=item_author,
                thumbnail_url=thumb_url,
                original_url=media_url,
                width=width,
                height=height,
                filesize_bytes=filesize,
                available_formats=[format_info],
                metadata_extra={
                    "gallery_index": idx + 1,
                    "gallery_total": total_items,
                    "album_title": album_title,
                },
            )
        )

    category_name = ext_instance.category if hasattr(ext_instance, "category") else "gallery"
    classified = ClassifiedUrl(
        raw_url=url,
        normalized_url=safe_url,
        category=UrlCategory.GALLERY,
        platform=category_name,
        domain=domain,
        author_hint=author,
        title_hint=album_title,
        is_supported=True,
        requires_auth=False,
        metadata_extra={"item_count": str(len(items))},
    )

    return classified, items
