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
    async with get_db() as db:
        existing = await db.execute_fetchall(
            "SELECT sid FROM sessions WHERE sid = ?", (sid,)
        )
        if not existing:
            await db.execute(
                """INSERT INTO sessions (sid, fingerprint_hash, first_seen, last_seen, scan_count)
                   VALUES (?, ?, ?, ?, 0)""",
                (sid, sid, now, now)
            )
        else:
            await db.execute(
                "UPDATE sessions SET last_seen = ? WHERE sid = ?",
                (now, sid)
            )
        await db.commit()


@router.get("/stats", response_model=SessionStats)
async def get_session_stats(x_shadow_id: str = Header(..., alias="X-Shadow-ID")):
    if not SHADOW_ID_RE.match(x_shadow_id):
        raise HTTPException(status_code=400, detail="Invalid X-Shadow-ID header")

    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT scan_count, first_seen, last_seen FROM sessions WHERE sid = ?",
            (x_shadow_id,)
        )

    if not rows:
        return SessionStats(scan_count=0, first_seen=int(time.time()), last_seen=int(time.time()))

    row = rows[0]
    return SessionStats(
        scan_count=row["scan_count"],
        first_seen=row["first_seen"],
        last_seen=row["last_seen"],
    )
