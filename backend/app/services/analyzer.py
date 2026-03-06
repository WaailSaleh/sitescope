import asyncio
import os
import re
import time
import logging
from urllib.parse import urlparse, urljoin

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

DOH_URL = "https://cloudflare-dns.com/dns-query"

# Tor SOCKS5 proxy — set TOR_PROXY=socks5h://127.0.0.1:9050 to enable.
# socks5h:// (not socks5://) routes DNS through Tor too — prevents DNS leaks.
# When running as sidecar, Tor listens on localhost:9050 inside the pod.
_TOR_PROXY = os.getenv("TOR_PROXY", "").strip() or None
if _TOR_PROXY:
    logger.info(f"Tor proxy enabled: {_TOR_PROXY}")
else:
    logger.info("Tor proxy disabled — set TOR_PROXY=socks5h://127.0.0.1:9050 to enable")

# --- Compiled regex patterns (checked for ReDoS safety) ---
# Using possessive/atomic equivalents where Python allows; kept linear.
RE_API_V1 = re.compile(r'["`](/api/[a-zA-Z0-9_/\-:{}]{1,200})["`]')
RE_API_V2 = re.compile(r'["`](/(v[0-9]{1,3}|rest|graphql|gql)/[a-zA-Z0-9_/\-:{}]{1,200})["`]')
RE_ENV_VARS = re.compile(r'process\.env\.([A-Z][A-Z0-9_]{0,60})')
RE_SECRETS = re.compile(
    r'(?:api[_\-]?key|token|secret|password|auth)'
    r'["\s]{0,5}[:=]["\s]{0,5}["\`]([a-zA-Z0-9_\-]{16,80})["\`]',
    re.IGNORECASE
)
RE_EXTERNAL_DOMAINS = re.compile(r'https?://([a-zA-Z0-9\-]{1,63}(?:\.[a-zA-Z0-9\-]{1,63}){1,5}\.[a-zA-Z]{2,10})')
RE_GRAPHQL = re.compile(r'(?:query|mutation|subscription)\s+\w{1,60}\s*\{')
RE_WEBSOCKET = re.compile(r'wss?://[a-zA-Z0-9_/\-\.]{1,100}(?:[?][a-zA-Z0-9_=&\-\.]{0,200})?')


async def _doh_query(hostname: str, record_type: str, client: httpx.AsyncClient) -> list:
    """DNS-over-HTTPS query via Cloudflare."""
    try:
        resp = await client.get(
            DOH_URL,
            params={"name": hostname, "type": record_type},
            headers={"Accept": "application/dns-json"},
            timeout=8.0,
        )
        data = resp.json()
        answers = data.get("Answer", [])
        return [a.get("data", "") for a in answers if a.get("type") == _dns_type_id(record_type)]
    except Exception as e:
        logger.debug(f"DoH query failed for {hostname} {record_type}: {e}")
        return []


def _dns_type_id(t: str) -> int:
    return {"A": 1, "NS": 2, "CNAME": 5, "MX": 15, "TXT": 16, "AAAA": 28}.get(t.upper(), 0)


