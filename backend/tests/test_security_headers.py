"""
Verify that SecurityHeadersMiddleware adds the expected headers to every response.
Uses the /health endpoint (no shadow ID required) for simplicity.
"""


async def test_security_headers_present(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    h = resp.headers
    assert h["X-Content-Type-Options"] == "nosniff"
    assert h["X-Frame-Options"] == "DENY"
    assert h["Referrer-Policy"] == "no-referrer"
    assert "default-src 'self'" in h["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in h["Content-Security-Policy"]
    assert h["Permissions-Policy"] == "camera=(), microphone=(), geolocation=()"
    assert h["X-XSS-Protection"] == "1; mode=block"


async def test_security_headers_on_404(client):
    """Headers must appear even on routes that don't exist."""
    resp = await client.get("/no-such-route")
    assert "X-Frame-Options" in resp.headers
    assert "Content-Security-Policy" in resp.headers
