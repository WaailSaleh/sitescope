"""
Tests for the session stats endpoint.
"""
from tests.conftest import VALID_SHADOW_ID


async def test_session_stats_no_prior_session(client, mock_conn):
    """If the session doesn't exist yet, defaults are returned (scan_count=0)."""
    mock_conn.fetchrow.return_value = None

    resp = await client.get(
        "/api/v1/session/stats",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["scan_count"] == 0
    assert "first_seen" in body
    assert "last_seen" in body


async def test_session_stats_existing_session(client, mock_conn):
    """Existing session data is reflected in the response."""
    mock_conn.fetchrow.return_value = {
        "scan_count": 5,
        "first_seen": 1700000000,
        "last_seen": 1700001000,
    }

    resp = await client.get(
        "/api/v1/session/stats",
        headers={"X-Shadow-ID": VALID_SHADOW_ID},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["scan_count"] == 5
    assert body["first_seen"] == 1700000000
    assert body["last_seen"] == 1700001000


async def test_session_stats_invalid_shadow_id(client):
    resp = await client.get(
        "/api/v1/session/stats",
        headers={"X-Shadow-ID": "tooshort"},
    )
    assert resp.status_code == 400