async def _pass1_headers(url: str, client: httpx.AsyncClient) -> dict:
    """HTTP header fingerprinting."""
    headers_result = {
        "server": None, "powered_by": None, "cdn": None,
        "csp_parsed": None, "cors": None, "raw_headers": {}
    }
    try:
        resp = await client.get(url, timeout=10.0, follow_redirects=True)
        raw = dict(resp.headers)
        headers_result["raw_headers"] = {k.lower(): v for k, v in raw.items()}

        h = headers_result["raw_headers"]
        headers_result["server"] = h.get("server")
        headers_result["powered_by"] = h.get("x-powered-by")
        headers_result["generator"] = h.get("x-generator")

        # CDN detection
        cdn = None
        if "cf-ray" in h:
            cdn = "Cloudflare"
        elif "x-vercel-id" in h:
            cdn = "Vercel"
        elif "x-amz-cf-id" in h or any(k.startswith("x-amz-") for k in h):
            cdn = "AWS CloudFront"
        elif "x-served-by" in h and "cache" in h.get("x-served-by", "").lower():
            cdn = "Fastly"
        elif "x-check-cacheable" in h:
            cdn = "Akamai"
        elif "x-azure-" in " ".join(h.keys()):
            cdn = "Azure"
        headers_result["cdn"] = cdn

        # CSP parsing
        csp_raw = h.get("content-security-policy")
        if csp_raw:
            csp_parsed = {"raw": csp_raw, "directives": {}, "flags": []}
            for directive in csp_raw.split(";"):
                directive = directive.strip()
                if not directive:
                    continue
                parts = directive.split()
                if parts:
                    csp_parsed["directives"][parts[0]] = parts[1:] if len(parts) > 1 else []
            if "'unsafe-inline'" in csp_raw:
                csp_parsed["flags"].append("unsafe-inline")
            if "'unsafe-eval'" in csp_raw:
                csp_parsed["flags"].append("unsafe-eval")
            headers_result["csp_parsed"] = csp_parsed

        # CORS
        if "access-control-allow-origin" in h:
            headers_result["cors"] = {
                "allow_origin": h.get("access-control-allow-origin"),
                "allow_methods": h.get("access-control-allow-methods"),
                "allow_headers": h.get("access-control-allow-headers"),
                "allow_credentials": h.get("access-control-allow-credentials"),
            }

        return headers_result, resp.text, resp.status_code
    except Exception as e:
        logger.warning(f"Pass 1 failed for {url}: {e}")
        return headers_result, "", 0


async def _pass2_html(html: str) -> dict:
    """HTML surface analysis."""
    result = {"scripts": [], "stylesheets": [], "meta": {}, "forms": [], "framework_hints": []}
    if not html:
        return result

    try:
        soup = BeautifulSoup(html, "lxml")

        result["scripts"] = [
            s.get("src") for s in soup.find_all("script", src=True)
            if s.get("src")
        ]

        result["stylesheets"] = [
            l.get("href") for l in soup.find_all("link", rel="stylesheet")
            if l.get("href")
        ]

        for meta in soup.find_all("meta"):
            name = meta.get("name") or meta.get("property") or meta.get("http-equiv")
            content = meta.get("content")
            if name and content:
                result["meta"][name] = content

        for form in soup.find_all("form"):
            result["forms"].append({
                "action": form.get("action", ""),
                "method": form.get("method", "GET").upper(),
            })

        # Framework hints from DOM
        hints = set()
        if soup.find(attrs={"data-reactroot": True}) or soup.find(id="__next"):
            hints.add("React/Next.js")
        if soup.find(attrs=lambda a: a and any(k.startswith("data-v-") for k in a)):
            hints.add("Vue.js")
        if soup.find(attrs={"ng-app": True}) or soup.find(attrs={"ng-version": True}):
            hints.add("Angular")
        if soup.find(id="__nuxt") or soup.find(id="__layout"):
            hints.add("Nuxt.js")
        if any("__svelte" in str(s) for s in soup.find_all("script")):
            hints.add("Svelte")

        # Inline JS longer than 50 chars
        inline_js = []
        for script in soup.find_all("script", src=False):
            content = script.string or ""
            if len(content) > 50:
                inline_js.append(content[:200] + ("..." if len(content) > 200 else ""))
        result["inline_js_snippets"] = inline_js[:5]
        result["framework_hints"] = list(hints)

    except Exception as e:
        logger.warning(f"Pass 2 HTML parse failed: {e}")

    return result


RE_SOURCEMAP_COMMENT = re.compile(r'//[#@]\s*sourceMappingURL=(\S+)')
MAX_MAP_BYTES = 2 * 1024 * 1024   # 2MB per map file
MAX_SOURCE_FILES = 50              # max files to store per map
MAX_SOURCE_CONTENT_BYTES = 50_000  # truncate individual file content


