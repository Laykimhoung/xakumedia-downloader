"""Direct media URL detection, header probing, and metadata extraction."""

import re
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit

import httpx

from ..core.logging import get_logger
from ..exceptions.base import (
    MediaUnavailableError,
    NetworkTimeoutError,
    UnsupportedSourceError,
)
from ..models.media import MediaFormatInfo, MediaItem, MediaType
from ..models.url import ClassifiedUrl, UrlCategory
from ..utils.security import validate_url_security

logger = get_logger("scanners.direct")

# Mapping of standard MIME types to file extensions
IMAGE_MIME_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/svg+xml": "svg",
}

VIDEO_MIME_TYPES: dict[str, str] = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "video/x-msvideo": "avi",
    "video/ogg": "ogg",
    "video/mp2t": "ts",
}

IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "tiff", "svg"}
VIDEO_EXTENSIONS = {"mp4", "webm", "mov", "mkv", "avi", "ogg", "m4v", "ts"}

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

FILENAME_DISPOSITION_PATTERN = re.compile(
    r"""filename\*?=(?:UTF-8''|")?([^";\r\n]+)(?:")?""", re.IGNORECASE
)


def extract_filename_from_headers(headers: httpx.Headers, url: str) -> str | None:
    """Extract filename suggestion from Content-Disposition header or URL path."""
    content_disp = headers.get("content-disposition")
    if content_disp:
        match = FILENAME_DISPOSITION_PATTERN.search(content_disp)
        if match:
            candidate = unquote(match.group(1)).strip().strip("\"'")
            if candidate:
                return candidate

    # Fallback to URL path basename
    try:
        parsed = urlsplit(url)
        path = PurePosixPath(unquote(parsed.path))
        if path.name and "." in path.name:
            return path.name
    except Exception:
        pass

    return None


def probe_direct_url(
    url: str, client: httpx.Client | None = None
) -> tuple[httpx.Headers, int, str]:
    """Probe a URL via HTTP HEAD or Range GET to inspect response headers.

    Returns:
        tuple[headers, status_code, final_url]
    """
    safe_url = validate_url_security(url)
    headers = {"User-Agent": DEFAULT_USER_AGENT, "Accept": "*/*"}

    should_close = False
    if client is None:
        client = httpx.Client(follow_redirects=True, timeout=12.0)
        should_close = True

    try:
        # First attempt: HTTP HEAD probe
        response = client.head(safe_url, headers=headers)

        # Fallback to Range GET if HEAD is rejected (common on CDNs / static servers)
        if response.status_code in (403, 405) or response.status_code >= 500:
            logger.debug(f"HEAD returned {response.status_code}, falling back to Range GET: {url}")
            range_headers = {**headers, "Range": "bytes=0-1024"}
            with client.stream("GET", safe_url, headers=range_headers) as stream_resp:
                return stream_resp.headers, stream_resp.status_code, str(stream_resp.url)

        return response.headers, response.status_code, str(response.url)

    except httpx.TimeoutException as exc:
        raise NetworkTimeoutError(
            f"Connection timed out while probing URL: {url}", details={"url": url}
        ) from exc
    except httpx.ConnectError as exc:
        raise MediaUnavailableError(
            f"Failed to connect to host: {exc}", details={"url": url}
        ) from exc
    except httpx.HTTPError as exc:
        raise MediaUnavailableError(
            f"HTTP error occurred while probing URL: {exc}", details={"url": url}
        ) from exc
    finally:
        if should_close:
            client.close()


def classify_direct_url(
    url: str, client: httpx.Client | None = None
) -> tuple[ClassifiedUrl, MediaItem | None]:
    """Classify a target URL and construct a MediaItem if it is a direct image or video."""
    headers, status_code, final_url = probe_direct_url(url, client=client)

    if status_code == 404:
        raise MediaUnavailableError(f"Target media was not found (HTTP 404): {url}")
    if status_code >= 400:
        raise MediaUnavailableError(
            f"Target server returned HTTP error {status_code} for URL: {url}"
        )

    content_type_raw = headers.get("content-type", "").lower()
    # Strip parameters (e.g. "image/jpeg; charset=utf-8" -> "image/jpeg")
    content_type = content_type_raw.split(";")[0].strip()

    # Reject standard HTML pages
    if "text/html" in content_type or "application/xhtml+xml" in content_type:
        parsed = urlsplit(final_url)
        return (
            ClassifiedUrl(
                raw_url=url,
                normalized_url=final_url,
                category=UrlCategory.UNKNOWN,
                domain=parsed.netloc,
                is_supported=False,
            ),
            None,
        )

    # Determine media category and format extension
    media_type: MediaType | None = None
    extension: str | None = None

    if content_type in IMAGE_MIME_TYPES:
        media_type = MediaType.IMAGE
        extension = IMAGE_MIME_TYPES[content_type]
    elif content_type in VIDEO_MIME_TYPES:
        media_type = MediaType.VIDEO
        extension = VIDEO_MIME_TYPES[content_type]
    elif content_type in ("application/octet-stream", "binary/octet-stream", ""):
        # Inspect extension from filename or URL
        suggested_filename = extract_filename_from_headers(headers, final_url)
        if suggested_filename:
            ext = suggested_filename.rsplit(".", 1)[-1].lower()
            if ext in IMAGE_EXTENSIONS:
                media_type = MediaType.IMAGE
                extension = ext
            elif ext in VIDEO_EXTENSIONS:
                media_type = MediaType.VIDEO
                extension = ext

    if not media_type or not extension:
        raise UnsupportedSourceError(
            f"URL does not point to a supported direct image or video stream. "
            f"(Content-Type: '{content_type_raw or 'empty'}')",
            details={"content_type": content_type_raw, "url": final_url},
        )

    parsed = urlsplit(final_url)
    domain = parsed.netloc

    content_length_str = headers.get("content-length")
    content_length = (
        int(content_length_str)
        if content_length_str and content_length_str.isdigit()
        else None
    )

    filename = extract_filename_from_headers(headers, final_url) or f"media.{extension}"
    title = filename.rsplit(".", 1)[0]

    category = (
        UrlCategory.DIRECT_IMAGE
        if media_type == MediaType.IMAGE
        else UrlCategory.DIRECT_VIDEO
    )

    classified = ClassifiedUrl(
        raw_url=url,
        normalized_url=final_url,
        category=category,
        domain=domain,
        title_hint=title,
        author_hint=domain,
        is_supported=True,
    )

    format_info = MediaFormatInfo(
        format_id="direct",
        container=extension,
        filesize_bytes=content_length,
        is_direct_stream=True,
        url=final_url,
    )

    media_item = MediaItem(
        source_url=url,
        original_url=final_url,
        media_type=media_type,
        title=title,
        author=domain,
        thumbnail_url=final_url if media_type == MediaType.IMAGE else None,
        filesize_bytes=content_length,
        available_formats=[format_info],
    )

    return classified, media_item
