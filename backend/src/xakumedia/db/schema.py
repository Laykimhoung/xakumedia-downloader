"""SQLite schema definitions, table creation, and migration runner for XakuMedia."""

import sqlite3

from ..core.logging import get_logger
from ..exceptions.base import DatabaseError

logger = get_logger("db.schema")

CURRENT_SCHEMA_VERSION = 4

MIGRATION_V1 = """
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Persistent Scan History records
CREATE TABLE IF NOT EXISTS scan_history (
    id TEXT PRIMARY KEY,
    raw_url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    category TEXT NOT NULL,
    platform TEXT,
    domain TEXT,
    title_hint TEXT,
    author_hint TEXT,
    item_count INTEGER NOT NULL DEFAULT 1,
    is_supported INTEGER NOT NULL DEFAULT 1,
    scanned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scan_history_scanned_at ON scan_history(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_history_domain ON scan_history(domain);

-- Discovered and Saved Media Items
CREATE TABLE IF NOT EXISTS media_items (
    id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    media_type TEXT NOT NULL,
    title TEXT,
    author TEXT NOT NULL DEFAULT 'media',
    thumbnail_url TEXT,
    original_url TEXT NOT NULL,
    duration_seconds REAL,
    width INTEGER,
    height INTEGER,
    filesize_bytes INTEGER,
    available_formats_json TEXT NOT NULL DEFAULT '[]',
    metadata_extra_json TEXT NOT NULL DEFAULT '{}',
    is_saved INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_items_source_url ON media_items(source_url);
CREATE INDEX IF NOT EXISTS idx_media_items_created_at ON media_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_items_media_type ON media_items(media_type);
CREATE INDEX IF NOT EXISTS idx_media_items_is_saved ON media_items(is_saved);

-- Relational junction between scan events and discovered items
CREATE TABLE IF NOT EXISTS scan_history_items (
    scan_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    item_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scan_id, media_id),
    FOREIGN KEY (scan_id) REFERENCES scan_history(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
);

-- Persistent Download Tasks Queue
CREATE TABLE IF NOT EXISTS download_tasks (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    selected_format_json TEXT,
    destination_path TEXT,
    temp_path TEXT,
    bytes_downloaded INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER,
    progress_percent REAL NOT NULL DEFAULT 0.0,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_download_tasks_status ON download_tasks(status);
CREATE INDEX IF NOT EXISTS idx_download_tasks_created_at ON download_tasks(created_at DESC);

-- Key-Value Application Preferences
CREATE TABLE IF NOT EXISTS app_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

MIGRATION_V2 = """
-- Session Cookie Profiles
CREATE TABLE IF NOT EXISTS cookie_profiles (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    browser_source TEXT,
    cookie_file_path TEXT NOT NULL,
    cookie_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cookie_profiles_domain ON cookie_profiles(domain);

-- Domain Custom Request Headers
CREATE TABLE IF NOT EXISTS domain_headers (
    domain TEXT PRIMARY KEY,
    headers_json TEXT NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

MIGRATION_V3 = """
-- Saved Media Sources (Channels, Galleries, Artist Profiles)
CREATE TABLE IF NOT EXISTS saved_sources (
    id TEXT PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    platform TEXT,
    category TEXT,
    author TEXT,
    thumbnail_url TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    last_scanned_at TIMESTAMP,
    last_item_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_sources_url ON saved_sources(url);
CREATE INDEX IF NOT EXISTS idx_saved_sources_platform ON saved_sources(platform);
CREATE INDEX IF NOT EXISTS idx_saved_sources_last_scanned ON saved_sources(last_scanned_at DESC);
"""

MIGRATION_V4 = """
-- Performance & Reliability Indexes for Large Media Batches (Milestone 21)
CREATE INDEX IF NOT EXISTS idx_scan_history_items_media_id ON scan_history_items(media_id);
CREATE INDEX IF NOT EXISTS idx_download_tasks_media_id ON download_tasks(media_id);
CREATE INDEX IF NOT EXISTS idx_media_items_author ON media_items(author);
CREATE INDEX IF NOT EXISTS idx_download_tasks_updated_at ON download_tasks(updated_at DESC);
"""


def get_current_version(conn: sqlite3.Connection) -> int:
    """Retrieve the current schema version from the database."""
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
        )
        if not cursor.fetchone():
            return 0
        cursor.execute("SELECT MAX(version) FROM schema_version")
        row = cursor.fetchone()
        return row[0] if (row and row[0] is not None) else 0
    except sqlite3.Error as exc:
        raise DatabaseError(f"Failed to query schema version: {exc}") from exc


def init_schema(conn: sqlite3.Connection) -> None:
    """Initialize or upgrade database tables to the latest schema version."""
    try:
        current_v = get_current_version(conn)
        if current_v < 1:
            logger.info("Applying database migration V1...")
            conn.executescript(MIGRATION_V1)
            conn.execute("INSERT INTO schema_version (version) VALUES (1)")
            conn.commit()
            logger.info("Database migration V1 applied successfully.")

        if current_v < 2:
            logger.info("Applying database migration V2...")
            conn.executescript(MIGRATION_V2)
            conn.execute("INSERT INTO schema_version (version) VALUES (2)")
            conn.commit()
            logger.info("Database migration V2 applied successfully.")

        if current_v < 3:
            logger.info("Applying database migration V3...")
            conn.executescript(MIGRATION_V3)
            conn.execute("INSERT INTO schema_version (version) VALUES (3)")
            conn.commit()
            logger.info("Database migration V3 applied successfully.")

        if current_v < 4:
            logger.info("Applying database migration V4...")
            conn.executescript(MIGRATION_V4)
            conn.execute("INSERT INTO schema_version (version) VALUES (4)")
            conn.commit()
            logger.info("Database migration V4 applied successfully.")

        # Self-healing column checks for pre-existing local databases
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(scan_history_items)")
        cols = {row[1] for row in cursor.fetchall()}
        if cols and "item_order" not in cols:
            logger.info("Upgrading scan_history_items: adding item_order column...")
            conn.execute(
                "ALTER TABLE scan_history_items ADD COLUMN item_order INTEGER NOT NULL DEFAULT 0"
            )
            conn.commit()

        cursor.execute("PRAGMA table_info(download_tasks)")
        dt_cols = {row[1] for row in cursor.fetchall()}
        if dt_cols and "retry_count" not in dt_cols:
            logger.info("Upgrading download_tasks: adding retry_count column...")
            conn.execute(
                "ALTER TABLE download_tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0"
            )
            conn.commit()
    except sqlite3.Error as exc:
        conn.rollback()
        logger.error(f"Failed to initialize database schema: {exc}", exc_info=True)
        raise DatabaseError(f"Database schema initialization failed: {exc}") from exc