def _resolve_url(src: str, base_url: str) -> str:
    """Resolve a potentially relative script URL against the page base."""
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("/"):
        p = urlparse(base_url)
        return f"{p.scheme}://{p.netloc}{src}"
    if not src.startswith("http"):
        return urljoin(base_url, src)
    return src


async def _fetch_and_parse_sourcemap(
    map_url: str,
    js_url: str,
    client: httpx.AsyncClient,
) -> dict | None:
    """
    Fetch a .map file and extract the source tree.
    Returns structured dict or None on failure.
    """
    try:
        resp = await client.get(map_url, timeout=8.0, follow_redirects=True)
        if resp.status_code != 200:
            return None

        raw = resp.text
        if len(raw) > MAX_MAP_BYTES:
            logger.debug(f"Source map too large ({len(raw)} bytes), truncating: {map_url}")
            # Still parse — just won't have sourcesContent for large files
            raw = raw[:MAX_MAP_BYTES]

        try:
            data = __import__('json').loads(raw)
        except Exception:
            logger.debug(f"Source map JSON parse failed: {map_url}")
            return None

        version = data.get("version")
        if version not in (3, "3"):
            return None  # Only support source map v3

        sources_raw = data.get("sources", [])
        sources_content = data.get("sourcesContent", [])

        # Build file tree entries
        files = []
        for i, path in enumerate(sources_raw[:MAX_SOURCE_FILES]):
            if not path or not isinstance(path, str):
                continue

            # Normalise webpack/vite internal prefixes
            display_path = path
            for prefix in ("webpack://", "webpack:///", "vite:///", "./"):
                if display_path.startswith(prefix):
                    display_path = display_path[len(prefix):]
                    break

            content = None
            if i < len(sources_content) and isinstance(sources_content[i], str):
                raw_content = sources_content[i]
                if len(raw_content) > MAX_SOURCE_CONTENT_BYTES:
                    content = raw_content[:MAX_SOURCE_CONTENT_BYTES] + "\n// [truncated]"
                else:
                    content = raw_content

            # Infer language from extension
            ext = display_path.rsplit(".", 1)[-1].lower() if "." in display_path else ""
            lang = {
                "ts": "typescript", "tsx": "typescript",
                "js": "javascript",  "jsx": "javascript",
                "vue": "vue",        "svelte": "svelte",
                "css": "css",        "scss": "css",
                "json": "json",      "py": "python",
            }.get(ext, "text")

            files.append({
                "path": display_path,
                "original_path": path,
                "lang": lang,
                "has_content": content is not None,
                "content": content,
                "size": len(content) if content else 0,
            })

        # Exposure level
        has_content = any(f["has_content"] for f in files)
        exposure = "full_source" if has_content else "paths_only"

        return {
            "map_url": map_url,
            "js_url": js_url,
            "version": version,
            "exposure": exposure,          # 'full_source' | 'paths_only'
            "file_count": len(files),
            "files": files,
            "sources_root": data.get("sourceRoot", ""),
        }

    except Exception as e:
        logger.debug(f"Source map fetch failed {map_url}: {e}")
        return None


