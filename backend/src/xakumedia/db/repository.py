"""High-level repository layer for SQLite persistence operations."""

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..core.logging import get_logger
from ..exceptions.base import DatabaseError
from ..models.media import MediaFormatInfo, MediaItem, MediaType
from ..models.queue import DownloadTask, TaskStatus
from ..models.url import ClassifiedUrl
from .connection import ensure_database_initialized, get_db_connection, get_db_session

logger = get_logger("db.repository")


class MediaRepository:
    """Repository handling all local SQLite database queries and transactions."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        self.db_path = db_path
        ensure_database_initialized(self.db_path)

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
        conn = get_db_connection(self.db_path)
        try:
            cursor = conn.cursor()
            if media_type:
                cursor.execute(
                    """
                    SELECT * FROM media_items
                    WHERE is_saved = 1 AND media_type = ?
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (media_type, limit, offset),
                )
            else:
                cursor.execute(
                    """
                    SELECT * FROM media_items
                    WHERE is_saved = 1
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (limit, offset),
                )
            rows = cursor.fetchall()
            return [self._row_to_media_item(r) for r in rows]
        finally:
            conn.close()

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
                    retry_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    selected_format_json = excluded.selected_format_json,
                    destination_path = excluded.destination_path,
                    bytes_downloaded = excluded.bytes_downloaded,
                    total_bytes = excluded.total_bytes,
                    progress_percent = excluded.progress_percent,
                    error_message = excluded.error_message,
                    retry_count = excluded.retry_count,
                    updated_at = excluded.updated_at
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
                ),
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
            query += " ORDER BY t.created_at ASC LIMIT ?"
            params.append(limit)

            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            tasks: list[DownloadTask] = []
            for row in rows:
                media_item = self._row_to_media_item(row)
                fmt = (
                    MediaFormatInfo.model_validate(json.loads(row["selected_format_json"]))
                    if row["selected_format_json"]
                    else None
                )
                tasks.append(
                    DownloadTask(
                        id=row["task_id"],
                        media_item=media_item,
                        status=TaskStatus(row["status"]),
                        selected_format=fmt,
                        destination_path=Path(row["destination_path"])
                        if row["destination_path"]
                        else None,
                        temp_path=Path(row["temp_path"]) if row["temp_path"] else None,
                        bytes_downloaded=row["bytes_downloaded"],
                        total_bytes=row["total_bytes"],
                        progress_percent=row["progress_percent"],
                        error_message=row["error_message"],
                        retry_count=row["retry_count"],
                        created_at=datetime.fromisoformat(row["created_at"])
                        if row["created_at"]
                        else datetime.now(UTC),
                        updated_at=datetime.fromisoformat(row["updated_at"])
                        if row["updated_at"]
                        else datetime.now(UTC),
                    )
                )
            return tasks
        finally:
            conn.close()


# Default singleton instance bound to default_config.database_path
default_repository = MediaRepository()
