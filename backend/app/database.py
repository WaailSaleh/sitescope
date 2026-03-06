import asyncpg
import os
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://sitescope:sitescope@sitescope-postgres:5432/sitescope"
)

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


class _DbContext:
    def __init__(self):
        self._conn: asyncpg.Connection | None = None

    async def __aenter__(self) -> asyncpg.Connection:
        pool = await get_pool()
        self._conn = await pool.acquire()
        return self._conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pool = await get_pool()
        await pool.release(self._conn)
        return False


def get_db() -> _DbContext:
    return _DbContext()


async def init_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                sid TEXT PRIMARY KEY,
                fingerprint_hash TEXT NOT NULL,
                first_seen BIGINT NOT NULL,
                last_seen BIGINT NOT NULL,
                scan_count INTEGER DEFAULT 0
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id TEXT PRIMARY KEY,
                sid TEXT NOT NULL REFERENCES sessions(sid),
                target_url TEXT NOT NULL,
                target_domain TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at BIGINT NOT NULL,
                completed_at BIGINT,
                result_json TEXT
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS rate_limits (
                sid TEXT NOT NULL,
                window_start BIGINT NOT NULL,
                request_count INTEGER DEFAULT 1,
                PRIMARY KEY (sid, window_start)
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS ip_rate_limits (
                ip TEXT NOT NULL,
                window_start BIGINT NOT NULL,
                request_count INTEGER DEFAULT 1,
                PRIMARY KEY (ip, window_start)
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_scans_sid ON scans(sid)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_rate_limits_sid_window ON rate_limits(sid, window_start)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_ip_rate_limits ON ip_rate_limits(ip, window_start)")
    logger.info("Database initialized")