async def _pass3_js(script_urls: list, base_url: str, client: httpx.AsyncClient) -> dict:
    """JS bundle analysis + source map recovery."""
    result = {
        "endpoints": [], "source_map_leaks": [], "env_vars": [],
        "secret_patterns": [], "external_domains": [],
        "graphql": False, "websockets": [],
        "source_maps": [],   # NEW: parsed source map data
    }

    resolved_urls = [_resolve_url(s, base_url) for s in script_urls[:5]]
    logger.info(f"Pass 3: analyzing {len(resolved_urls)} scripts from {base_url}")

    async def analyze_one(js_url: str):
        try:
            resp = await client.get(js_url, timeout=8.0, follow_redirects=True)
            content = resp.text
            content_len = len(content)

            # sourceMappingURL is ALWAYS at the end of the file — search the tail first
            # then fall back to scanning the full sample for edge cases
            tail = content[-2000:] if content_len > 2000 else content
            content_sample = content[:500_000]

            # --- Source map discovery ---
            # Method 1: SourceMap / X-SourceMap response header (highest priority)
            map_url = resp.headers.get("SourceMap") or resp.headers.get("X-SourceMap")
            if map_url:
                logger.info(f"  Source map found via header: {map_url} (js: {js_url})")

            # Method 2: //# sourceMappingURL= comment — search TAIL first, then full sample
            if not map_url:
                m = RE_SOURCEMAP_COMMENT.search(tail) or RE_SOURCEMAP_COMMENT.search(content_sample)
                if m:
                    map_url = m.group(1).strip()
                    logger.info(f"  Source map found via comment: {map_url} (js: {js_url})")

            # Method 3: Blind probe — append .map to JS URL
            if not map_url:
                probe_url = js_url + ".map"
                try:
                    head = await client.head(probe_url, timeout=4.0)
                    if head.status_code == 200:
                        map_url = probe_url
                        logger.info(f"  Source map found via probe: {map_url}")
                    else:
                        logger.debug(f"  No map at {probe_url} (HTTP {head.status_code})")
                except Exception as e:
                    logger.debug(f"  Map probe failed for {probe_url}: {e}")

            # Resolve relative map URLs against the JS file's URL
            if map_url and not map_url.startswith("http") and not map_url.startswith("data:"):
                map_url = _resolve_url(map_url, js_url)
                logger.info(f"  Resolved relative map URL to: {map_url}")

            # Fetch and parse
            if map_url and not map_url.startswith("data:"):
                parsed_map = await _fetch_and_parse_sourcemap(map_url, js_url, client)
                if parsed_map:
                    logger.info(f"  Parsed source map: {parsed_map['file_count']} files, exposure={parsed_map['exposure']}")
                    result["source_maps"].append(parsed_map)
                    result["source_map_leaks"].append(map_url)
                else:
                    logger.info(f"  Source map fetch/parse failed: {map_url}")
            else:
                logger.info(f"  No source map found for {js_url}")

            # --- Existing regex analysis ---
            endpoints = RE_API_V1.findall(content_sample) + RE_API_V2.findall(content_sample)
            result["endpoints"].extend(endpoints)
            result["env_vars"].extend(RE_ENV_VARS.findall(content_sample))

            for match in RE_SECRETS.finditer(content_sample):
                result["secret_patterns"].append({
                    "pattern": match.group(0)[:80],
                    "source": js_url,
                })

            result["external_domains"].extend(RE_EXTERNAL_DOMAINS.findall(content_sample))

            if RE_GRAPHQL.search(content_sample):
                result["graphql"] = True

            result["websockets"].extend(RE_WEBSOCKET.findall(content_sample))

        except Exception as e:
            logger.debug(f"JS analysis failed for {js_url}: {e}")

    await asyncio.gather(*[analyze_one(u) for u in resolved_urls])

    # Deduplicate flat lists
    result["endpoints"] = list(dict.fromkeys(result["endpoints"]))[:50]
    result["env_vars"] = list(dict.fromkeys(result["env_vars"]))
    result["external_domains"] = list(dict.fromkeys(result["external_domains"]))[:30]
    result["websockets"] = list(dict.fromkeys(result["websockets"]))

    return result


