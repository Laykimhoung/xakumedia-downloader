"""Thread-safe SQLite connection management and session handling for XakuMedia."""

import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from ..core.config import default_config
from ..core.logging import get_logger
from ..exceptions.base import DatabaseError
from .schema import init_schema

logger = get_logger("db.connection")


def get_db_connection(db_path: Path | str | None = None) -> sqlite3.Connection:
    """Create a configured SQLite connection with WAL mode and foreign keys enabled."""
    target_path = Path(db_path) if db_path else default_config.database_path

    # Ensure parent directory exists for file-based databases
    if str(target_path) != ":memory:":
        target_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        conn = sqlite3.connect(
            str(target_path),
            timeout=5.0,
            check_same_thread=False,
            isolation_level=None,  # Autocommit mode; explicit transactions handled via context
        )
        conn.row_factory = sqlite3.Row

        # Performance and safety PRAGMAs
        if str(target_path) != ":memory:":
            conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA synchronous = NORMAL;")

        return conn
    except sqlite3.Error as exc:
        logger.error(f"Failed to connect to SQLite database at {target_path}: {exc}")
        raise DatabaseError(f"Database connection error: {exc}") from exc


@contextmanager
def get_db_session(
    db_path: Path | str | None = None,
) -> Generator[sqlite3.Connection, None, None]:
    """Context manager providing an active connection with transaction control."""
    conn = get_db_connection(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE;")
        yield conn
        conn.execute("COMMIT;")
    except Exception as exc:
        try:
            conn.execute("ROLLBACK;")
        except sqlite3.Error:
            pass
        logger.error(f"Transaction failed, rolled back: {exc}")
        raise
    finally:
        conn.close()


def ensure_database_initialized(db_path: Path | str | None = None) -> None:
    """Ensure the database exists and has all current schema migrations applied."""
    conn = get_db_connection(db_path)
    try:
        init_schema(conn)
    finally:
        conn.close()
