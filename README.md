# SiteScope

**Passive web reconnaissance terminal.** Analyzes public websites via read-only HTTP — mimics what a browser does when loading a page. No active scanning, no exploit probing, no port scanning.

---

## Architecture

```
sitescope/
  backend/          FastAPI + aiosqlite (Python 3.11)
    app/
      main.py       App init, middleware registration
      database.py   SQLite WAL-mode init + connection factory
      middleware/
        security.py SSRF guard, rate limiter, security headers
      routers/
        analyze.py  POST /analyze/start, GET /analyze/{id}, GET /analyze/history
        session.py  GET /session/stats
      services/
        analyzer.py 5-pass analysis engine
      models/
        schemas.py  Pydantic v2 request/response models
  frontend/         React + Vite + Tailwind CSS
    src/
      hooks/
        useShadowId.js  Web Crypto fingerprint → SHA-256 shadow ID
      services/
        api.js          Fetch wrapper with X-Shadow-ID injection
      components/
        ScanInput.jsx   URL input, validation, error states
        ScanResults.jsx 5-tab result viewer
        ScanLoader.jsx  Terminal progress animation
        ScanHistory.jsx Past scan browser
      App.jsx           Context provider, polling loop
  docker-compose.yml
  k8s/              Kubernetes manifests
```

---

## Quick Start (Local Dev)

```bash
# 1. Backend
cd backend
pip install -r requirements.txt
mkdir -p ../data
DB_PATH=../data/sitescope.db uvicorn app.main:app --reload --port 8000

# 2. Frontend (in another terminal)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Docker Compose

```bash
cp .env.example .env
docker-compose up --build
# → http://localhost:80
```

### Dev mode with Vite hot reload

```bash
docker-compose --profile dev up --build
```

---

## Kubernetes Deployment

```bash
# Create namespace
kubectl create namespace sitescope

# Apply manifests
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Update k8s/ingress.yaml with your real domain before applying
```

---

## Security Architecture

### SSRF Protection
Every user-submitted URL is validated before **any** HTTP request is made:
1. Scheme must be `http` or `https`
2. Hostname resolved via `dnspython` (fails closed on DNS error)
3. All resolved IPs checked against RFC 1918, loopback, link-local, CGNAT, AWS metadata, IPv6 private ranges
4. Direct IP submissions also blocked if private

### Shadow ID System
- No cookies, no login, no localStorage
- Browser fingerprint (UA + screen + timezone + canvas) → SHA-256 via Web Crypto API
- Sent as `X-Shadow-ID` header on every request
- Re-generated every page load (ephemeral by design)
- Backend validates as 64-char lowercase hex

### Rate Limiting
- Primary: per Shadow-ID, 10 requests / 60s window (configurable)
- Secondary: per IP (X-Forwarded-For first hop), 30 requests / 60s window
- Stored in SQLite `rate_limits` + `ip_rate_limits` tables
- Returns `429` with `Retry-After` header

### Security Response Headers (all responses)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-XSS-Protection: 1; mode=block
```

### SQL Injection Prevention
All database queries use parameterized statements (aiosqlite). No f-strings, no string interpolation in SQL. Verified at:
- `database.py` — table creation (static DDL only)
- `routers/analyze.py` — all 4 queries parameterized
- `routers/session.py` — all queries parameterized
- `middleware/security.py` — all rate limit queries parameterized

### Input Validation
- URL max 2048 chars (Pydantic + frontend)
- `scan_id` validated as UUID format regex before DB lookup
- `X-Shadow-ID` validated as `/^[0-9a-f]{64}$/` on every route
- JS regex patterns cap content at 500KB to prevent ReDoS on minified bundles

---

## Security Audit (Prompt 8) — Findings & Fixes

| # | Issue | Status | Fix |
|---|-------|--------|-----|
| 1 | SSRF | ✅ Fixed | DNS resolution before every request; fail-closed; private IP blocklist |
| 2 | SQL injection | ✅ Fixed | 100% parameterized queries; no string concat in SQL |
| 3 | Path traversal | ✅ N/A | No file read/write on user input |
| 4 | ReDoS | ✅ Fixed | Regex patterns simplified; JS content capped at 500KB |
| 5 | variable leakage | ✅ Fixed | No hardcoded credentials; env vars used; errors return generic messages |
| 6 | Error messages | ✅ Fixed | Global exception handler returns generic `{"detail": "An internal error occurred."}` |
| 7 | Rate limit bypass | ✅ Fixed | Secondary IP-based rate limit; X-Forwarded-For first-hop only |
| 8 | Missing sec headers | ✅ Fixed | All 6 headers on every response via SecurityHeadersMiddleware |
| 9 | URL length cap | ✅ Fixed | Pydantic validator + frontend maxLength=2048 |
| 10 | UUID validation | ✅ Fixed | `UUID_RE.match(scan_id)` before any DB lookup |

### Dependency Audit

**Python packages (no known critical CVEs as of early 2025):**
- `fastapi 0.111` — actively maintained
- `uvicorn 0.29` — actively maintained
- `httpx 0.27` — actively maintained
- `aiosqlite 0.20` — stable
- `beautifulsoup4 4.12` — stable
- `pydantic 2.7` — actively maintained
- `dnspython 2.6` — actively maintained

**npm packages:**
- `react 18.3` — current LTS
- `vite 5.2` — actively maintained
- `tailwindcss 3.4` — stable

---

## Analysis Passes

| Pass | What It Does | Parallelism |
|------|-------------|-------------|
| 1 — HTTP Headers | HEAD+GET, CDN detection, CSP parsing, CORS | Sequential (first) |
| 2 — HTML Surface | Scripts, forms, meta, framework hints | Sequential (needs Pass 1 HTML) |
| 3 — JS Bundle Analysis | API endpoints, secrets, source maps, env vars | Parallel with 4+5 |
| 4 — Tech Stack | Signature matching (React/Next/Vue/etc.) | Parallel with 3+5 |
| 5 — DNS Intel | DoH queries (A/MX/TXT/CNAME), hosting inference | Parallel with 3+4 |

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `/app/data/sitescope.db` | SQLite file path |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `RATE_LIMIT_MAX` | `10` | Max requests per shadow ID per window |
| `RATE_LIMIT_WINDOW` | `60` | Rate limit window in seconds |
| `IP_RATE_LIMIT_MAX` | `30` | Max requests per IP per window |
