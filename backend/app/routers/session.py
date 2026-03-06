import time
import logging
from fastapi import APIRouter, Header, HTTPException
from app.database import get_db
from app.models.schemas import SessionStats, SHADOW_ID_RE

router = APIRouter(prefix="/api/v1/session", tags=["session"])
logger = logging.getLogger(__name__)


async def upsert_session(sid: str):
    """Insert or update session record."""
    now = int(time.time())
    async with get_db() as conn:
        await conn.execute(
            """INSERT INTO sessions (sid, fingerprint_hash, first_seen, last_seen, scan_count)
               VALUES ($1, $1, $2, $2, 0)
               ON CONFLICT (sid) DO UPDATE SET last_seen = EXCLUDED.last_seen""",
            sid, now
        )


@router.get("/stats", response_model=SessionStats)
async def get_session_stats(x_shadow_id: str = Header(..., alias="X-Shadow-ID")):
    if not SHADOW_ID_RE.match(x_shadow_id):
        raise HTTPException(status_code=400, detail="Invalid X-Shadow-ID header")

    async with get_db() as conn:
        row = await conn.fetchrow(
            "SELECT scan_count, first_seen, last_seen FROM sessions WHERE sid = $1",
            x_shadow_id
        )

    if not row:
        return SessionStats(scan_count=0, first_seen=int(time.time()), last_seen=int(time.time()))

    return SessionStats(
        scan_count=row["scan_count"],
        first_seen=row["first_seen"],
        last_seen=row["last_seen"],
    )
