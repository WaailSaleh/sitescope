#!/usr/bin/env bash
# SiteScope — Stop local dev services
set -euo pipefail

GREEN='\033[0;32m'; AMBER='\033[0;33m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"

kill_port() {
    local port="$1"
    if command -v fuser &>/dev/null; then
        fuser -k "${port}/tcp" 2>/dev/null || true
    elif command -v ss &>/dev/null; then
        ss -tlnp "sport = :${port}" 2>/dev/null \
            | awk 'NR>1 { match($6, /pid=([0-9]+)/, a); if (a[1]) print a[1] }' \
            | sort -u | xargs -r kill -9 2>/dev/null || true
    fi
}

stop_service() {
    local label="$1" pidfile="$2" port="$3"
    if [[ -f "$pidfile" ]]; then
        PID=$(cat "$pidfile")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID" 2>/dev/null
            echo -e "  ${GREEN}✓${NC} $label stopped (PID $PID)"
        else
            echo -e "  ${AMBER}⚠${NC}  $label was not running (PID $PID stale)"
        fi
        rm -f "$pidfile"
    else
        kill_port "$port"
        echo -e "  ${GREEN}✓${NC} $label: port $port cleared"
    fi
}

echo "Stopping SiteScope..."
stop_service "Backend  (:8000)" "$DATA_DIR/backend.pid"  8000
stop_service "Frontend (:5173)" "$DATA_DIR/frontend.pid" 5173
echo -e "\n${GREEN}Done.${NC}"
