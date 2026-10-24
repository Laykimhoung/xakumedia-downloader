"""Authentication, cookie jar management, and custom request header integration."""

from .cookies import (
    SUPPORTED_BROWSERS,
    extract_browser_cookies,
    format_netscape_cookies,
    get_cookies_dict_from_file,
    import_cookies_file,
    list_supported_browsers,
    parse_netscape_cookies,
    save_cookies_text,
)
from .headers import (
    DEFAULT_REQUEST_HEADERS,
    DEFAULT_USER_AGENT,
    build_request_headers_for_url,
    extract_domain_from_url,
    match_domain_headers,
)
from .models import CookieEntry, CookieProfileRecord, DomainHeaderRecord

__all__ = [
    "CookieEntry",
    "CookieProfileRecord",
    "DomainHeaderRecord",
    "parse_netscape_cookies",
    "format_netscape_cookies",
    "save_cookies_text",
    "import_cookies_file",
    "extract_browser_cookies",
    "get_cookies_dict_from_file",
    "list_supported_browsers",
    "SUPPORTED_BROWSERS",
    "DEFAULT_USER_AGENT",
    "DEFAULT_REQUEST_HEADERS",
    "extract_domain_from_url",
    "match_domain_headers",
    "build_request_headers_for_url",
]
