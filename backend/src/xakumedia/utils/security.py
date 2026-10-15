"""URL and network security validation, including SSRF defenses."""

import ipaddress
import socket
from urllib.parse import urlsplit

from ..exceptions.base import SSRFBlockedError, UrlClassificationError

BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
}


def is_ip_private_or_local(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an IP address belongs to private, loopback, link-local, or reserved ranges."""
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def validate_url_security(url: str, allow_private: bool = False) -> str:
    """Validate that a URL uses safe protocols and does not point to internal/SSRF targets.

    Raises:
        UrlClassificationError: If the scheme is invalid or hostname is missing.
        SSRFBlockedError: If the destination resolves to a private, loopback, or reserved address.
    """
    if not url or not isinstance(url, str):
        raise UrlClassificationError("URL must be a non-empty string.")

    cleaned_url = url.strip()
    try:
        parsed = urlsplit(cleaned_url)
    except Exception as exc:
        raise UrlClassificationError(f"Malformed URL: {exc}") from exc

    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        raise UrlClassificationError(
            f"Unsupported URL scheme '{scheme}'. Only HTTP and HTTPS are permitted."
        )

    hostname = parsed.hostname
    if not hostname:
        raise UrlClassificationError("URL is missing a valid hostname.")

    hostname_lower = hostname.lower()

    if allow_private:
        return cleaned_url

    # Check hostname blocklist
    if hostname_lower in BLOCKED_HOSTNAMES:
        raise SSRFBlockedError(
            f"Access to blocked local hostname '{hostname}' is not permitted.",
            details={"hostname": hostname, "reason": "blocked_hostname"},
        )

    # Check if hostname is an explicit IP address
    try:
        ip = ipaddress.ip_address(hostname_lower)
        if is_ip_private_or_local(ip):
            raise SSRFBlockedError(
                f"Access to private/local IP address '{ip}' is blocked for security.",
                details={"hostname": hostname, "ip": str(ip), "reason": "private_ip"},
            )
        return cleaned_url
    except ValueError:
        # Not a raw IP literal; proceed to DNS resolution check
        pass

    # Resolve hostname to verify destination IP addresses
    try:
        addr_info = socket.getaddrinfo(hostname_lower, None)
        for family, _socktype, _proto, _canonname, sockaddr in addr_info:
            ip_str = sockaddr[0]
            try:
                resolved_ip = ipaddress.ip_address(ip_str)
                if is_ip_private_or_local(resolved_ip):
                    raise SSRFBlockedError(
                        f"Hostname '{hostname}' resolves to private/local IP '{resolved_ip}'.",
                        details={
                            "hostname": hostname,
                            "ip": str(resolved_ip),
                            "reason": "resolved_private_ip",
                        },
                    )
            except ValueError:
                continue
    except socket.gaierror:
        # DNS resolution failure will be caught as a network error by the HTTP client later
        pass

    return cleaned_url