async def _pass4_tech_stack(html: str, headers: dict, js_content_combined: str) -> dict:
    """Tech stack detection via signature matching."""
    detected = []

    combined = html + js_content_combined
    raw_headers = headers.get("raw_headers", {})
    server = (raw_headers.get("server") or "").lower()
    powered_by = (raw_headers.get("x-powered-by") or "").lower()
    cookies = raw_headers.get("set-cookie", "").lower()

    checks = [
        ("React", ["__reactFiber", "react-dom", "data-reactroot"], "high"),
        ("Next.js", ["__NEXT_DATA__", "_next/static"], "high"),
        ("Vue.js", ["__vue_app__", "data-v-", "vue.runtime"], "high"),
        ("Angular", ["ng-version", "angular.min.js", "ng-app"], "high"),
        ("Svelte", ["__svelte", "svelte/"], "high"),
        ("jQuery", ["jquery.min.js", "jquery-", "/jquery/"], "medium"),
        ("WordPress", ["wp-content", "wp-includes"], "high"),
        ("Drupal", ["Drupal.settings", "/sites/default/files"], "high"),
    ]

    for name, patterns, confidence in checks:
        evidence = [p for p in patterns if p in combined]
        if evidence:
            detected.append({"name": name, "confidence": confidence, "evidence": evidence[:3]})

    if "laravel_session" in cookies:
        detected.append({"name": "Laravel", "confidence": "high", "evidence": ["laravel_session cookie"]})
    if "csrfmiddlewaretoken" in html:
        detected.append({"name": "Django", "confidence": "high", "evidence": ["csrfmiddlewaretoken"]})
    if "express" in powered_by:
        detected.append({"name": "Express.js", "confidence": "high", "evidence": [f"X-Powered-By: {powered_by}"]})
    if "nginx" in server:
        detected.append({"name": "Nginx", "confidence": "high", "evidence": [f"Server: {server}"]})
    if "apache" in server:
        detected.append({"name": "Apache", "confidence": "high", "evidence": [f"Server: {server}"]})

    return {"detected_stack": detected}


async def _pass5_dns(domain: str, client: httpx.AsyncClient) -> dict:
    """Passive DNS intelligence via DNS-over-HTTPS."""
    a_task = _doh_query(domain, "A", client)
    mx_task = _doh_query(domain, "MX", client)
    txt_task = _doh_query(domain, "TXT", client)
    cname_task = _doh_query(domain, "CNAME", client)

    a_records, mx_records, txt_records, cname_records = await asyncio.gather(
        a_task, mx_task, txt_task, cname_task
    )

    # Infer hosting from CNAME
    inferred_hosting = ""
    cname_str = " ".join(cname_records).lower()
    if "vercel" in cname_str:
        inferred_hosting = "Vercel"
    elif "netlify" in cname_str:
        inferred_hosting = "Netlify"
    elif "cloudfront" in cname_str:
        inferred_hosting = "AWS CloudFront"
    elif "azurewebsites" in cname_str or "azure" in cname_str:
        inferred_hosting = "Azure"
    elif "github.io" in cname_str:
        inferred_hosting = "GitHub Pages"
    elif "heroku" in cname_str:
        inferred_hosting = "Heroku"
    elif "fastly" in cname_str:
        inferred_hosting = "Fastly"
    elif "cloudflare" in cname_str:
        inferred_hosting = "Cloudflare"

    return {
        "a_records": a_records,
        "mx_records": mx_records,
        "txt_records": txt_records,
        "cname": cname_records,
        "inferred_hosting": inferred_hosting,
    }


