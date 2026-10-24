"""URL and network security validation, including hardened SSRF defenses."""

import ipaddress
import socket
from urllib.parse import urlsplit

from ..exceptions.base import SSRFBlockedError, UrlClassificationError

BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
    "instance-data",
    "metadata",
    "metadata.google.internal",
    "metadata.internal",
}

BLOCKED_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".localdomain",
    ".lan",
    ".home.arpa",
)


def parse_ip_literal(hostname: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """Parse various IP literal formats: standard, integer, hex, octal, or bracketed IPv6."""
    cleaned = hostname.strip("[]").lower()

    # 1. Standard ipaddress parse (covers standard IPv4 and IPv6)
    try:
        return ipaddress.ip_address(cleaned)
    except ValueError:
        pass

    # 2. Integer format (e.g. 2130706433 for 127.0.0.1)
    if cleaned.isdigit():
        try:
            val = int(cleaned)
            if 0 <= val <= 0xFFFFFFFF:
                return ipaddress.IPv4Address(val)
        except ValueError:
            pass

    # 3. Hex format (e.g. 0x7f000001)
    if cleaned.startswith(("0x", "0X")):
        try:
            val = int(cleaned, 16)
            if 0 <= val <= 0xFFFFFFFF:
                return ipaddress.IPv4Address(val)
        except ValueError:
            pass

    # 4. Octal or mixed dotted quad (e.g. 0177.0.0.1 or 0x7f.0.0.1)
    parts = cleaned.split(".")
    if len(parts) == 4:
        try:
            octets = []
            for p in parts:
                if p.startswith(("0x", "0X")):
                    octets.append(int(p, 16))
                elif p.startswith("0") and len(p) > 1 and p.isdigit():
                    octets.append(int(p, 8))
                elif p.isdigit():
                    octets.append(int(p, 10))
                else:
                    return None
            if all(0 <= o <= 255 for o in octets):
                return ipaddress.IPv4Address(
                    (octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]
                )
        except (ValueError, IndexError):
            pass

    return None


def is_ip_private_or_local(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an IP address belongs to private, loopback, or non-global ranges."""
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
        or not ip.is_global
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

    # Check hostname blocklist and forbidden suffixes
    if hostname_lower in BLOCKED_HOSTNAMES or hostname_lower.endswith(BLOCKED_SUFFIXES):
        raise SSRFBlockedError(
            f"Access to blocked local hostname '{hostname}' is not permitted.",
            details={"hostname": hostname, "reason": "blocked_hostname"},
        )

    # Check if hostname is an explicit IP literal (standard, integer, hex, octal, bracketed)
    parsed_ip = parse_ip_literal(hostname_lower)
    if parsed_ip:
        if isinstance(parsed_ip, ipaddress.IPv6Address) and parsed_ip.ipv4_mapped:
            if is_ip_private_or_local(parsed_ip.ipv4_mapped):
                raise SSRFBlockedError(
                    f"Access to mapped IP '{parsed_ip.ipv4_mapped}' is blocked for security.",
                    details={
                        "hostname": hostname,
                        "ip": str(parsed_ip.ipv4_mapped),
                        "reason": "private_ip",
                    },
                )
        if is_ip_private_or_local(parsed_ip):
            raise SSRFBlockedError(
                f"Access to private/local IP address '{parsed_ip}' is blocked for security.",
                details={"hostname": hostname, "ip": str(parsed_ip), "reason": "private_ip"},
            )
        return cleaned_url

    # Resolve hostname to verify destination IP addresses
    try:
        addr_info = socket.getaddrinfo(hostname_lower, None)
        for _family, _socktype, _proto, _canonname, sockaddr in addr_info:
            ip_str = sockaddr[0]
            try:
                resolved_ip = ipaddress.ip_address(ip_str)
                if isinstance(resolved_ip, ipaddress.IPv6Address) and resolved_ip.ipv4_mapped:
                    if is_ip_private_or_local(resolved_ip.ipv4_mapped):
                        raise SSRFBlockedError(
                            f"Hostname '{hostname}' resolves to mapped IP "
                            f"'{resolved_ip.ipv4_mapped}'.",
                            details={
                                "hostname": hostname,
                                "ip": str(resolved_ip.ipv4_mapped),
                                "reason": "resolved_private_ip",
                            },
                        )
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
