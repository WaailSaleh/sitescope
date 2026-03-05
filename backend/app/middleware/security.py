import ipaddress
import time
import re
import logging
from urllib.parse import urlparse

import dns.resolver
import dns.exception
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.database import get_db

logger = logging.getLogger(__name__)

SHADOW_ID_RE = re.compile(r'^[0-9a-f]{64}$')

RATE_LIMIT_MAX = int(__import__('os').getenv("RATE_LIMIT_MAX", "10"))
RATE_LIMIT_WINDOW = int(__import__('os').getenv("RATE_LIMIT_WINDOW", "60"))
IP_RATE_LIMIT_MAX = int(__import__('os').getenv("IP_RATE_LIMIT_MAX", "30"))

BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("::ffff:0:0/96"),
]

BLOCKED_HOSTS = {
    "169.254.169.254",  # AWS metadata
    "metadata.google.internal",
    "169.254.170.2",    # ECS metadata
}


def is_private_ip(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
        if str(ip) in BLOCKED_HOSTS:
            return True
        for network in BLOCKED_NETWORKS:
            if ip in network:
                return True
        return False
    except ValueError:
        return True


async def resolve_and_validate(url: str) -> tuple[bool, str]:
    """
    Resolve URL hostname and validate it's not a private/internal address.
    Returns (is_safe, reason).
    Fails closed — DNS failure = rejected.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "Invalid URL format"

    if parsed.scheme not in ("http", "https"):
        return False, "Only http and https schemes are allowed"

    hostname = parsed.hostname
    if not hostname:
        return False, "No hostname in URL"

    if hostname in BLOCKED_HOSTS:
        return False, "Hostname is blocked"

    # Block direct IP submissions that are private
    try:
        direct_ip = ipaddress.ip_address(hostname)
        if is_private_ip(str(direct_ip)):
            return False, "Direct IP address points to private/reserved range"
    except ValueError:
        pass  # It's a domain name, proceed to DNS resolution

    # DNS resolution — fail closed
    try:
        resolver = dns.resolver.Resolver()
        resolver.timeout = 5
        resolver.lifetime = 5

        answers = resolver.resolve(hostname, 'A')
        for rdata in answers:
            ip_str = str(rdata)
            if is_private_ip(ip_str):
                return False, f"Hostname resolves to private/reserved IP: {ip_str}"

        # Also check AAAA
        try:
            aaaa_answers = resolver.resolve(hostname, 'AAAA')
            for rdata in aaaa_answers:
                ip_str = str(rdata)
                if is_private_ip(ip_str):
                    return False, f"Hostname resolves to private/reserved IPv6: {ip_str}"
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.exception.Timeout):
            pass  # No AAAA records is fine

    except dns.resolver.NXDOMAIN:
        return False, "Hostname does not exist (NXDOMAIN)"
    except dns.resolver.NoAnswer:
        return False, "DNS returned no answer"
    except dns.exception.Timeout:
        return False, "DNS resolution timed out"
    except Exception as e:
        logger.warning(f"DNS resolution failed for {hostname}: {e}")
        return False, "DNS resolution failed"

    return True, "OK"


def get_client_ip(request: Request) -> str:
    """Extract real client IP, trusting only the first X-Forwarded-For entry."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take only the first IP to prevent header injection
        first_ip = forwarded_for.split(",")[0].strip()
        try:
            ipaddress.ip_address(first_ip)
            return first_ip
        except ValueError:
            pass
    return request.client.host if request.client else "unknown"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Outermost middleware — adds security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self'; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "font-src 'self'; "
            "object-src 'none'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limit middleware — sid-based and IP-based."""

    async def dispatch(self, request: Request, call_next):
        # Only enforce on analysis routes
        if not request.url.path.startswith("/api/v1/analyze"):
            return await call_next(request)

        shadow_id = request.headers.get("X-Shadow-ID", "")
        if not SHADOW_ID_RE.match(shadow_id):
            return JSONResponse(
                status_code=400,
                content={"detail": "Missing or malformed X-Shadow-ID header (must be 64-char hex SHA-256)"}
            )

        client_ip = get_client_ip(request)
        now = int(time.time())
        window_start = now - (now % RATE_LIMIT_WINDOW)

        try:
            async with get_db() as db:
                # --- SID-based rate limit ---
                await db.execute("""
                    INSERT INTO rate_limits (sid, window_start, request_count)
                    VALUES (?, ?, 1)
                    ON CONFLICT(sid, window_start) DO UPDATE SET request_count = request_count + 1
                """, (shadow_id, window_start))
                await db.commit()

                row = await db.execute_fetchall(
                    "SELECT request_count FROM rate_limits WHERE sid = ? AND window_start = ?",
                    (shadow_id, window_start)
                )
                sid_count = row[0]["request_count"] if row else 1

                if sid_count > RATE_LIMIT_MAX:
                    retry_after = RATE_LIMIT_WINDOW - (now % RATE_LIMIT_WINDOW)
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Rate limit exceeded. Try again later."},
                        headers={"Retry-After": str(retry_after)}
                    )

                # --- IP-based secondary rate limit ---
                await db.execute("""
                    INSERT INTO ip_rate_limits (ip, window_start, request_count)
                    VALUES (?, ?, 1)
                    ON CONFLICT(ip, window_start) DO UPDATE SET request_count = request_count + 1
                """, (client_ip, window_start))
                await db.commit()

                ip_row = await db.execute_fetchall(
                    "SELECT request_count FROM ip_rate_limits WHERE ip = ? AND window_start = ?",
                    (client_ip, window_start)
                )
                ip_count = ip_row[0]["request_count"] if ip_row else 1

                if ip_count > IP_RATE_LIMIT_MAX:
                    retry_after = RATE_LIMIT_WINDOW - (now % RATE_LIMIT_WINDOW)
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "IP rate limit exceeded. Try again later."},
                        headers={"Retry-After": str(retry_after)}
                    )

        except Exception as e:
            logger.error(f"Rate limit check failed: {e}")
            # Fail open for rate limit DB errors (don't block legit users on DB hiccup)

        return await call_next(request)