def _build_risk_flags(headers: dict, js: dict, html_surface: dict) -> list:
    flags = []

    raw_headers = headers.get("raw_headers", {})

    if js.get("source_map_leaks"):
        for sm in js.get("source_maps", []):
            if sm["exposure"] == "full_source":
                flags.append({
                    "severity": "HIGH",
                    "type": "source_map_full_source",
                    "detail": f"Full source code exposed via source map ({sm['file_count']} files): {sm['map_url']}"
                })
            else:
                flags.append({
                    "severity": "MEDIUM",
                    "type": "source_map_paths_only",
                    "detail": f"Internal file paths exposed via source map ({sm['file_count']} files): {sm['map_url']}"
                })
        # Flag any leaks we detected but couldn't parse
        parsed_urls = {sm["map_url"] for sm in js.get("source_maps", [])}
        for leak_url in js.get("source_map_leaks", []):
            if leak_url not in parsed_urls:
                flags.append({
                    "severity": "HIGH",
                    "type": "source_map_leak",
                    "detail": f"Source map exposed (parse failed): {leak_url}"
                })

    if js.get("secret_patterns"):
        for s in js["secret_patterns"]:
            flags.append({"severity": "HIGH", "type": "secret_in_js", "detail": s["pattern"][:60]})

    csp = headers.get("csp_parsed")
    if not csp:
        flags.append({"severity": "MEDIUM", "type": "missing_csp", "detail": "No Content-Security-Policy header"})
    elif csp and "unsafe-inline" in csp.get("flags", []):
        flags.append({"severity": "MEDIUM", "type": "unsafe_csp", "detail": "CSP allows 'unsafe-inline'"})
    elif csp and "unsafe-eval" in csp.get("flags", []):
        flags.append({"severity": "MEDIUM", "type": "unsafe_csp", "detail": "CSP allows 'unsafe-eval'"})

    if not raw_headers.get("x-frame-options") and not raw_headers.get("content-security-policy"):
        flags.append({"severity": "LOW", "type": "missing_xframe", "detail": "No X-Frame-Options header"})

    if not raw_headers.get("x-content-type-options"):
        flags.append({"severity": "LOW", "type": "missing_xcto", "detail": "No X-Content-Type-Options header"})

    cors = headers.get("cors")
    if cors and cors.get("allow_origin") == "*":
        flags.append({"severity": "MEDIUM", "type": "wildcard_cors", "detail": "CORS allows all origins (*)"})

    if js.get("env_vars"):
        flags.append({"severity": "LOW", "type": "env_vars_in_js",
                       "detail": f"process.env references found: {', '.join(js['env_vars'][:5])}"})

    if not raw_headers.get("strict-transport-security"):
        flags.append({"severity": "LOW", "type": "missing_hsts", "detail": "No Strict-Transport-Security header"})

    return flags


async def analyze_target(url: str) -> dict:
    """
    Main analysis entry point. Runs all 5 passes and returns structured result.
    """
    parsed = urlparse(url)
    domain = parsed.hostname or ""
    scanned_at = int(time.time())

    # Build proxy config — only set if TOR_PROXY env var is present
    # Tor adds ~2s latency per request; timeouts are increased accordingly
    proxy_kwargs = {}
    if _TOR_PROXY:
        proxy_kwargs["proxy"] = _TOR_PROXY
        logger.info(f"Scan routing through Tor: {url}")

    async with httpx.AsyncClient(
        headers={"User-Agent": BROWSER_UA},
        follow_redirects=True,
        max_redirects=3,
        timeout=30.0 if _TOR_PROXY else 12.0,  # Tor is slower
        verify=True,
        **proxy_kwargs,
    ) as client:
        # Passes 1 and 2 must run first (sequential — 2 depends on 1's HTML)
        headers_result, html, status_code = await _pass1_headers(url, client)
        html_surface = await _pass2_html(html)

        # Passes 3, 4, 5 can run in parallel
        js_task = _pass3_js(html_surface.get("scripts", []), url, client)
        tech_task = _pass4_tech_stack(html, headers_result, "")
        dns_task = _pass5_dns(domain, client)

        js_analysis, tech_stack, dns_intel = await asyncio.gather(js_task, tech_task, dns_task)

    risk_flags = _build_risk_flags(headers_result, js_analysis, html_surface)

    return {
        "url": url,
        "domain": domain,
        "status_code": status_code,
        "scanned_at": scanned_at,
        "headers": headers_result,
        "html_surface": html_surface,
        "js_analysis": js_analysis,
        "tech_stack": tech_stack,
        "dns_intel": dns_intel,
        "risk_flags": risk_flags,
    }