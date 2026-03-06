"""
Tests for the analyze router: start, get, and history endpoints.
"""
import uuid
import json
import pytest
from unittest.mock import patch, AsyncMock

from tests.conftest import VALID_SHADOW_ID

OTHER_SHADOW_ID = "b" * 64


# ---------------------------------------------------------------------------
# POST /api/v1/analyze/start
# ---------------------------------------------------------------------------

async def test_start_scan_returns_202(client, mock_conn):
    """Happy path: valid URL accepted, scan queued."""
    with (
        patch(
            "app.routers.analyze.resolve_and_validate",
            new=AsyncMock(return_value=(True, "OK")),
        ),
        patch(
            "app.routers.analyze.analyze_target",
            new=AsyncMock(return_value={"title": "Example"}),
        ),
    ):
        resp = await client.post(
            "/api/v1/analyze/start",
            json={"url": "https://example.com"},
            headers={"X-Shadow-ID": VALID_SHADOW_ID},
        )

    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending"
    assert "scan_id" in body


async def test_start_scan_ssrf_blocked(client):
    """SSRF-blocked URL returns 400 with descriptive detail."""
    with patch(
        "app.routers.analyze.resolve_and_validate",
        new=AsyncMock(return_value=(False, "resolves to private IP")),
    ):
        resp = await client.post(
            "/api/v1/analyze/start",
            json={"url": "https://internal.corp/"},
            headers={"X-Shadow-ID": VALID_SHADOW_ID},
        )

    assert resp.status_code == 400
    assert "URL rejected" in resp.json()["detail"]


async def test_start_scan_invalid_url_scheme(client):
    """Non-http/https URL is rejected by the request schema before SSRF."""
    resp = await client.post(
        "/api/v1/analyze/start",
        json={"url": "ftp://files.example.com"},
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 422  # Pydantic validation


# ---------------------------------------------------------------------------
# GET /api/v1/analyze/{scan_id}
# ---------------------------------------------------------------------------

async def test_get_scan_not_found(client, mock_conn):
    scan_id = str(uuid.uuid4())
    mock_conn.fetchrow.return_value = None

    resp = await client.get(
        f"/api/v1/analyze/{scan_id}",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 404


async def test_get_scan_wrong_owner_forbidden(client, mock_conn):
    scan_id = str(uuid.uuid4())
    mock_conn.fetchrow.return_value = {
        "id": scan_id,
        "sid": OTHER_SHADOW_ID,
        "status": "complete",
        "result_json": None,
        "created_at": 1000,
        "completed_at": 2000,
    }

    resp = await client.get(
        f"/api/v1/analyze/{scan_id}",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 403


async def test_get_scan_success(client, mock_conn):
    scan_id = str(uuid.uuid4())
    mock_conn.fetchrow.return_value = {
        "id": scan_id,
        "sid": VALID_SHADOW_ID,
        "status": "complete",
        "result_json": json.dumps({"title": "Example"}),
        "created_at": 1000,
        "completed_at": 2000,
    }

    resp = await client.get(
        f"/api/v1/analyze/{scan_id}",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "complete"
    assert body["result"] == {"title": "Example"}
    assert body["scan_id"] == scan_id


async def test_get_scan_invalid_scan_id_format(client):
    resp = await client.get(
        "/api/v1/analyze/not-a-uuid",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/v1/analyze/history
# ---------------------------------------------------------------------------

async def test_history_returns_empty_list(client, mock_conn):
    mock_conn.fetch.return_value = []

    resp = await client.get(
        "/api/v1/analyze/history",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["scans"] == []
    assert body["page"] == 1


async def test_history_returns_scans(client, mock_conn):
    scan_id = str(uuid.uuid4())
    mock_conn.fetch.return_value = [
        {
            "id": scan_id,
            "target_url": "https://example.com",
            "target_domain": "example.com",
            "status": "complete",
            "created_at": 1000,
            "completed_at": 2000,
        }
    ]

    resp = await client.get(
        "/api/v1/analyze/history",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 200
    assert len(resp.json()["scans"]) == 1
    assert resp.json()["scans"][0]["id"] == scan_id
