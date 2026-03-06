import json
import time
import uuid
import logging
from urllib.parse import urlparse

from fastapi import APIRouter, Header, HTTPException, BackgroundTasks, Query
from app.database import get_db
from app.middleware.security import resolve_and_validate
from app.models.schemas import AnalyzeRequest, ScanResponse, ScanResult, SHADOW_ID_RE, UUID_RE
from app.services.analyzer import analyze_target
from app.routers.session import upsert_session

router = APIRouter(prefix="/api/v1/analyze", tags=["analyze"])
logger = logging.getLogger(__name__)


async def _run_scan(scan_id: str, url: str, sid: str):
    """Background task: run analysis and persist result."""
    try:
        result = await analyze_target(url)
        completed_at = int(time.time())

        async with get_db() as conn:
            async with conn.transaction():
                await conn.execute(
                    "UPDATE scans SET status='complete', result_json=$1, completed_at=$2 WHERE id=$3",
                    json.dumps(result), completed_at, scan_id
                )
                await conn.execute(
                    "UPDATE sessions SET scan_count = scan_count + 1, last_seen = $1 WHERE sid = $2",
                    completed_at, sid
                )

    except Exception as e:
        logger.error(f"Scan {scan_id} failed: {e}")
        async with get_db() as conn:
            await conn.execute(
                "UPDATE scans SET status='error', completed_at=$1 WHERE id=$2",
                int(time.time()), scan_id
            )


@router.post("/start", response_model=ScanResponse, status_code=202)
async def start_analysis(
    body: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    x_shadow_id: str = Header(..., alias="X-Shadow-ID"),
):
    if not SHADOW_ID_RE.match(x_shadow_id):
        raise HTTPException(status_code=400, detail="Invalid X-Shadow-ID header")

    # SSRF validation
    is_safe, reason = await resolve_and_validate(body.url)
    if not is_safe:
        raise HTTPException(status_code=400, detail=f"URL rejected: {reason}")

    domain = urlparse(body.url).hostname or ""
    scan_id = str(uuid.uuid4())
    created_at = int(time.time())

    # Ensure session exists
    await upsert_session(x_shadow_id)

    async with get_db() as conn:
        await conn.execute(
            "INSERT INTO scans (id, sid, target_url, target_domain, status, created_at) VALUES ($1, $2, $3, $4, 'pending', $5)",
            scan_id, x_shadow_id, body.url, domain, created_at
        )

    background_tasks.add_task(_run_scan, scan_id, body.url, x_shadow_id)

    return ScanResponse(scan_id=scan_id, status="pending")


@router.get("/history")
async def scan_history(
    x_shadow_id: str = Header(..., alias="X-Shadow-ID"),
    page: int = Query(default=1, ge=1, le=100),
    limit: int = Query(default=10, ge=1, le=50),
):
    if not SHADOW_ID_RE.match(x_shadow_id):
        raise HTTPException(status_code=400, detail="Invalid X-Shadow-ID header")

    offset = (page - 1) * limit

    async with get_db() as conn:
        rows = await conn.fetch(
            """SELECT id, target_url, target_domain, status, created_at, completed_at
               FROM scans WHERE sid = $1
               ORDER BY created_at DESC LIMIT $2 OFFSET $3""",
            x_shadow_id, limit, offset
        )

    return {
        "page": page,
        "limit": limit,
        "scans": [dict(r) for r in rows]
    }


@router.get("/{scan_id}", response_model=ScanResult)
async def get_scan(
    scan_id: str,
    x_shadow_id: str = Header(..., alias="X-Shadow-ID"),
):
    if not SHADOW_ID_RE.match(x_shadow_id):
        raise HTTPException(status_code=400, detail="Invalid X-Shadow-ID header")

    # Validate scan_id is a UUID
    if not UUID_RE.match(scan_id):
        raise HTTPException(status_code=400, detail="Invalid scan_id format")

    async with get_db() as conn:
        row = await conn.fetchrow(
            "SELECT id, sid, status, result_json, created_at, completed_at FROM scans WHERE id = $1",
            scan_id
        )

    if not row:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Ownership check — only return to the requesting sid
    if row["sid"] != x_shadow_id:
        raise HTTPException(status_code=403, detail="Access denied")

    result_data = None
    if row["result_json"]:
        try:
            result_data = json.loads(row["result_json"])
        except json.JSONDecodeError:
            result_data = None

    return ScanResult(
        scan_id=row["id"],
        status=row["status"],
        result=result_data,
        created_at=row["created_at"],
        completed_at=row["completed_at"],
    )
