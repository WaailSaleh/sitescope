"""
Tests for RateLimitMiddleware.

The middleware only runs on /api/v1/analyze paths.
We override fetchrow to simulate an exceeded counter.
"""
import pytest
from tests.conftest import VALID_SHADOW_ID

# Default RATE_LIMIT_MAX = 10, IP_RATE_LIMIT_MAX = 30


async def test_sid_rate_limit_returns_429(client, mock_conn):
    """When the SID request count exceeds the limit, the middleware returns 429."""
    mock_conn.fetchrow.return_value = {"request_count": 99}

    resp = await client.get(
        "/api/v1/analyze/history",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers
    assert "Rate limit exceeded" in resp.json()["detail"]


async def test_ip_rate_limit_returns_429(client, mock_conn):
    """
    First fetchrow (SID check) passes; second (IP check) exceeds → 429.
    """
    mock_conn.fetchrow.side_effect = [
        {"request_count": 1},    # SID: within limit
        {"request_count": 999},  # IP: over limit
    ]

    resp = await client.get(
        "/api/v1/analyze/history",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 429
    assert "IP rate limit" in resp.json()["detail"]


async def test_rate_limit_not_applied_to_health(client):
    """Rate limit middleware is skipped for non-analyze paths."""
    resp = await client.get("/health")
    assert resp.status_code == 200


async def test_rate_limit_not_applied_to_session(client, mock_conn):
    """Rate limit middleware is skipped for session paths."""
    mock_conn.fetchrow.return_value = None
    resp = await client.get(
        "/api/v1/session/stats",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 200
