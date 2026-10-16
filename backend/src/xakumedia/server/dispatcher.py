"""Method dispatcher for handling IPC JSON-RPC requests."""

import platform
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from .. import __version__
from ..core.config import default_config
from ..core.logging import get_logger
from ..exceptions.base import XakuMediaError
from .protocol import (
    DOMAIN_ERROR,
    INTERNAL_ERROR,
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    JsonRpcRequest,
    JsonRpcResponse,
)

logger = get_logger("server.dispatcher")

HandlerFunc = Callable[[dict[str, Any]], Any]


class RpcDispatcher:
    """Dispatches JSON-RPC requests to registered handler functions."""

    def __init__(self) -> None:
        self._handlers: dict[str, HandlerFunc] = {}
        self._register_default_handlers()

    def register(self, method: str, handler: HandlerFunc) -> None:
        """Register a handler for a named JSON-RPC method."""
        self._handlers[method] = handler

    def dispatch(self, request: JsonRpcRequest) -> JsonRpcResponse:
        """Execute the method handler corresponding to the request."""
        handler = self._handlers.get(request.method)
        if not handler:
            return JsonRpcResponse.fail(
                request.id,
                METHOD_NOT_FOUND,
                f"Method '{request.method}' not found",
            )

        try:
            result = handler(request.params)
            return JsonRpcResponse.success(request.id, result)
        except TypeError as exc:
            logger.warning(f"Invalid params for method '{request.method}': {exc}")
            return JsonRpcResponse.fail(
                request.id,
                INVALID_PARAMS,
                f"Invalid params for method '{request.method}': {exc}",
            )
        except XakuMediaError as exc:
            logger.warning(f"Domain error in method '{request.method}': {exc.message}")
            return JsonRpcResponse.fail(
                request.id,
                DOMAIN_ERROR,
                exc.message,
                data=exc.to_dict(),
            )
        except Exception as exc:
            logger.error(f"Internal error executing '{request.method}': {exc}", exc_info=True)
            return JsonRpcResponse.fail(
                request.id,
                INTERNAL_ERROR,
                f"Internal error: {exc}",
            )

    def _register_default_handlers(self) -> None:
        """Register default system and health-check RPC handlers."""

        def ping_handler(params: dict[str, Any]) -> dict[str, Any]:
            return {
                "status": "ok",
                "message": "pong",
                "version": __version__,
                "timestamp": datetime.now(UTC).isoformat(),
            }

        def version_handler(params: dict[str, Any]) -> dict[str, Any]:
            return {
                "version": __version__,
                "engine": "xakumedia",
            }

        def system_info_handler(params: dict[str, Any]) -> dict[str, Any]:
            return {
                "engine_version": __version__,
                "python_version": platform.python_version(),
                "python_executable": sys.executable,
                "platform": platform.platform(),
                "system": platform.system(),
                "machine": platform.machine(),
                "data_dir": str(default_config.data_dir),
                "cache_dir": str(default_config.cache_dir),
                "download_dir": str(default_config.download_dir),
            }

        def echo_handler(params: dict[str, Any]) -> dict[str, Any]:
            return params

        def classify_url_handler(params: dict[str, Any]) -> dict[str, Any]:
            url = params.get("url")
            if not url or not isinstance(url, str):
                raise TypeError("Parameter 'url' is required and must be a string.")

            from ..exceptions.base import UnsupportedSourceError
            from ..extractors.video import extract_video_info
            from ..scanners.direct import classify_direct_url

            # 1. First probe whether the URL is a direct media file (fast HEAD/Range GET)
            try:
                classified, media_item = classify_direct_url(url)
                if media_item is not None:
                    return {
                        "classified_url": classified.model_dump(),
                        "media_item": media_item.model_dump(),
                    }
            except UnsupportedSourceError:
                pass

            # 2. If not a direct media link, attempt platform video extraction via yt-dlp
            classified, media_item = extract_video_info(url)
            return {
                "classified_url": classified.model_dump(),
                "media_item": media_item.model_dump() if media_item else None,
            }

        def extract_video_handler(params: dict[str, Any]) -> dict[str, Any]:
            url = params.get("url")
            if not url or not isinstance(url, str):
                raise TypeError("Parameter 'url' is required and must be a string.")

            from ..extractors.video import extract_video_info

            classified, media_item = extract_video_info(url)
            return {
                "classified_url": classified.model_dump(),
                "media_item": media_item.model_dump() if media_item else None,
            }

        self.register("ping", ping_handler)
        self.register("get_version", version_handler)
        self.register("get_system_info", system_info_handler)
        self.register("echo", echo_handler)
        self.register("classify_url", classify_url_handler)
        self.register("extract_video", extract_video_handler)
