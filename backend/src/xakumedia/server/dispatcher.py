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

    def __init__(self, repository: Any = None) -> None:
        self.repository = repository
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

        def start_download_handler(params: dict[str, Any]) -> dict[str, Any]:
            media_data = params.get("media_item")
            if not media_data or not isinstance(media_data, dict):
                raise TypeError("Parameter 'media_item' is required and must be an object.")

            from ..downloader import default_download_manager
            from ..models.media import MediaFormatInfo, MediaItem

            item = MediaItem.model_validate(media_data)
            format_data = params.get("selected_format")
            fmt = MediaFormatInfo.model_validate(format_data) if format_data else None
            dest = params.get("destination_path")

            task = default_download_manager.start_download(
                media_item=item,
                selected_format=fmt,
                destination_path=dest,
            )
            return {"task": task.model_dump(mode="json")}

        def cancel_download_handler(params: dict[str, Any]) -> dict[str, Any]:
            task_id = params.get("task_id")
            if not task_id or not isinstance(task_id, str):
                raise TypeError("Parameter 'task_id' is required and must be a string.")

            from ..downloader import default_download_manager

            cancelled = default_download_manager.cancel_download(task_id)
            return {"task_id": task_id, "cancelled": cancelled}

        def get_download_tasks_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..downloader import default_download_manager
            from ..models.queue import TaskStatus

            status_str = params.get("status")
            status = TaskStatus(status_str) if status_str else None
            limit = int(params.get("limit", 50))

            tasks = default_download_manager.get_tasks(status=status, limit=limit)
            return {
                "tasks": [t.model_dump(mode="json") for t in tasks],
                "count": len(tasks),
            }

        def start_batch_download_handler(params: dict[str, Any]) -> dict[str, Any]:
            items = params.get("items")
            if not items or not isinstance(items, list):
                raise TypeError("Parameter 'items' is required and must be a non-empty list.")

            from ..downloader import default_download_manager

            target_dir = params.get("target_dir")
            tasks = default_download_manager.start_batch_download(
                items=items,
                target_dir=target_dir,
            )
            return {
                "tasks": [t.model_dump(mode="json") for t in tasks],
                "count": len(tasks),
            }

        def pause_download_handler(params: dict[str, Any]) -> dict[str, Any]:
            task_id = params.get("task_id")
            if not task_id or not isinstance(task_id, str):
                raise TypeError("Parameter 'task_id' is required and must be a string.")

            from ..downloader import default_download_manager

            paused = default_download_manager.pause_download(task_id)
            return {"task_id": task_id, "paused": paused}

        def resume_download_handler(params: dict[str, Any]) -> dict[str, Any]:
            task_id = params.get("task_id")
            if not task_id or not isinstance(task_id, str):
                raise TypeError("Parameter 'task_id' is required and must be a string.")

            from ..downloader import default_download_manager

            resumed = default_download_manager.resume_download(task_id)
            return {"task_id": task_id, "resumed": resumed}

        def pause_all_downloads_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..downloader import default_download_manager

            count = default_download_manager.pause_all()
            return {"paused_count": count}

        def resume_all_downloads_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..downloader import default_download_manager

            count = default_download_manager.resume_all()
            return {"resumed_count": count}

        def cancel_all_downloads_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..downloader import default_download_manager

            count = default_download_manager.cancel_all()
            return {"cancelled_count": count}

        def clear_completed_downloads_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..downloader import default_download_manager

            count = default_download_manager.clear_completed()
            return {"cleared_count": count}

        def set_download_concurrency_handler(params: dict[str, Any]) -> dict[str, Any]:
            concurrency = params.get("concurrency")
            if concurrency is None:
                raise TypeError("Parameter 'concurrency' is required.")

            from ..downloader import default_download_manager

            actual = default_download_manager.set_concurrency(int(concurrency))
            return {"max_concurrent": actual}

        def set_speed_limit_handler(params: dict[str, Any]) -> dict[str, Any]:
            speed = params.get("speed_limit_kbps")
            if speed is None:
                speed = params.get("max_speed_kbps")
            if speed is None:
                raise TypeError("Parameter 'speed_limit_kbps' is required.")

            from ..downloader import default_download_manager

            actual = default_download_manager.set_speed_limit(int(speed))
            return {"speed_limit_kbps": actual}

        def get_speed_limit_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..downloader import default_download_manager

            actual = default_download_manager.get_speed_limit()
            return {"speed_limit_kbps": actual}

        def get_download_queue_state_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..downloader import default_download_manager

            return default_download_manager.get_queue_state()

        def recover_interrupted_tasks_handler(params: dict[str, Any]) -> dict[str, Any]:
            auto_resume = params.get("auto_resume")
            if auto_resume is not None:
                auto_resume = bool(auto_resume)

            from ..downloader import default_download_manager

            return default_download_manager.recover_interrupted_tasks(auto_resume=auto_resume)

        # FFmpeg & Media Processing RPC Handlers
        def get_ffmpeg_info_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..processor.ffmpeg import get_ffmpeg_info

            return get_ffmpeg_info()

        def inspect_media_handler(params: dict[str, Any]) -> dict[str, Any]:
            from pathlib import Path

            from ..processor.ffmpeg import inspect_media

            file_path_str = params.get("file_path")
            if not file_path_str or not isinstance(file_path_str, str):
                raise TypeError("Parameter 'file_path' is required and must be a string.")

            return inspect_media(Path(file_path_str))

        def merge_streams_handler(params: dict[str, Any]) -> dict[str, Any]:
            from pathlib import Path

            from ..processor.ffmpeg import merge_video_audio

            video_path_str = params.get("video_path")
            audio_path_str = params.get("audio_path")
            output_path_str = params.get("output_path")

            if not video_path_str or not audio_path_str or not output_path_str:
                raise TypeError(
                    "Parameters 'video_path', 'audio_path', and 'output_path' are required."
                )

            output = merge_video_audio(
                video_path=Path(video_path_str),
                audio_path=Path(audio_path_str),
                output_path=Path(output_path_str),
                output_container=params.get("output_container"),
            )
            return {"output_path": str(output), "success": True}

        def convert_format_handler(params: dict[str, Any]) -> dict[str, Any]:
            from pathlib import Path

            from ..processor.ffmpeg import convert_container

            input_path_str = params.get("input_path")
            output_path_str = params.get("output_path")

            if not input_path_str or not output_path_str:
                raise TypeError("Parameters 'input_path' and 'output_path' are required.")

            output = convert_container(
                input_path=Path(input_path_str),
                output_path=Path(output_path_str),
            )
            return {"output_path": str(output), "success": True}

        def generate_thumbnail_handler(params: dict[str, Any]) -> dict[str, Any]:
            from pathlib import Path

            from ..processor.thumbnail import generate_media_thumbnail

            source_path = params.get("source_path")
            item_id = params.get("item_id")
            if not source_path or not item_id:
                raise TypeError("Parameters 'source_path' and 'item_id' are required.")

            return generate_media_thumbnail(
                source_path=Path(source_path),
                item_id=str(item_id),
                media_type=params.get("media_type", "image"),
                force_regenerate=bool(params.get("force_regenerate", False)),
                timestamp_sec=float(params.get("timestamp_sec", 1.0)),
            )

        def query_saved_media_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..db import default_repository

            repo = self.repository or default_repository
            items = repo.query_saved_media(
                query=params.get("query"),
                media_type=params.get("media_type"),
                container=params.get("container"),
                sort_by=params.get("sort_by", "newest"),
                limit=int(params.get("limit", 50)),
                offset=int(params.get("offset", 0)),
            )
            return {
                "items": [item.model_dump(mode="json") for item in items],
                "count": len(items),
            }

        def export_media_metadata_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..db import default_repository

            repo = self.repository or default_repository
            media_id = params.get("media_id")
            if not media_id:
                raise TypeError("Parameter 'media_id' is required.")
            return repo.export_media_metadata(media_id)

        def delete_downloaded_media_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..db import default_repository

            repo = self.repository or default_repository
            task_id = params.get("task_id")
            if not task_id:
                raise TypeError("Parameter 'task_id' is required.")
            delete_disk = bool(params.get("delete_file_from_disk", True))
            return repo.delete_downloaded_media(task_id, delete_file_from_disk=delete_disk)

        def get_preferences_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..db import default_repository

            repo = self.repository or default_repository
            return repo.get_all_preferences()

        def update_preferences_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..db import default_repository

            repo = self.repository or default_repository
            preferences = params.get("preferences")
            if not isinstance(preferences, dict):
                preferences = {k: v for k, v in params.items() if k != "preferences"}
            return repo.update_preferences(preferences)

        def reset_preferences_handler(params: dict[str, Any]) -> dict[str, Any]:
            from ..db import default_repository

            repo = self.repository or default_repository
            return repo.reset_preferences()

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
        self.register("query_saved_media", query_saved_media_handler)
        self.register("toggle_save_media", toggle_save_media_handler)
        self.register("delete_media_item", delete_media_item_handler)
        self.register("export_media_metadata", export_media_metadata_handler)
        self.register("delete_downloaded_media", delete_downloaded_media_handler)
        self.register("start_download", start_download_handler)
        self.register("cancel_download", cancel_download_handler)
        self.register("get_download_tasks", get_download_tasks_handler)
        self.register("start_batch_download", start_batch_download_handler)
        self.register("pause_download", pause_download_handler)
        self.register("resume_download", resume_download_handler)
        self.register("pause_all_downloads", pause_all_downloads_handler)
        self.register("resume_all_downloads", resume_all_downloads_handler)
        self.register("cancel_all_downloads", cancel_all_downloads_handler)
        self.register("clear_completed_downloads", clear_completed_downloads_handler)
        self.register("set_download_concurrency", set_download_concurrency_handler)
        self.register("set_speed_limit", set_speed_limit_handler)
        self.register("get_speed_limit", get_speed_limit_handler)
        self.register("get_download_queue_state", get_download_queue_state_handler)
        self.register("recover_interrupted_tasks", recover_interrupted_tasks_handler)
        self.register("get_ffmpeg_info", get_ffmpeg_info_handler)
        self.register("inspect_media", inspect_media_handler)
        self.register("merge_streams", merge_streams_handler)
        self.register("convert_format", convert_format_handler)
        self.register("generate_thumbnail", generate_thumbnail_handler)
        self.register("get_preferences", get_preferences_handler)
        self.register("update_preferences", update_preferences_handler)
        self.register("reset_preferences", reset_preferences_handler)

