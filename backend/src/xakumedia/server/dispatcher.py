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

            import gallery_dl.extractor as gdl_extractor

            from ..db import default_repository
            from ..exceptions.base import UnsupportedSourceError
            from ..extractors.gallery import extract_gallery_info
            from ..extractors.video import extract_video_info
            from ..scanners.direct import classify_direct_url

            classified = None
            media_items = []

            # 1. First probe whether the URL is a direct media file (fast HEAD/Range GET)
            try:
                classified, direct_item = classify_direct_url(url)
                if direct_item is not None:
                    media_items = [direct_item]
            except UnsupportedSourceError:
                pass

            # 2. Check if a gallery-dl extractor recognizes the URL
            if not media_items:
                try:
                    if gdl_extractor.find(url):
                        classified, media_items = extract_gallery_info(url)
                except UnsupportedSourceError:
                    pass

            # 3. If not a gallery, attempt platform video extraction via yt-dlp
            if not media_items:
                classified, video_item = extract_video_info(url)
                if video_item is not None:
                    media_items = [video_item]

            # Automatically persist scan event in SQLite database
            scan_id = None
            if classified and media_items:
                try:
                    scan_id = default_repository.save_scan_result(classified, media_items)
                except Exception as exc:
                    logger.warning(f"Could not persist scan result to database: {exc}")

            return {
                "scan_id": scan_id,
                "classified_url": classified.model_dump() if classified else None,
                "media_item": media_items[0].model_dump() if media_items else None,
                "media_items": [m.model_dump() for m in media_items],
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
                "media_items": [media_item.model_dump()] if media_item else [],
            }

        def extract_gallery_handler(params: dict[str, Any]) -> dict[str, Any]:
            url = params.get("url")
            if not url or not isinstance(url, str):
                raise TypeError("Parameter 'url' is required and must be a string.")

            from ..extractors.gallery import extract_gallery_info

            classified, media_items = extract_gallery_info(url)
            return {
                "classified_url": classified.model_dump(),
                "media_item": media_items[0].model_dump() if media_items else None,
                "media_items": [m.model_dump() for m in media_items],
            }

        def get_scan_history_handler(params: dict[str, Any]) -> dict[str, Any]:
            limit = int(params.get("limit", 50))
            offset = int(params.get("offset", 0))
            from ..db import default_repository

            history = default_repository.get_scan_history(limit, offset)
            return {"items": history, "count": len(history)}

        def get_scan_items_handler(params: dict[str, Any]) -> dict[str, Any]:
            scan_id = params.get("scan_id")
            if not scan_id or not isinstance(scan_id, str):
                raise TypeError("Parameter 'scan_id' is required and must be a string.")
            from ..db import default_repository

            items = default_repository.get_scan_items(scan_id)
            return {"items": [item.model_dump() for item in items]}

        def clear_scan_history_handler(params: dict[str, Any]) -> dict[str, Any]:
            scan_id = params.get("scan_id")
            from ..db import default_repository

            deleted = default_repository.clear_scan_history(scan_id)
            return {"deleted_count": deleted}

        def save_media_item_handler(params: dict[str, Any]) -> dict[str, Any]:
            item_data = params.get("media_item")
            if not item_data or not isinstance(item_data, dict):
                raise TypeError("Parameter 'media_item' is required and must be an object.")
            is_saved = bool(params.get("is_saved", True))
            from ..db import default_repository
            from ..models.media import MediaItem

            item = MediaItem.model_validate(item_data)
            default_repository.save_media_item(item, is_saved=is_saved)
            return {"status": "ok", "id": item.id}

        def get_saved_media_handler(params: dict[str, Any]) -> dict[str, Any]:
            media_type = params.get("media_type")
            limit = int(params.get("limit", 50))
            offset = int(params.get("offset", 0))
            from ..db import default_repository

            items = default_repository.get_saved_media(media_type, limit, offset)
            return {"items": [item.model_dump() for item in items], "count": len(items)}

        def toggle_save_media_handler(params: dict[str, Any]) -> dict[str, Any]:
            media_id = params.get("media_id")
            if not media_id or not isinstance(media_id, str):
                raise TypeError("Parameter 'media_id' is required and must be a string.")
            from ..db import default_repository

            new_state = default_repository.toggle_save_media(media_id)
            return {"id": media_id, "is_saved": new_state}

        def delete_media_item_handler(params: dict[str, Any]) -> dict[str, Any]:
            media_id = params.get("media_id")
            if not media_id or not isinstance(media_id, str):
                raise TypeError("Parameter 'media_id' is required and must be a string.")
            from ..db import default_repository

            deleted = default_repository.delete_media_item(media_id)
            return {"id": media_id, "deleted": deleted}

        self.register("ping", ping_handler)
        self.register("get_version", version_handler)
        self.register("get_system_info", system_info_handler)
        self.register("echo", echo_handler)
        self.register("classify_url", classify_url_handler)
        self.register("extract_video", extract_video_handler)
        self.register("extract_gallery", extract_gallery_handler)
        self.register("get_scan_history", get_scan_history_handler)
        self.register("get_scan_items", get_scan_items_handler)
        self.register("clear_scan_history", clear_scan_history_handler)
        self.register("save_media_item", save_media_item_handler)
        self.register("get_saved_media", get_saved_media_handler)
        self.register("toggle_save_media", toggle_save_media_handler)
        self.register("delete_media_item", delete_media_item_handler)
