#!/usr/bin/env bash
# =============================================================================
# SiteScope — Local Dev Setup & Smoke Test
# Tested on: Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, Debian 12
# Requirements: Python 3.11+, Node 20+
# Usage: bash setup-local.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; AMBER='\033[0;33m'; RED='\033[0;31m'; DIM='\033[0;37m'; NC='\033[0m'

log()  { echo -e "${GREEN}▶${NC} $*"; }
warn() { echo -e "${AMBER}⚠${NC}  $*"; }
fail() { echo -e "${RED}✗  FATAL:${NC} $*"; echo ""; exit 1; }
step() { echo -e "\n${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${GREEN}[$1]${NC} $2"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
DATA_DIR="$SCRIPT_DIR/data"
VENV_DIR="$BACKEND_DIR/.venv"

# =============================================================================
step "1/6" "Checking prerequisites"
# =============================================================================

# Find Python 3.11+
PYTHON=""
for cmd in python3.13 python3.12 python3.11; do
    if command -v "$cmd" &>/dev/null; then
        if $cmd -c "import sys; assert sys.version_info >= (3,11)" 2>/dev/null; then
            PYTHON="$cmd"; ok "Python: $($cmd --version)"; break
        fi
    fi
done
if [[ -z "$PYTHON" ]] && command -v python3 &>/dev/null; then
    if python3 -c "import sys; assert sys.version_info >= (3,11)" 2>/dev/null; then
        PYTHON="python3"; ok "Python: $(python3 --version)"
    fi
fi
[[ -z "$PYTHON" ]] && fail "Python 3.11+ required.\n  Ubuntu: sudo apt update && sudo apt install -y python3.11 python3.11-venv\n  Or: sudo add-apt-repository ppa:deadsnakes/ppa && sudo apt install -y python3.11 python3.11-venv"

# Check venv module
PYVER=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
$PYTHON -c "import venv" 2>/dev/null || fail "python${PYVER}-venv not installed.\n  Fix: sudo apt install -y python${PYVER}-venv"
ok "python${PYVER}-venv: available"

# Node.js 18+
command -v node &>/dev/null || fail "Node.js not found.\n  Install: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
NODE_MAJOR=$(node -e "console.log(parseInt(process.version.slice(1)))")
[[ "$NODE_MAJOR" -lt 18 ]] && fail "Node.js $NODE_MAJOR found, need 18+.\n  Upgrade: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
ok "Node.js: $(node --version)"

command -v npm &>/dev/null || fail "npm not found (should come with Node.js)"
ok "npm: $(npm --version)"
command -v curl &>/dev/null || fail "curl required: sudo apt install -y curl"
ok "curl: available"

# Port killer — fuser (psmisc) preferred, ss fallback. lsof NOT required.
kill_port() {
    local port="$1"
    if command -v fuser &>/dev/null; then
        fuser -k "${port}/tcp" 2>/dev/null && warn "Killed existing process on :${port}" || true
    elif command -v ss &>/dev/null; then
        local pids
        pids=$(ss -tlnp "sport = :${port}" 2>/dev/null \
            | awk 'NR>1 { match($6, /pid=([0-9]+)/, a); if (a[1]) print a[1] }' | sort -u)
        for pid in $pids; do
            kill -9 "$pid" 2>/dev/null && warn "Killed PID $pid on :${port}" || true
        done
    else
        warn "Could not auto-kill port ${port}. Install psmisc: sudo apt install -y psmisc"
    fi
}

# =============================================================================
step "2/6" "Creating Python virtual environment"
# =============================================================================

if [[ ! -d "$VENV_DIR" ]]; then
    log "Creating venv with $PYTHON at $VENV_DIR"
    $PYTHON -m venv "$VENV_DIR"
    ok "venv created"
else
    ok "venv exists — reusing (rm -rf $VENV_DIR to recreate)"
fi

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"
ok "Activated: $(which python) ($(python --version))"

# Ubuntu ships old pip in venvs — upgrade first
python -m pip install --upgrade pip -q
ok "pip upgraded: $(pip --version | awk '{print $2}')"

# =============================================================================
step "3/6" "Installing backend dependencies"
# =============================================================================

log "Installing from requirements.txt (~30s first time)..."

# lxml ships manylinux wheels — no apt build deps needed for modern pip
# If build IS required (very old distro), we print a helpful message
pip install -r "$BACKEND_DIR/requirements.txt" -q 2>&1 | grep -E "^(ERROR|error)" || true

# Verify every critical import works at runtime
python -c "
mods = ['fastapi', 'uvicorn', 'httpx', 'aiosqlite', 'bs4', 'pydantic', 'dns.resolver', 'lxml']
failed = []
for m in mods:
    try: __import__(m)
    except ImportError as e: failed.append(str(e))
if failed:
    print('IMPORT ERRORS:')
    for f in failed: print(f'  {f}')
    print()
    print('If lxml failed to build from source, try:')
    print('  sudo apt install -y libxml2-dev libxslt1-dev python3-dev')
    exit(1)
print('  All backend imports OK')
"

# =============================================================================
step "4/6" "Installing frontend dependencies"
# =============================================================================

cd "$FRONTEND_DIR"
if [[ -f "package-lock.json" ]]; then
    log "Lockfile found — running npm ci"
    npm ci --silent
else
    log "No lockfile — running npm install (will generate package-lock.json)"
    npm install --silent
    ok "package-lock.json created — commit this file to version control"
fi
ok "Frontend: $(ls node_modules | wc -l | tr -d ' ') packages installed"
cd "$SCRIPT_DIR"

# =============================================================================
step "5/6" "Starting services"
# =============================================================================

mkdir -p "$DATA_DIR"
# Truncate old logs so tail -f is clean
> "$DATA_DIR/backend.log"
> "$DATA_DIR/frontend.log"

log "Freeing ports 8000 and 5173..."
kill_port 8000; kill_port 5173; sleep 1

# --- Backend (rate limits set high for dev) ---
log "Starting FastAPI backend..."
(
    cd "$BACKEND_DIR"
    DB_PATH="$DATA_DIR/sitescope.db" \
    CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173" \
    RATE_LIMIT_MAX="50" \
    RATE_LIMIT_WINDOW="60" \
    IP_RATE_LIMIT_MAX="100" \
    SSRF_DEV_ALLOWLIST="localhost,127.0.0.1" \
        "$VENV_DIR/bin/uvicorn" app.main:app \
        --host 127.0.0.1 \
        --port 8000 \
        --workers 1 \
        --log-level info \
        >> "$DATA_DIR/backend.log" 2>&1
) &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$DATA_DIR/backend.pid"

# --- Frontend ---
log "Starting Vite dev server..."
(
    cd "$FRONTEND_DIR"
    npm run dev -- --host 127.0.0.1 >> "$DATA_DIR/frontend.log" 2>&1
) &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$DATA_DIR/frontend.pid"

# Wait for backend with crash detection
log "Waiting for backend..."
MAX_WAIT=30; WAITED=0
until curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1; do
    sleep 1; WAITED=$((WAITED+1)); printf "."
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo -e "\n\n${RED}Backend process crashed. Log output:${NC}"
        cat "$DATA_DIR/backend.log"
        fail "Backend died on startup. See log above."
    fi
    [[ $WAITED -ge $MAX_WAIT ]] && { echo ""; fail "Backend not ready after ${MAX_WAIT}s.\n  Log: cat $DATA_DIR/backend.log"; }
done
echo ""; ok "Backend ready in ${WAITED}s"

log "Waiting for Vite..."
WAITED=0
until curl -sf http://127.0.0.1:5173 >/dev/null 2>&1; do
    sleep 1; WAITED=$((WAITED+1)); printf "."
    [[ $WAITED -ge 25 ]] && { echo ""; warn "Vite slow — check: cat $DATA_DIR/frontend.log"; break; }
done
[[ $WAITED -lt 25 ]] && { echo ""; ok "Frontend ready in ${WAITED}s"; }

# =============================================================================
step "6/6" "Smoke tests (13 checks)"
# =============================================================================

FAKE_SID=$(python -c "import hashlib,os; print(hashlib.sha256(os.urandom(32)).hexdigest())")
echo -e "  ${DIM}SID: ${FAKE_SID:0:16}...${NC}\n"

PASS=0; FAIL=0
run_test() {
    local name="$1" cmd="$2" expect="$3"
    local result
    result=$(eval "$cmd" 2>/dev/null || echo "__CURL_FAILED__")
    if echo "$result" | grep -q "$expect"; then
        echo -e "  ${GREEN}✓${NC} $name"; PASS=$((PASS+1))
    else
        echo -e "  ${RED}✗${NC} $name"
        echo -e "      expected to contain: ${DIM}$expect${NC}"
        echo -e "      got: ${DIM}$(echo "$result" | head -c 200)${NC}"
        FAIL=$((FAIL+1))
    fi
}

H="X-Shadow-ID: $FAKE_SID"
B="Content-Type: application/json"

run_test "T01 /health returns ok"                   "curl -sf http://127.0.0.1:8000/health" '"ok"'
run_test "T02 /session/stats with valid SID"        "curl -sf http://127.0.0.1:8000/api/v1/session/stats -H '$H'" 'scan_count'
run_test "T03 /session/stats no SID → 422"          "curl -s -o/dev/null -w '%{http_code}' http://127.0.0.1:8000/api/v1/session/stats" "422"
run_test "T04 SSRF: 192.168.x.x blocked"            "curl -s -XPOST http://127.0.0.1:8000/api/v1/analyze/start -H '$B' -H '$H' -d '{\"url\":\"http://192.168.1.1\"}'" "rejected"
run_test "T05 SSRF: 127.0.0.1 allowed (dev allowlist active)" "curl -s -XPOST http://127.0.0.1:8000/api/v1/analyze/start -H '$B' -H '$H' -d '{\"url\":\"http://127.0.0.1:9999\"}'" "scan_id"
run_test "T06 SSRF: 10.0.0.1 blocked"               "curl -s -XPOST http://127.0.0.1:8000/api/v1/analyze/start -H '$B' -H '$H' -d '{\"url\":\"http://10.0.0.1\"}'" "rejected"
run_test "T07 Bad scheme ftp:// → 4xx"              "curl -s -o/dev/null -w '%{http_code}' -XPOST http://127.0.0.1:8000/api/v1/analyze/start -H '$B' -H '$H' -d '{\"url\":\"ftp://example.com\"}'" "4"
run_test "T08 No SID on analyze → 400"              "curl -s -o/dev/null -w '%{http_code}' -XPOST http://127.0.0.1:8000/api/v1/analyze/start -H '$B' -d '{\"url\":\"https://example.com\"}'" "4"
run_test "T09 Non-UUID scan_id → 400"               "curl -s -o/dev/null -w '%{http_code}' http://127.0.0.1:8000/api/v1/analyze/not-a-uuid -H '$H'" "400"
run_test "T10 /analyze/history returns scans array" "curl -sf http://127.0.0.1:8000/api/v1/analyze/history -H '$H'" '"scans"'
run_test "T11 Security header: x-content-type-options" "curl -s http://127.0.0.1:8000/health -D -" "x-content-type-options"
run_test "T12 Security header: x-frame-options"     "curl -s http://127.0.0.1:8000/health -D -" "x-frame-options"
LONG_URL="https://example.com/$(python -c "print('a'*2100)")"
run_test "T13 URL > 2048 chars → 422"               "curl -s -o/dev/null -w '%{http_code}' -XPOST http://127.0.0.1:8000/api/v1/analyze/start -H '$B' -H '$H' -d '{\"url\":\"$LONG_URL\"}'" "422"

# =============================================================================
echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
TOTAL=$((PASS+FAIL))
echo -e "Results: ${GREEN}${PASS}/${TOTAL} passed${NC}  ${RED}${FAIL} failed${NC}"
echo ""

if [[ $FAIL -eq 0 ]]; then
    echo -e "${GREEN}✓ SiteScope is running and all checks pass.${NC}"
    echo ""
    echo -e "  Open:      http://localhost:5173"
    echo -e "  API docs:  http://localhost:8000/api/docs"
    echo ""
    echo -e "  Live scan test:  bash test-live-scan.sh https://example.com"
    echo -e "  Tail logs:       tail -f $DATA_DIR/backend.log"
    echo -e "  Stop services:   bash stop-local.sh"
else
    echo -e "${RED}${FAIL} check(s) failed.${NC} Services still running — debug with:"
    echo -e "  cat $DATA_DIR/backend.log"
    echo -e "  See TROUBLESHOOTING.md"
    exit 1
fi