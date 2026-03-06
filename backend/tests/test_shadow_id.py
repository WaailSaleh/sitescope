"""
Tests for X-Shadow-ID header validation.

The RateLimitMiddleware rejects malformed IDs on all /api/v1/analyze routes
before the route handler runs.  The route handlers themselves also validate.
"""
import pytest
from unittest.mock import patch, AsyncMock
from tests.conftest import VALID_SHADOW_ID


# ---------------------------------------------------------------------------
# Middleware-level rejection (analyze routes)
# ---------------------------------------------------------------------------

async def test_missing_shadow_id_on_analyze(client):
    resp = await client.get("/api/v1/analyze/history")
    assert resp.status_code == 400
    assert "X-Shadow-ID" in resp.json()["detail"]


async def test_short_shadow_id_rejected(client):
    resp = await client.get(
        "/api/v1/analyze/history",
        headers={"X-Shadow-ID": "abc123"},
    )
    assert resp.status_code == 400


async def test_non_hex_shadow_id_rejected(client):
    resp = await client.get(
        "/api/v1/analyze/history",
        headers={"X-Shadow-ID": "z" * 64},
    )
    assert resp.status_code == 400


async def test_uppercase_hex_rejected(client):
    """Shadow ID must be lowercase hex — uppercase fails the regex."""
    resp = await client.get(
        "/api/v1/analyze/history",
        headers={"X-Shadow-ID": "A" * 64},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Route-level rejection (session route — middleware skipped)
# ---------------------------------------------------------------------------

async def test_malformed_shadow_id_on_session_route(client):
    resp = await client.get(
        "/api/v1/session/stats",
        headers={"X-Shadow-ID": "bad"},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Valid ID passes format check
# ---------------------------------------------------------------------------

async def test_valid_shadow_id_passes_format(client, mock_conn):
    """A well-formed shadow ID reaches the handler (SSRF check mocked to block)."""
    with patch(
        "app.routers.analyze.resolve_and_validate",
        new=AsyncMock(return_value=(False, "blocked for test")),
    ):
        resp = await client.post(
            "/api/v1/analyze/start",
            json={"url": "https://example.com"},
            headers={"X-Shadow-ID": VALID_SHADOW_ID},
        )
    # 400 because SSRF blocked it — not a shadow-ID validation error
    assert resp.status_code == 400
    assert "URL rejected" in resp.json()["detail"]
