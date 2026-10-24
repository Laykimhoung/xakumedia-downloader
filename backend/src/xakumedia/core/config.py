"""Application configuration, directory management, and persistent preferences."""

from pathlib import Path

from platformdirs import user_cache_dir, user_data_dir, user_downloads_dir
from pydantic import BaseModel, Field

from ..models.quality import ImageFormat, VideoContainer, VideoResolution


class AppConfig(BaseModel):
    """Runtime configuration and preferences for XakuMedia."""

    app_name: str = "XakuMedia"
    app_author: str = "XAKURAII"
    version: str = "0.1.0"

    # Base Paths
    data_dir: Path = Field(default_factory=lambda: Path(user_data_dir("XakuMedia", "XAKURAII")))
    cache_dir: Path = Field(default_factory=lambda: Path(user_cache_dir("XakuMedia", "XAKURAII")))
    download_dir: Path = Field(default_factory=lambda: Path(user_downloads_dir()) / "XakuMedia")

    # Concurrency and Network Limits
    max_concurrent_downloads: int = Field(default=4, ge=1, le=16)
    max_retries: int = Field(default=3, ge=0, le=10)
    request_timeout_seconds: float = Field(default=30.0, ge=5.0, le=300.0)
    max_download_speed_kbps: int = Field(default=0, ge=0)  # 0 = Unlimited

    # Defaults for Media Pipelines
    default_video_resolution: VideoResolution = VideoResolution.RES_1080P
    default_video_container: VideoContainer = VideoContainer.MP4
    default_image_format: ImageFormat = ImageFormat.ORIGINAL

    # Media Processing & External Tools
    ffmpeg_binary: Path | None = None
    ffprobe_binary: Path | None = None

    # Logging & Interface
    theme: str = Field(default="dark", pattern="^(dark|light|system)$")
    log_level: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")

    @property
    def video_download_dir(self) -> Path:
        """Dedicated directory for downloaded video files."""
        return self.download_dir / "videos"

    @property
    def image_download_dir(self) -> Path:
        """Dedicated directory for downloaded image files."""
        return self.download_dir / "images"

    @property
    def thumbnails_dir(self) -> Path:
        """Dedicated directory for cached media thumbnails."""
        return self.cache_dir / "thumbnails"

    @property
    def logs_dir(self) -> Path:
        """Dedicated directory for application log files."""
        return self.data_dir / "logs"

    @property
    def database_path(self) -> Path:
        """Local SQLite database file path."""
        return self.data_dir / "xakumedia.db"

    def ensure_directories(self) -> None:
        """Create standard application directories if they do not yet exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnails_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.video_download_dir.mkdir(parents=True, exist_ok=True)
        self.image_download_dir.mkdir(parents=True, exist_ok=True)


# Global default configuration instance
default_config = AppConfig()
