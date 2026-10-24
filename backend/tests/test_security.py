"""Unit tests for URL validation and SSRF security defenses."""

from unittest.mock import patch

import pytest

from xakumedia.exceptions.base import SSRFBlockedError, UrlClassificationError
from xakumedia.utils.security import validate_url_security


def test_validate_url_security_valid() -> None:
    # Public domain URLs
    with patch("socket.getaddrinfo", return_value=[(2, 1, 0, "", ("93.184.216.34", 80))]):
        assert (
            validate_url_security("https://example.com/video.mp4")
            == "https://example.com/video.mp4"
        )
        assert (
            validate_url_security("http://cdn.test.org/image.jpg")
            == "http://cdn.test.org/image.jpg"
        )


def test_validate_url_security_invalid_scheme() -> None:
    with pytest.raises(UrlClassificationError, match="Unsupported URL scheme 'ftp'"):
        validate_url_security("ftp://example.com/file.zip")

    with pytest.raises(UrlClassificationError, match="Unsupported URL scheme 'file'"):
        validate_url_security("file:///C:/Windows/System32/calc.exe")

    with pytest.raises(UrlClassificationError, match="non-empty string"):
        validate_url_security("")


def test_validate_url_security_blocked_hostnames() -> None:
    with pytest.raises(SSRFBlockedError, match="blocked local hostname 'localhost'"):
        validate_url_security("http://localhost:8080/media.mp4")

    with pytest.raises(SSRFBlockedError):
        validate_url_security("http://localhost.localdomain/secret")


def test_validate_url_security_private_ip_literals() -> None:
    # IPv4 Loopback
    with pytest.raises(SSRFBlockedError, match="private/local IP address '127.0.0.1'"):
        validate_url_security("http://127.0.0.1/video.mp4")

    # IPv4 RFC1918 Private
    with pytest.raises(SSRFBlockedError, match="private/local IP address '192.168.1.1'"):
        validate_url_security("http://192.168.1.1/router.jpg")

    with pytest.raises(SSRFBlockedError, match="private/local IP address '10.0.0.1'"):
        validate_url_security("http://10.0.0.1/private.png")

    # Cloud Instance Metadata (Link-Local)
    with pytest.raises(SSRFBlockedError, match="private/local IP address '169.254.169.254'"):
        validate_url_security("http://169.254.169.254/latest/meta-data/")

    # IPv6 Loopback
    with pytest.raises(SSRFBlockedError, match="private/local IP address '::1'"):
        validate_url_security("http://[::1]:3000/media.mp4")


def test_validate_url_security_resolved_private_ip() -> None:
    # Attacker domain resolving to private IP
    with patch("socket.getaddrinfo", return_value=[(2, 1, 0, "", ("127.0.0.1", 80))]):
        with pytest.raises(SSRFBlockedError, match="resolves to private/local IP '127.0.0.1'"):
            validate_url_security("http://malicious-local-dns.com/hack")


def test_validate_url_security_advanced_ip_formats() -> None:
    # Integer IP (2130706433 is 127.0.0.1)
    with pytest.raises(SSRFBlockedError, match="127.0.0.1"):
        validate_url_security("http://2130706433/exploit")

    # Hex IP (0x7f000001 is 127.0.0.1)
    with pytest.raises(SSRFBlockedError, match="127.0.0.1"):
        validate_url_security("http://0x7f000001/exploit")

    # Octal IP (0177.0.0.1 is 127.0.0.1)
    with pytest.raises(SSRFBlockedError, match="127.0.0.1"):
        validate_url_security("http://0177.0.0.1/exploit")

    # 0.0.0.0 unspecified IP
    with pytest.raises(SSRFBlockedError, match="0.0.0.0"):
        validate_url_security("http://0.0.0.0/exploit")

    # IPv4-mapped IPv6
    with pytest.raises(SSRFBlockedError, match="127.0.0.1"):
        validate_url_security("http://[::ffff:127.0.0.1]/exploit")

    # CGNAT / Alibaba cloud metadata (100.100.100.200)
    with pytest.raises(SSRFBlockedError, match="100.100.100.200"):
        validate_url_security("http://100.100.100.200/latest/meta-data/")


def test_validate_url_security_metadata_and_suffix_blocklist() -> None:
    # Cloud metadata hosts
    with pytest.raises(SSRFBlockedError, match="blocked local hostname 'metadata.google.internal'"):
        validate_url_security("http://metadata.google.internal/computeMetadata/v1/")

    with pytest.raises(SSRFBlockedError, match="blocked local hostname 'instance-data'"):
        validate_url_security("http://instance-data/latest/meta-data/")

    # Forbidden TLDs and local domains
    with pytest.raises(SSRFBlockedError):
        validate_url_security("http://router.local/admin")

    with pytest.raises(SSRFBlockedError):
        validate_url_security("http://internal-server.internal/metrics")

    with pytest.raises(SSRFBlockedError):
        validate_url_security("http://my-nas.lan/media")

    with pytest.raises(SSRFBlockedError):
        validate_url_security("http://device.home.arpa/status")

