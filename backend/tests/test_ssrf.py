"""
Unit tests for resolve_and_validate (SSRF protection).
DNS calls are mocked so no real network traffic is made.
"""
import pytest
import dns.resolver
import dns.exception
from unittest.mock import patch, MagicMock

from app.middleware.security import resolve_and_validate


class _FakeA:
    """Fake DNS A record whose str() is an IP address."""
    def __init__(self, ip: str):
        self._ip = ip

    def __str__(self) -> str:
        return self._ip


# ---------------------------------------------------------------------------
# Direct-IP submissions
# ---------------------------------------------------------------------------

async def test_private_rfc1918_blocked():
    ok, reason = await resolve_and_validate("http://192.168.1.1/")
    assert not ok
    assert "private" in reason.lower()


async def test_loopback_blocked():
    ok, reason = await resolve_and_validate("http://127.0.0.1/")
    assert not ok


async def test_link_local_blocked():
    ok, reason = await resolve_and_validate("http://169.254.169.254/")
    assert not ok


# ---------------------------------------------------------------------------
# Scheme validation
# ---------------------------------------------------------------------------

async def test_ftp_scheme_blocked():
    ok, reason = await resolve_and_validate("ftp://example.com/path")
    assert not ok
    assert "http" in reason.lower()


async def test_file_scheme_blocked():
    ok, reason = await resolve_and_validate("file:///etc/passwd")
    assert not ok


# ---------------------------------------------------------------------------
# DNS-level SSRF
# ---------------------------------------------------------------------------

async def test_nxdomain_blocked():
    with patch("app.middleware.security.dns.resolver.Resolver") as MockCls:
        MockCls.return_value.resolve.side_effect = dns.resolver.NXDOMAIN()
        ok, reason = await resolve_and_validate("http://nonexistent.invalid/")
    assert not ok
    assert "NXDOMAIN" in reason


async def test_domain_resolves_to_private_ip_blocked():
    with patch("app.middleware.security.dns.resolver.Resolver") as MockCls:
        MockCls.return_value.resolve.return_value = [_FakeA("10.0.0.1")]
        ok, reason = await resolve_and_validate("http://evil.example.com/")
    assert not ok
    assert "private" in reason.lower()


async def test_dns_timeout_blocked():
    with patch("app.middleware.security.dns.resolver.Resolver") as MockCls:
        MockCls.return_value.resolve.side_effect = dns.exception.Timeout()
        ok, reason = await resolve_and_validate("http://slow.example.com/")
    assert not ok
    assert "timed out" in reason.lower()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

async def test_valid_public_url_allowed():
    with patch("app.middleware.security.dns.resolver.Resolver") as MockCls:
        def _resolve(host, rtype):
            if rtype == "A":
                return [_FakeA("93.184.216.34")]
            raise dns.resolver.NoAnswer()

        MockCls.return_value.resolve.side_effect = _resolve
        ok, _ = await resolve_and_validate("https://example.com/")
    assert ok
