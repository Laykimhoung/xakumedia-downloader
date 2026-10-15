"""Structured and console logging configuration for XakuMedia."""

import logging
import sys
from pathlib import Path

_INITIALIZED = False


def setup_logging(
    log_level: str = "INFO",
    log_file: Path | None = None,
) -> None:
    """Configure root logger with unified formatting for console and file output."""
    global _INITIALIZED
    if _INITIALIZED:
        return

    level = getattr(logging, log_level.upper(), logging.INFO)
    handlers: list[logging.Handler] = []

    # Console Handler (writes to stderr so stdout remains clean for IPC JSON-RPC)
    console_handler = logging.StreamHandler(sys.stderr)
    console_formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    console_handler.setFormatter(console_formatter)
    handlers.append(console_handler)

    # Optional Rotating File Handler
    if log_file:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d): %(message)s"
        )
        file_handler.setFormatter(file_formatter)
        handlers.append(file_handler)

    logging.basicConfig(level=level, handlers=handlers, force=True)
    _INITIALIZED = True


def get_logger(name: str) -> logging.Logger:
    """Obtain a logger instance for a given module name."""
    return logging.getLogger(name)
