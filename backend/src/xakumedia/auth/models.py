"""Data models for cookies, session profiles, and custom domain headers."""

from datetime import UTC, datetime

from pydantic import BaseModel, Field


class CookieEntry(BaseModel):
    """Represents a single Netscape HTTP cookie entry."""

    domain: str
    flag: bool = True  # Include subdomains (TRUE/FALSE in Netscape format)
    path: str = "/"
    secure: bool = False
    expiration: int = 0  # 0 denotes session cookie
    name: str
    value: str

    def to_netscape_line(self) -> str:
        """Format cookie as a standard tab-delimited Netscape line."""
        flag_str = "TRUE" if self.flag else "FALSE"
        secure_str = "TRUE" if self.secure else "FALSE"
        parts = [
            self.domain,
            flag_str,
            self.path,
            secure_str,
            str(self.expiration),
            self.name,
            self.value,
        ]
        return "\t".join(parts)


class CookieProfileRecord(BaseModel):
    """Database record representing a saved session cookie profile."""

    id: str
    domain: str
    browser_source: str | None = None  # e.g., 'chrome', 'edge', 'firefox', 'file'
    cookie_file_path: str
    cookie_count: int = Field(default=0, ge=0)
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class DomainHeaderRecord(BaseModel):
    """Custom request headers configured for a specific domain."""

    domain: str
    headers: dict[str, str] = Field(default_factory=dict)
    updated_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
