"""Domain-specific custom header resolution and request header synthesis."""

from urllib.parse import urlparse

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

DEFAULT_REQUEST_HEADERS = {
    "User-Agent": DEFAULT_USER_AGENT,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
}


def extract_domain_from_url(url_or_domain: str) -> str:
    """Extract clean lowercase host domain from a URL or raw domain string."""
    cleaned = url_or_domain.strip().lower()
    if "://" in cleaned:
        try:
            parsed = urlparse(cleaned)
            return (parsed.netloc or "").split(":")[0].lstrip(".")
        except Exception:
            pass
    # If no protocol or parsing failed, clean domain text directly
    domain_part = cleaned.split("/")[0].split(":")[0]
    return domain_part.lstrip(".")


def match_domain_headers(
    url_or_domain: str,
    headers_map: dict[str, dict[str, str]],
) -> dict[str, str]:
    """Find the best-matching headers for a domain, checking subdomains hierarchically.

    For example, for 'v.redd.it', checks 'v.redd.it' first, then 'redd.it'.
    """
    domain = extract_domain_from_url(url_or_domain)
    if not domain:
        return {}

    # 1. Exact match
    if domain in headers_map:
        return dict(headers_map[domain])

    # 2. Check parent domains (e.g., sub.example.com -> example.com)
    parts = domain.split(".")
    while len(parts) > 1:
        parts.pop(0)
        candidate = ".".join(parts)
        if candidate in headers_map:
            return dict(headers_map[candidate])

    return {}


def build_request_headers_for_url(
    url: str,
    headers_map: dict[str, dict[str, str]] | None = None,
    extra_headers: dict[str, str] | None = None,
) -> dict[str, str]:
    """Synthesize complete HTTP headers for a URL merging defaults, domain rules, and overrides."""
    headers = dict(DEFAULT_REQUEST_HEADERS)

    if headers_map:
        matched = match_domain_headers(url, headers_map)
        headers.update(matched)

    if extra_headers:
        headers.update(extra_headers)

    return headers
