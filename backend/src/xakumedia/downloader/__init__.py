"""Downloader package for streaming chunked file downloads and task queue management."""

from .manager import DownloadManager, default_download_manager
from .stream import download_stream

__all__ = [
    "download_stream",
    "DownloadManager",
    "default_download_manager",
]
