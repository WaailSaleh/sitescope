import aiosqlite
import os
import logging

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DB_PATH", "/app/data/sitescope.db")


class _DbContext:
    """Async context manager wrapper for aiosqlite connections."""
    def __init__(self, path: str):
        self._path = path
        self._db: aiosqlite.Connection | None = None

    async def __aenter__(self):
        self._db = await aiosqlite.connect(self._path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA foreign_keys=ON")
        await self._db.execute("PRAGMA synchronous=NORMAL")
        return self._db

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._db:
            await self._db.close()
        return False


def get_db() -> _DbContext:
    return _DbContext(DB_PATH)


async def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")

        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                sid TEXT PRIMARY KEY,
                fingerprint_hash TEXT NOT NULL,
                first_seen INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                scan_count INTEGER DEFAULT 0
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id TEXT PRIMARY KEY,
                sid TEXT NOT NULL,
                target_url TEXT NOT NULL,
                target_domain TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                completed_at INTEGER,
                result_json TEXT,
                FOREIGN KEY (sid) REFERENCES sessions(sid)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS rate_limits (
                sid TEXT NOT NULL,
                window_start INTEGER NOT NULL,
                request_count INTEGER DEFAULT 1,
                PRIMARY KEY (sid, window_start)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS ip_rate_limits (
                ip TEXT NOT NULL,
                window_start INTEGER NOT NULL,
                request_count INTEGER DEFAULT 1,
                PRIMARY KEY (ip, window_start)
            )
        """)

        await db.execute("CREATE INDEX IF NOT EXISTS idx_scans_sid ON scans(sid)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_rate_limits_sid_window ON rate_limits(sid, window_start)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ip_rate_limits ON ip_rate_limits(ip, window_start)")

        await db.commit()
        logger.info(f"Database initialized at {DB_PATH}")
