"""High-level repository layer for SQLite persistence operations."""

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..core.config import default_config
from ..core.logging import get_logger
from ..exceptions.base import DatabaseError
from ..models.media import MediaFormatInfo, MediaItem, MediaType
from ..models.quality import ImageFormat, VideoContainer, VideoResolution
from ..models.queue import DownloadTask, TaskStatus
from ..models.url import ClassifiedUrl
from .connection import ensure_database_initialized, get_db_connection, get_db_session

logger = get_logger("db.repository")


class MediaRepository:
    """Repository handling all local SQLite database queries and transactions."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        self.db_path = db_path
        ensure_database_initialized(self.db_path)
        self.load_saved_preferences()

    def _row_to_media_item(self, row: sqlite3.Row) -> MediaItem:
        """Transform a SQLite media_items row into a typed MediaItem domain model."""
        formats_raw = json.loads(row["available_formats_json"] or "[]")
        formats = [MediaFormatInfo.model_validate(f) for f in formats_raw]
        metadata_extra = json.loads(row["metadata_extra_json"] or "{}")

        created_at = row["created_at"]
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at)
            except ValueError:
                created_at = datetime.now(UTC)

        return MediaItem(
            id=row["id"],
            source_url=row["source_url"],
            media_type=MediaType(row["media_type"]),
            title=row["title"],
            author=row["author"],
            thumbnail_url=row["thumbnail_url"],
            original_url=row["original_url"],
            duration_seconds=row["duration_seconds"],
            width=row["width"],
            height=row["height"],
            filesize_bytes=row["filesize_bytes"],
            available_formats=formats,
            created_at=created_at,
            metadata_extra=metadata_extra,
        )

    def save_scan_result(
        self,
        classified: ClassifiedUrl,
        items: list[MediaItem],
    ) -> str:
        """Persist a completed scan event and its discovered media items into the database."""
        scan_id = str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()

        with get_db_session(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO scan_history (
                    id, raw_url, normalized_url, category, platform,
                    domain, title_hint, author_hint, item_count, is_supported, scanned_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scan_id,
                    classified.raw_url,
                    classified.normalized_url,
                    str(classified.category),
                    classified.platform,
                    classified.domain,
                    classified.title_hint,
                    classified.author_hint,
                    len(items),
                    1 if classified.is_supported else 0,
                    now,
                ),
            )

            for idx, item in enumerate(items):
                conn.execute(
                    """
                    INSERT INTO media_items (
                        id, source_url, media_type, title, author,
                        thumbnail_url, original_url, duration_seconds,
                        width, height, filesize_bytes,
                        available_formats_json, metadata_extra_json, is_saved, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        thumbnail_url = excluded.thumbnail_url,
                        available_formats_json = excluded.available_formats_json,
                        metadata_extra_json = excluded.metadata_extra_json
                    """,
                    (
                        item.id,
                        item.source_url,
                        str(item.media_type),
                        item.title,
                        item.author,
                        item.thumbnail_url,
                        item.original_url,
                        item.duration_seconds,
                        item.width,
                        item.height,
                        item.filesize_bytes,
                        json.dumps([f.model_dump() for f in item.available_formats]),
                        json.dumps(item.metadata_extra),
                        now,
                    ),
                )

                conn.execute(
                    """
                    INSERT OR IGNORE INTO scan_history_items (scan_id, media_id, item_order)
                    VALUES (?, ?, ?)
                    """,
                    (scan_id, item.id, idx),
                )

        logger.info(f"Saved scan result {scan_id} with {len(items)} items.")
        return scan_id

    def get_scan_history(self, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        """Retrieve recent URL scan history records with preview thumbnail links."""
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    s.id,
                    s.raw_url,
                    s.normalized_url,
                    s.category,
                    s.platform,
                    s.domain,
                    s.title_hint,
                    s.author_hint,
                    s.item_count,
                    s.is_supported,
                    s.scanned_at,
                    (
                        SELECT m.thumbnail_url
                        FROM scan_history_items shi
                        JOIN media_items m ON shi.media_id = m.id
                        WHERE shi.scan_id = s.id AND m.thumbnail_url IS NOT NULL
                        ORDER BY shi.item_order ASC
                        LIMIT 1
                    ) AS preview_thumbnail
                FROM scan_history s
                ORDER BY s.scanned_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            )
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def get_scan_items(self, scan_id: str) -> list[MediaItem]:
        """Retrieve all media items discovered during a specific scan event."""
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT m.*
                FROM scan_history_items shi
                JOIN media_items m ON shi.media_id = m.id
                WHERE shi.scan_id = ?
                ORDER BY shi.item_order ASC
                """,
                (scan_id,),
            )
            rows = cursor.fetchall()
            return [self._row_to_media_item(r) for r in rows]
        finally:
            conn.close()

    def clear_scan_history(self, scan_id: str | None = None) -> int:
        """Delete specific scan history record or clear all non-saved scan records."""
        with get_db_session(self.db_path) as conn:
            if scan_id:
                cursor = conn.execute("DELETE FROM scan_history WHERE id = ?", (scan_id,))
                deleted = cursor.rowcount
            else:
                cursor = conn.execute("DELETE FROM scan_history")
                deleted = cursor.rowcount
                # Clean up orphaned unsaved media items
                conn.execute(
                    """
                    DELETE FROM media_items
                    WHERE is_saved = 0
                      AND id NOT IN (SELECT media_id FROM scan_history_items)
                      AND id NOT IN (SELECT media_id FROM download_tasks)
                    """
                )
        return deleted

    def save_media_item(self, item: MediaItem, is_saved: bool = True) -> None:
        """Persist or bookmark a media item in the media library."""
        now = datetime.now(UTC).isoformat()
        with get_db_session(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO media_items (
                    id, source_url, media_type, title, author,
                    thumbnail_url, original_url, duration_seconds,
                    width, height, filesize_bytes,
                    available_formats_json, metadata_extra_json, is_saved, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    author = excluded.author,
                    thumbnail_url = excluded.thumbnail_url,
                    available_formats_json = excluded.available_formats_json,
                    metadata_extra_json = excluded.metadata_extra_json,
                    is_saved = excluded.is_saved
                """,
                (
                    item.id,
                    item.source_url,
                    str(item.media_type),
                    item.title,
                    item.author,
                    item.thumbnail_url,
                    item.original_url,
                    item.duration_seconds,
                    item.width,
                    item.height,
                    item.filesize_bytes,
                    json.dumps([f.model_dump() for f in item.available_formats]),
                    json.dumps(item.metadata_extra),
                    1 if is_saved else 0,
                    now,
                ),
            )

    def get_saved_media(
        self,
        media_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MediaItem]:
        """Query bookmarked media items from the media library."""
        return self.query_saved_media(media_type=media_type, limit=limit, offset=offset)

    def query_saved_media(
        self,
        query: str | None = None,
        media_type: str | None = None,
        container: str | None = None,
        sort_by: str = "newest",
        limit: int = 50,
        offset: int = 0,
    ) -> list[MediaItem]:
        """Search, filter, and sort bookmarked media items in the media library."""
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            conditions = ["is_saved = 1"]
            params: list[Any] = []

            if media_type and media_type.lower() != "all":
                conditions.append("media_type = ?")
                params.append(media_type.lower())

            if query and query.strip():
                q = f"%{query.strip()}%"
                conditions.append("(title LIKE ? OR author LIKE ? OR source_url LIKE ?)")
                params.extend([q, q, q])

            if container and container.lower() != "all":
                c = f"%{container.lower().strip()}%"
                conditions.append("LOWER(available_formats_json) LIKE ?")
                params.append(c)

            where_clause = " AND ".join(conditions)

            # Map sort keys to safe SQL ORDER BY clauses
            sort_map = {
                "newest": "created_at DESC",
                "oldest": "created_at ASC",
                "title": "title ASC, created_at DESC",
                "size_desc": "filesize_bytes DESC, created_at DESC",
                "size_asc": "filesize_bytes ASC, created_at DESC",
            }
            order_clause = sort_map.get(sort_by, "created_at DESC")

            sql = (
                f"SELECT * FROM media_items WHERE {where_clause} "
                f"ORDER BY {order_clause} LIMIT ? OFFSET ?"
            )
            params.extend([limit, offset])

            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [self._row_to_media_item(r) for r in rows]
        finally:
            conn.close()

    def export_media_metadata(self, media_id: str) -> dict[str, Any]:
        """Export comprehensive metadata and download task history for a media item."""
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM media_items WHERE id = ?", (media_id,))
            row = cursor.fetchone()
            if not row:
                raise DatabaseError(f"Media item with ID '{media_id}' does not exist.")
            item = self._row_to_media_item(row)

            # Query download task history if present
            cursor.execute(
                "SELECT * FROM download_tasks WHERE media_id = ? ORDER BY created_at DESC LIMIT 1",
                (media_id,),
            )
            task_row = cursor.fetchone()
            task_data = dict(task_row) if task_row else None

            return {
                "media_item": item.model_dump(mode="json"),
                "download_task": task_data,
                "exported_at": datetime.now(UTC).isoformat(),
            }
        finally:
            conn.close()

    def delete_downloaded_media(
        self,
        task_id: str,
        delete_file_from_disk: bool = True,
    ) -> dict[str, Any]:
        """Remove a download task and optionally delete its associated files from disk."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute("SELECT * FROM download_tasks WHERE id = ?", (task_id,))
            task_row = cursor.fetchone()
            if not task_row:
                raise DatabaseError(f"Download task with ID '{task_id}' does not exist.")

            destination_path = task_row["destination_path"]
            temp_path = task_row["temp_path"]
            file_deleted = False

            if delete_file_from_disk:
                for p_str in (destination_path, temp_path):
                    if p_str:
                        p = Path(p_str)
                        if p.exists() and p.is_file():
                            try:
                                p.unlink(missing_ok=True)
                                file_deleted = True
                                logger.info(f"Deleted local file from disk: {p}")
                            except Exception as err:
                                logger.warning(f"Failed to delete file {p}: {err}")

            conn.execute("DELETE FROM download_tasks WHERE id = ?", (task_id,))

            return {
                "task_id": task_id,
                "deleted": True,
                "file_deleted": file_deleted,
                "path": destination_path,
            }

    def toggle_save_media(self, media_id: str) -> bool:
        """Toggle the bookmark state of a media item and return the new saved state."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT is_saved FROM media_items WHERE id = ?",
                (media_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise DatabaseError(f"Media item with ID '{media_id}' does not exist.")

            new_state = 0 if row["is_saved"] == 1 else 1
            conn.execute(
                "UPDATE media_items SET is_saved = ? WHERE id = ?",
                (new_state, media_id),
            )
            return bool(new_state)

    def delete_media_item(self, media_id: str) -> bool:
        """Remove a media item from the database."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute("DELETE FROM media_items WHERE id = ?", (media_id,))
            return cursor.rowcount > 0

    def save_download_task(self, task: DownloadTask) -> None:
        """Persist or update a task record in the download queue table."""
        # Ensure media item is present
        self.save_media_item(task.media_item, is_saved=False)

        now = datetime.now(UTC).isoformat()
        with get_db_session(self.db_path) as conn:
            format_json = (
                json.dumps(task.selected_format.model_dump())
                if task.selected_format
                else None
            )
            conn.execute(
                """
                INSERT INTO download_tasks (
                    id, media_id, status, selected_format_json,
                    destination_path, temp_path, bytes_downloaded,
                    total_bytes, progress_percent, error_message,
                    retry_count, created_at, updated_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    selected_format_json = excluded.selected_format_json,
                    destination_path = excluded.destination_path,
                    bytes_downloaded = excluded.bytes_downloaded,
                    total_bytes = excluded.total_bytes,
                    progress_percent = excluded.progress_percent,
                    error_message = excluded.error_message,
                    retry_count = excluded.retry_count,
                    updated_at = excluded.updated_at,
                    completed_at = excluded.completed_at
                """,
                (
                    task.id,
                    task.media_item.id,
                    str(task.status),
                    format_json,
                    str(task.destination_path) if task.destination_path else None,
                    str(task.temp_path) if task.temp_path else None,
                    task.bytes_downloaded,
                    task.total_bytes,
                    task.progress_percent,
                    task.error_message,
                    task.retry_count,
                    task.created_at.isoformat() if task.created_at else now,
                    now,
                    task.completed_at.isoformat() if task.completed_at else None,
                ),
            )

    def _row_to_download_task(self, row: Any) -> DownloadTask:
        """Helper to deserialize a sqlite3.Row into a typed DownloadTask model."""
        media_item = self._row_to_media_item(row)
        fmt = (
            MediaFormatInfo.model_validate(json.loads(row["selected_format_json"]))
            if row["selected_format_json"]
            else None
        )
        return DownloadTask(
            id=row["task_id"],
            media_item=media_item,
            status=TaskStatus(row["status"]),
            selected_format=fmt,
            destination_path=Path(row["destination_path"]) if row["destination_path"] else None,
            temp_path=Path(row["temp_path"]) if row["temp_path"] else None,
            bytes_downloaded=row["bytes_downloaded"],
            total_bytes=row["total_bytes"],
            progress_percent=row["progress_percent"],
            error_message=row["error_message"],
            retry_count=row["retry_count"],
            created_at=datetime.fromisoformat(row["created_at"])
            if row["created_at"]
            else datetime.now(UTC),
            completed_at=datetime.fromisoformat(row["completed_at"])
            if row["completed_at"]
            else None,
            updated_at=datetime.fromisoformat(row["updated_at"])
            if row["updated_at"]
            else datetime.now(UTC),
        )

    def get_download_tasks(
        self,
        status: TaskStatus | None = None,
        limit: int = 50,
    ) -> list[DownloadTask]:
        """Query tasks from the download queue joined with their media items."""
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            query = """
                SELECT t.*, m.*, t.id AS task_id, m.id AS m_id
                FROM download_tasks t
                JOIN media_items m ON t.media_id = m.id
            """
            params: list[Any] = []
            if status:
                query += " WHERE t.status = ?"
                params.append(str(status))
            query += " ORDER BY t.created_at DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            return [self._row_to_download_task(row) for row in rows]
        finally:
            conn.close()

    def get_uncompleted_tasks(self) -> list[DownloadTask]:
        """Query tasks with active/pending status (downloading, merging, scanning, queued).

        Ordered by created_at ASC to allow FIFO recovery resumption.
        """
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            query = """
                SELECT t.*, m.*, t.id AS task_id, m.id AS m_id
                FROM download_tasks t
                JOIN media_items m ON t.media_id = m.id
                WHERE t.status IN ('downloading', 'merging', 'scanning', 'queued')
                ORDER BY t.created_at ASC
            """
            cursor.execute(query)
            rows = cursor.fetchall()
            return [self._row_to_download_task(row) for row in rows]
        finally:
            conn.close()

    def get_download_task(self, task_id: str) -> DownloadTask | None:
        """Query a single download task by ID joined with its media item."""
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            query = """
                SELECT t.*, m.*, t.id AS task_id, m.id AS m_id
                FROM download_tasks t
                JOIN media_items m ON t.media_id = m.id
                WHERE t.id = ?
            """
            cursor.execute(query, (task_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_download_task(row)
        finally:
            conn.close()

    def clear_completed_tasks(self) -> int:
        """Remove all completed, failed, and cancelled download tasks from the database."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute(
                "DELETE FROM download_tasks WHERE status IN ('completed', 'failed', 'cancelled')"
            )
            return cursor.rowcount

    def get_queue_counts(self) -> dict[str, int]:
        """Get aggregate counts of tasks grouped by status."""
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT status, COUNT(*) AS cnt FROM download_tasks GROUP BY status")
            rows = cursor.fetchall()
            counts = {
                "queued": 0,
                "downloading": 0,
                "merging": 0,
                "completed": 0,
                "failed": 0,
                "cancelled": 0,
                "paused": 0,
            }
            for r in rows:
                counts[r["status"]] = r["cnt"]
            return counts
        finally:
            conn.close()

    # =========================================================================
    # Application Preferences Management (SQLite app_preferences table)
    # =========================================================================

    def get_preference(self, key: str, default: Any = None) -> Any:
        """Fetch a single preference value by key, decoding JSON if applicable."""
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM app_preferences WHERE key = ?", (key,))
            row = cursor.fetchone()
            if not row:
                return default
            val = row["value"]
            try:
                return json.loads(val)
            except (json.JSONDecodeError, TypeError):
                return val
        finally:
            conn.close()

    def set_preference(self, key: str, value: Any) -> None:
        """Persist a single preference value into SQLite."""
        val_json = json.dumps(value) if not isinstance(value, str) else json.dumps(value)
        with get_db_session(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO app_preferences (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (key, val_json),
            )
        self._apply_to_runtime_config({key: value})

    def get_all_stored_preferences(self) -> dict[str, Any]:
        """Fetch all raw key-value preferences stored in SQLite."""
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM app_preferences")
            rows = cursor.fetchall()
            result: dict[str, Any] = {}
            for row in rows:
                k = row["key"]
                raw_val = row["value"]
                try:
                    result[k] = json.loads(raw_val)
                except (json.JSONDecodeError, TypeError):
                    result[k] = raw_val
            return result
        finally:
            conn.close()

    def get_all_preferences(self) -> dict[str, Any]:
        """Return all application preferences, merging saved overrides with system defaults."""
        defaults = {
            "download_dir": str(default_config.download_dir),
            "image_download_dir": str(default_config.image_download_dir),
            "video_download_dir": str(default_config.video_download_dir),
            "max_concurrent_downloads": default_config.max_concurrent_downloads,
            "max_download_speed_kbps": default_config.max_download_speed_kbps,
            "max_retries": default_config.max_retries,
            "request_timeout_seconds": default_config.request_timeout_seconds,
            "default_video_resolution": default_config.default_video_resolution.value
            if hasattr(default_config.default_video_resolution, "value")
            else str(default_config.default_video_resolution),
            "default_video_container": default_config.default_video_container.value
            if hasattr(default_config.default_video_container, "value")
            else str(default_config.default_video_container),
            "default_image_format": default_config.default_image_format.value
            if hasattr(default_config.default_image_format, "value")
            else str(default_config.default_image_format),
            "theme": default_config.theme,
            "log_level": default_config.log_level,
        }
        stored = self.get_all_stored_preferences()
        defaults.update(stored)
        return defaults

    def update_preferences(self, preferences: dict[str, Any]) -> dict[str, Any]:
        """Validate, persist, and apply updated preferences."""
        validated: dict[str, Any] = {}
        for k, v in preferences.items():
            if k == "download_dir":
                p = Path(str(v)).expanduser().resolve()
                validated[k] = str(p)
            elif k == "max_concurrent_downloads":
                val = max(1, min(16, int(v)))
                validated[k] = val
            elif k == "max_download_speed_kbps":
                val = max(0, min(1_000_000, int(v)))
                validated[k] = val
            elif k == "max_retries":
                val = max(0, min(10, int(v)))
                validated[k] = val
            elif k == "request_timeout_seconds":
                val = max(5.0, min(300.0, float(v)))
                validated[k] = val
            elif k == "default_video_resolution":
                validated[k] = VideoResolution(str(v)).value
            elif k == "default_video_container":
                validated[k] = VideoContainer(str(v)).value
            elif k == "default_image_format":
                validated[k] = ImageFormat(str(v)).value
            elif k == "theme":
                if str(v) not in ("dark", "light", "system"):
                    raise ValueError(f"Invalid theme: {v}")
                validated[k] = str(v)
            elif k == "log_level":
                if str(v) not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
                    raise ValueError(f"Invalid log level: {v}")
                validated[k] = str(v)
            else:
                validated[k] = v

        with get_db_session(self.db_path) as conn:
            for k, val in validated.items():
                val_json = json.dumps(val)
                conn.execute(
                    """
                    INSERT INTO app_preferences (key, value, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(key) DO UPDATE SET
                        value = excluded.value,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (k, val_json),
                )

        self._apply_to_runtime_config(validated)
        return self.get_all_preferences()

    def reset_preferences(self) -> dict[str, Any]:
        """Clear all stored preferences and restore system defaults."""
        with get_db_session(self.db_path) as conn:
            conn.execute("DELETE FROM app_preferences")

        from platformdirs import user_downloads_dir

        default_config.download_dir = Path(user_downloads_dir()) / "XakuMedia"
        default_config.max_concurrent_downloads = 4
        default_config.max_download_speed_kbps = 0
        default_config.max_retries = 3
        default_config.request_timeout_seconds = 30.0
        default_config.default_video_resolution = VideoResolution.RES_1080P
        default_config.default_video_container = VideoContainer.MP4
        default_config.default_image_format = ImageFormat.ORIGINAL
        default_config.theme = "dark"
        default_config.log_level = "INFO"

        try:
            from ..downloader import default_download_manager, default_throttler

            default_download_manager.set_concurrency(default_config.max_concurrent_downloads)
            default_throttler.set_speed_limit(0)
        except Exception:
            pass

        return self.get_all_preferences()

    def load_saved_preferences(self) -> dict[str, Any]:
        """Load stored preferences from SQLite and apply them to runtime default_config."""
        try:
            saved = self.get_all_stored_preferences()
            self._apply_to_runtime_config(saved)
            return self.get_all_preferences()
        except Exception as exc:
            logger.warning(f"Could not load saved preferences from database: {exc}")
            return self.get_all_preferences()

    def _apply_to_runtime_config(self, preferences: dict[str, Any]) -> None:
        """Apply preference values to the runtime default_config and download manager."""
        if "download_dir" in preferences:
            default_config.download_dir = Path(str(preferences["download_dir"]))
        if "max_concurrent_downloads" in preferences:
            concurrency = int(preferences["max_concurrent_downloads"])
            default_config.max_concurrent_downloads = concurrency
            try:
                from ..downloader import default_download_manager

                default_download_manager.set_concurrency(concurrency)
            except Exception:
                pass
        if "max_download_speed_kbps" in preferences:
            speed_limit = int(preferences["max_download_speed_kbps"])
            default_config.max_download_speed_kbps = speed_limit
            try:
                from ..downloader import default_throttler

                default_throttler.set_speed_limit(speed_limit)
            except Exception:
                pass
        if "max_retries" in preferences:
            default_config.max_retries = int(preferences["max_retries"])
        if "request_timeout_seconds" in preferences:
            default_config.request_timeout_seconds = float(preferences["request_timeout_seconds"])
        if "default_video_resolution" in preferences:
            try:
                default_config.default_video_resolution = VideoResolution(
                    str(preferences["default_video_resolution"])
                )
            except ValueError:
                pass
        if "default_video_container" in preferences:
            try:
                default_config.default_video_container = VideoContainer(
                    str(preferences["default_video_container"])
                )
            except ValueError:
                pass
        if "default_image_format" in preferences:
            try:
                default_config.default_image_format = ImageFormat(
                    str(preferences["default_image_format"])
                )
            except ValueError:
                pass
        if "theme" in preferences:
            default_config.theme = str(preferences["theme"])
        if "log_level" in preferences:
            default_config.log_level = str(preferences["log_level"])


# Default singleton instance bound to default_config.database_path
default_repository = MediaRepository()
