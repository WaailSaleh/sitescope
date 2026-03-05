# SiteScope — Troubleshooting (Ubuntu/Debian)

## Quick debug commands
```bash
cat data/backend.log      # backend startup errors
cat data/frontend.log     # vite errors
curl http://localhost:8000/health  # is backend alive?
```

---

## Backend won't start

### `ModuleNotFoundError: No module named 'fastapi'`
The venv isn't activated or deps not installed:
```bash
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
```

### `python3.11-venv` missing
```bash
sudo apt install -y python3.11-venv
# Or for 3.12:
sudo apt install -y python3.12-venv
```
Then delete the broken venv and retry:
```bash
rm -rf backend/.venv && bash setup-local.sh
```

### `lxml` fails to install (build from source)
Only happens on very old distros or if pip can't find a wheel:
```bash
sudo apt install -y libxml2-dev libxslt1-dev python3-dev
pip install lxml
```

### `Address already in use :8000`
```bash
# fuser (from psmisc package):
sudo apt install -y psmisc
fuser -k 8000/tcp

# or with ss (always available):
ss -tlnp sport = :8000   # find the PID
kill -9 <PID>
```

### Backend crashes immediately — `sqlite3.OperationalError`
```bash
mkdir -p data   # ensure data/ directory exists
```

---

## Frontend won't start

### `npm: command not found`
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # should be v20.x
```

### `Cannot find module` / missing packages
```bash
cd frontend && rm -rf node_modules && npm install
```

### Port 5173 already in use
```bash
fuser -k 5173/tcp    # requires psmisc
# or:
kill $(ss -tlnp 'sport = :5173' | awk 'NR>1 {match($6,/pid=([0-9]+)/,a); print a[1]}')
```

---

## Scan never completes / stuck on pending

1. Check the target is publicly reachable from your machine:
   ```bash
   curl -I https://example.com
   ```
2. Check DNS resolves:
   ```bash
   dig example.com
   ```
3. Watch the backend log in real time:
   ```bash
   tail -f data/backend.log
   ```
4. If behind a corporate proxy, httpx needs `HTTP_PROXY`/`HTTPS_PROXY` env vars set.

---

## SSRF test failures (T04–T06)

These tests fire requests at private IPs and expect a `rejected` response. If they fail:
- The SSRF check runs DNS resolution — if `dnspython` isn't installed, it fails open
- Verify: `python -c "import dns.resolver; print('ok')"`
- Fix: `pip install dnspython` (inside the venv)

---

## Rate limit hit during smoke tests

`setup-local.sh` sets `RATE_LIMIT_MAX=50` so tests don't self-throttle. If you ran the backend manually with the default of 10 and hit a 429:
```bash
# Restart backend with higher dev limits:
bash stop-local.sh && bash setup-local.sh
```

---

## SQLite `database is locked`

Only happens with multiple uvicorn workers sharing one SQLite file. The setup script always runs `--workers 1`. Do not increase this unless you migrate to PostgreSQL.

---

## Full reset

```bash
bash stop-local.sh
rm -rf backend/.venv data/
bash setup-local.sh
```
