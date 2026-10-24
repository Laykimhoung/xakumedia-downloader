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

        media_rows = []
        junction_rows = []
        for idx, item in enumerate(items):
            media_rows.append(
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
                )
            )
            junction_rows.append((scan_id, item.id, idx))

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

            if media_rows:
                conn.executemany(
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
                    media_rows,
                )
                conn.executemany(
                    """
                    INSERT OR IGNORE INTO scan_history_items (scan_id, media_id, item_order)
                    VALUES (?, ?, ?)
                    """,
                    junction_rows,
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

    def save_media_items(self, items: list[MediaItem], is_saved: bool = True) -> None:
        """Persist or update multiple media items in a single batch transaction."""
        if not items:
            return

        now = datetime.now(UTC).isoformat()
        rows = [
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
            )
            for item in items
        ]

        with get_db_session(self.db_path) as conn:
            conn.executemany(
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
                rows,
            )

    def save_media_item(self, item: MediaItem, is_saved: bool = True) -> None:
        """Persist or bookmark a single media item in the media library."""
        self.save_media_items([item], is_saved=is_saved)

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

    def save_download_tasks(self, tasks: list[DownloadTask]) -> None:
        """Persist or update multiple task records in a single batch transaction."""
        if not tasks:
            return

        # Ensure all referenced media items are present
        self.save_media_items([t.media_item for t in tasks], is_saved=False)

        now = datetime.now(UTC).isoformat()
        rows = []
        for task in tasks:
            format_json = (
                json.dumps(task.selected_format.model_dump())
                if task.selected_format
                else None
            )
            created_at_str = task.created_at.isoformat() if task.created_at else now
            completed_at_str = (
                task.completed_at.isoformat() if task.completed_at else None
            )
            rows.append(
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
                    created_at_str,
                    now,
                    completed_at_str,
                )
            )

        with get_db_session(self.db_path) as conn:
            conn.executemany(
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
                rows,
            )

    def save_download_task(self, task: DownloadTask) -> None:
        """Persist or update a single task record in the download queue table."""
        self.save_download_tasks([task])

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

    # =========================================================================
    # Cookie Profiles & Authentication
    # =========================================================================

    def save_cookie_profile(self, profile: Any) -> None:
        """Persist or update a session cookie profile."""
        now = datetime.now(UTC).isoformat()
        with get_db_session(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO cookie_profiles (
                    id, domain, browser_source, cookie_file_path,
                    cookie_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    domain = excluded.domain,
                    browser_source = excluded.browser_source,
                    cookie_file_path = excluded.cookie_file_path,
                    cookie_count = excluded.cookie_count,
                    updated_at = excluded.updated_at
                """,
                (
                    profile.id,
                    profile.domain.lower().lstrip("."),
                    profile.browser_source,
                    profile.cookie_file_path,
                    profile.cookie_count,
                    profile.created_at or now,
                    now,
                ),
            )

    def get_cookie_profile(self, profile_id: str) -> Any | None:
        """Retrieve a cookie profile by ID."""
        from ..auth.models import CookieProfileRecord

        with get_db_session(self.db_path) as conn:
            cursor = conn.execute("SELECT * FROM cookie_profiles WHERE id = ?", (profile_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return CookieProfileRecord(
                id=row["id"],
                domain=row["domain"],
                browser_source=row["browser_source"],
                cookie_file_path=row["cookie_file_path"],
                cookie_count=row["cookie_count"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def get_cookie_profile_for_domain(self, domain: str) -> Any | None:
        """Find the active cookie profile matching a domain or parent domain."""
        from ..auth.headers import extract_domain_from_url
        from ..auth.models import CookieProfileRecord

        clean_dom = extract_domain_from_url(domain)
        parts = clean_dom.split(".")
        candidates: list[str] = []
        while parts:
            candidates.append(".".join(parts))
            parts.pop(0)

        with get_db_session(self.db_path) as conn:
            for cand in candidates:
                cursor = conn.execute(
                    "SELECT * FROM cookie_profiles WHERE domain = ? "
                    "ORDER BY updated_at DESC LIMIT 1",
                    (cand,),
                )
                row = cursor.fetchone()
                if row:
                    return CookieProfileRecord(
                        id=row["id"],
                        domain=row["domain"],
                        browser_source=row["browser_source"],
                        cookie_file_path=row["cookie_file_path"],
                        cookie_count=row["cookie_count"],
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                    )
        return None

    def list_cookie_profiles(self) -> list[Any]:
        """Return all saved cookie profiles ordered by updated timestamp."""
        from ..auth.models import CookieProfileRecord

        with get_db_session(self.db_path) as conn:
            cursor = conn.execute("SELECT * FROM cookie_profiles ORDER BY updated_at DESC")
            records: list[CookieProfileRecord] = []
            for row in cursor.fetchall():
                records.append(
                    CookieProfileRecord(
                        id=row["id"],
                        domain=row["domain"],
                        browser_source=row["browser_source"],
                        cookie_file_path=row["cookie_file_path"],
                        cookie_count=row["cookie_count"],
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                    )
                )
            return records

    def delete_cookie_profile(self, profile_id: str, delete_file: bool = True) -> bool:
        """Delete a cookie profile and optionally delete its backing file on disk."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT cookie_file_path FROM cookie_profiles WHERE id = ?",
                (profile_id,),
            )
            row = cursor.fetchone()
            if not row:
                return False

            file_path = row["cookie_file_path"]
            if delete_file and file_path:
                try:
                    p = Path(file_path)
                    if p.exists() and p.is_file():
                        p.unlink(missing_ok=True)
                except Exception as exc:
                    logger.warning(f"Could not delete cookie file {file_path}: {exc}")

            conn.execute("DELETE FROM cookie_profiles WHERE id = ?", (profile_id,))
            return True

    # =========================================================================
    # Domain Request Headers
    # =========================================================================

    def save_domain_headers(self, domain: str, headers: dict[str, str]) -> None:
        """Persist custom HTTP request headers for a specific domain."""
        from ..auth.headers import extract_domain_from_url

        clean_dom = extract_domain_from_url(domain)
        headers_json = json.dumps(headers)
        with get_db_session(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO domain_headers (domain, headers_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(domain) DO UPDATE SET
                    headers_json = excluded.headers_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (clean_dom, headers_json),
            )

    def get_domain_headers(self, domain: str) -> dict[str, str]:
        """Retrieve custom headers for a domain, checking subdomains hierarchically."""
        from ..auth.headers import extract_domain_from_url

        clean_dom = extract_domain_from_url(domain)
        parts = clean_dom.split(".")
        candidates: list[str] = []
        while parts:
            candidates.append(".".join(parts))
            parts.pop(0)

        with get_db_session(self.db_path) as conn:
            for cand in candidates:
                cursor = conn.execute(
                    "SELECT headers_json FROM domain_headers WHERE domain = ?",
                    (cand,),
                )
                row = cursor.fetchone()
                if row and row["headers_json"]:
                    try:
                        return json.loads(row["headers_json"])
                    except Exception:
                        pass
        return {}

    def list_all_domain_headers(self) -> dict[str, dict[str, str]]:
        """Return all configured domain headers as a dictionary of {domain: headers}."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT domain, headers_json FROM domain_headers ORDER BY domain ASC"
            )
            res: dict[str, dict[str, str]] = {}
            for row in cursor.fetchall():
                try:
                    res[row["domain"]] = json.loads(row["headers_json"] or "{}")
                except Exception:
                    pass
            return res

    def delete_domain_headers(self, domain: str) -> bool:
        """Remove custom headers configured for a domain."""
        from ..auth.headers import extract_domain_from_url

        clean_dom = extract_domain_from_url(domain)
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute(
                "DELETE FROM domain_headers WHERE domain = ?",
                (clean_dom,),
            )
            return cursor.rowcount > 0

    # =========================================================================
    # Saved Sources & Incremental Discovery
    # =========================================================================

    def save_source(self, source: Any) -> Any:
        """Persist or update a bookmarked media source in the saved_sources table."""
        now = datetime.now(UTC).isoformat()
        tags_json = json.dumps(source.tags if hasattr(source, "tags") else [])
        with get_db_session(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO saved_sources (
                    id, url, title, platform, category, author, thumbnail_url,
                    tags_json, last_scanned_at, last_item_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    url = excluded.url,
                    title = excluded.title,
                    platform = excluded.platform,
                    category = excluded.category,
                    author = excluded.author,
                    thumbnail_url = excluded.thumbnail_url,
                    tags_json = excluded.tags_json,
                    last_scanned_at = excluded.last_scanned_at,
                    last_item_count = excluded.last_item_count,
                    updated_at = excluded.updated_at
                ON CONFLICT(url) DO UPDATE SET
                    title = excluded.title,
                    platform = excluded.platform,
                    category = excluded.category,
                    author = excluded.author,
                    thumbnail_url = excluded.thumbnail_url,
                    tags_json = excluded.tags_json,
                    last_scanned_at = excluded.last_scanned_at,
                    last_item_count = excluded.last_item_count,
                    updated_at = excluded.updated_at
                """,
                (
                    source.id,
                    source.url,
                    source.title,
                    source.platform,
                    source.category,
                    source.author,
                    source.thumbnail_url,
                    tags_json,
                    source.last_scanned_at,
                    source.last_item_count,
                    source.created_at or now,
                    now,
                ),
            )
        return self.get_source(source.id) or source

    def _row_to_saved_source(self, row: Any) -> Any:
        """Helper to deserialize a sqlite3.Row into a SavedSource model."""
        from ..models.source import SavedSource

        tags = []
        if row["tags_json"]:
            try:
                tags = json.loads(row["tags_json"])
            except Exception:
                tags = []

        return SavedSource(
            id=row["id"],
            url=row["url"],
            title=row["title"],
            platform=row["platform"],
            category=row["category"],
            author=row["author"],
            thumbnail_url=row["thumbnail_url"],
            tags=tags,
            last_scanned_at=row["last_scanned_at"],
            last_item_count=row["last_item_count"] or 0,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def get_source(self, source_id: str) -> Any | None:
        """Retrieve a saved source by its ID."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute("SELECT * FROM saved_sources WHERE id = ?", (source_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_saved_source(row)

    def get_source_by_url(self, url: str) -> Any | None:
        """Retrieve a saved source by its URL."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute("SELECT * FROM saved_sources WHERE url = ?", (url,))
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_saved_source(row)

    def list_saved_sources(self, tag: str | None = None) -> list[Any]:
        """List all saved sources, optionally filtered by tag."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute("SELECT * FROM saved_sources ORDER BY updated_at DESC")
            sources = [self._row_to_saved_source(row) for row in cursor.fetchall()]
            if tag:
                tag_lower = tag.lower().strip()
                return [s for s in sources if any(t.lower() == tag_lower for t in s.tags)]
            return sources

    def delete_saved_source(self, source_id: str) -> bool:
        """Delete a saved source by ID."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute("DELETE FROM saved_sources WHERE id = ?", (source_id,))
            return cursor.rowcount > 0

    def update_source_scan_stats(
        self, source_id: str, item_count: int, scanned_at: str | None = None
    ) -> None:
        """Update last scanned timestamp and item count for a saved source."""
        now = scanned_at or datetime.now(UTC).isoformat()
        with get_db_session(self.db_path) as conn:
            conn.execute(
                """
                UPDATE saved_sources
                SET last_scanned_at = ?, last_item_count = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, item_count, now, source_id),
            )

    def get_known_item_urls_for_source(self, source_url: str) -> set[str]:
        """Retrieve set of known item original_url and source_url strings previously recorded."""
        with get_db_session(self.db_path) as conn:
            cursor = conn.execute(
                """
                SELECT mi.original_url, mi.source_url
                FROM media_items mi
                JOIN scan_history_items shi ON mi.id = shi.media_id
                JOIN scan_history sh ON shi.scan_id = sh.id
                WHERE sh.raw_url = ? OR sh.normalized_url = ?
                """,
                (source_url, source_url),
            )
            urls: set[str] = set()
            for row in cursor.fetchall():
                if row["original_url"]:
                    urls.add(row["original_url"])
                if row["source_url"]:
                    urls.add(row["source_url"])
            return urls


# Default singleton instance bound to default_config.database_path
default_repository = MediaRepository()
