"""Thread-safe bandwidth rate limiting and token bucket throttling."""

import threading
import time

from ..core.config import default_config
from ..core.logging import get_logger

logger = get_logger("downloader.throttler")


class BandwidthThrottler:
    """Thread-safe global token-bucket rate limiter for chunked network streams."""

    def __init__(self, max_speed_kbps: int | None = None) -> None:
        self._lock = threading.Lock()
        speed = (
            max_speed_kbps
            if max_speed_kbps is not None
            else default_config.max_download_speed_kbps
        )
        self.max_speed_kbps = max(0, int(speed))
        self._rate_bytes_sec = float(self.max_speed_kbps * 1024)
        self._capacity = max(128.0 * 1024.0, self._rate_bytes_sec * 0.5)
        self._tokens = self._capacity
        self._last_refill = time.monotonic()

    def set_speed_limit(self, kbps: int) -> int:
        """Update maximum bandwidth limit in KB/s. Set to 0 for unlimited."""
        with self._lock:
            clamped = max(0, min(1_000_000, int(kbps)))
            self.max_speed_kbps = clamped
            self._rate_bytes_sec = float(clamped * 1024)
            self._capacity = max(128.0 * 1024.0, self._rate_bytes_sec * 0.5)
            self._tokens = min(self._tokens, self._capacity)
            self._last_refill = time.monotonic()
            logger.info(f"Bandwidth throttler limit updated to: {clamped} KB/s")
            return clamped

    def get_speed_limit(self) -> int:
        """Return the current bandwidth limit in KB/s (0 = unlimited)."""
        with self._lock:
            return self.max_speed_kbps

    def consume(
        self,
        num_bytes: int,
        cancel_event: threading.Event | None = None,
        pause_event: threading.Event | None = None,
    ) -> float:
        """Throttle execution to adhere to the configured bandwidth rate limit.

        Returns total seconds spent sleeping (0.0 if unlimited or enough tokens).
        """
        if self.max_speed_kbps <= 0 or num_bytes <= 0:
            return 0.0

        total_slept = 0.0

        while True:
            if cancel_event and cancel_event.is_set():
                return total_slept
            if pause_event and pause_event.is_set():
                return total_slept

            sleep_duration = 0.0
            with self._lock:
                if self.max_speed_kbps <= 0:
                    return total_slept

                now = time.monotonic()
                elapsed = now - self._last_refill
                self._last_refill = now
                self._tokens = min(
                    self._capacity, self._tokens + (elapsed * self._rate_bytes_sec)
                )

                if self._tokens >= num_bytes:
                    self._tokens -= num_bytes
                    return total_slept

                deficit = num_bytes - self._tokens
                sleep_duration = deficit / self._rate_bytes_sec

            # Sleep outside the lock in small increments to maintain responsiveness
            slice_duration = min(0.05, sleep_duration)
            time.sleep(slice_duration)
            total_slept += slice_duration


# Default global instance
default_throttler = BandwidthThrottler()
