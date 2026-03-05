#!/usr/bin/env bash
# =============================================================================
# SiteScope — Live Scan Test
# Fires a real scan at a safe public target and prints results
# Usage: bash test-live-scan.sh [URL]
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; AMBER='\033[0;33m'; RED='\033[0;31m'; DIM='\033[0;37m'; CYAN='\033[0;36m'; NC='\033[0m'

TARGET="${1:-https://example.com}"
BASE="http://127.0.0.1:8000"

echo -e "\n${GREEN}SiteScope Live Scan Test${NC}"
echo -e "${DIM}Target: $TARGET${NC}\n"

# Generate a test shadow ID
SID=$(python3 -c "import hashlib,os; print(hashlib.sha256(os.urandom(32)).hexdigest())")
echo -e "${DIM}Shadow ID: ${SID:0:16}...${NC}\n"

# Check backend is up
if ! curl -sf "$BASE/health" > /dev/null; then
    echo -e "${RED}✗ Backend not running. Run: bash setup-local.sh${NC}"
    exit 1
fi

# Start scan
echo -e "▶ Starting scan..."
RESPONSE=$(curl -sf -X POST "$BASE/api/v1/analyze/start" \
    -H "Content-Type: application/json" \
    -H "X-Shadow-ID: $SID" \
    -d "{\"url\": \"$TARGET\"}" 2>&1)

if echo "$RESPONSE" | grep -q "detail"; then
    echo -e "${RED}✗ Scan rejected:${NC} $RESPONSE"
    exit 1
fi

SCAN_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['scan_id'])")
echo -e "  ${GREEN}✓${NC} Scan started: ${DIM}$SCAN_ID${NC}"

# Poll until complete
echo -e "\n▶ Polling for completion..."
MAX_WAIT=60
WAITED=0
while true; do
    sleep 2
    WAITED=$((WAITED + 2))
    
    POLL=$(curl -sf "$BASE/api/v1/analyze/$SCAN_ID" \
        -H "X-Shadow-ID: $SID" 2>/dev/null || echo '{"status":"error"}')
    
    STATUS=$(echo "$POLL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
    
    printf "  [%ds] status: %s\n" "$WAITED" "$STATUS"
    
    if [[ "$STATUS" == "complete" ]]; then
        echo -e "\n  ${GREEN}✓ Scan complete in ${WAITED}s${NC}"
        
        # Pretty print results
        echo "$POLL" | python3 -c "
import sys, json

data = json.load(sys.stdin)
r = data.get('result', {})
if not r:
    print('  No result data')
    sys.exit(0)

GREEN = '\033[0;32m'
AMBER = '\033[0;33m'
RED   = '\033[0;31m'
DIM   = '\033[0;37m'
CYAN  = '\033[0;36m'
NC    = '\033[0m'

print(f'\n{CYAN}━━━ OVERVIEW ━━━{NC}')
print(f'  Domain:      {r.get(\"domain\", \"—\")}')
print(f'  Status:      {r.get(\"status_code\", \"—\")}')
h = r.get('headers', {})
print(f'  Server:      {h.get(\"server\") or \"—\"}')
print(f'  CDN:         {h.get(\"cdn\") or \"—\"}')
print(f'  Powered by:  {h.get(\"powered_by\") or \"—\"}')

stack = r.get('tech_stack', {}).get('detected_stack', [])
if stack:
    print(f'\n{CYAN}━━━ TECH STACK ━━━{NC}')
    for item in stack:
        print(f'  {item[\"name\"]} ({item[\"confidence\"]}) — {item[\"evidence\"]}')

js = r.get('js_analysis', {})
print(f'\n{CYAN}━━━ JS ANALYSIS ━━━{NC}')
print(f'  Scripts analyzed:    {len(r.get(\"html_surface\", {}).get(\"scripts\", []))}')
print(f'  API endpoints found: {len(js.get(\"endpoints\", []))}')
print(f'  Source map leaks:    {len(js.get(\"source_map_leaks\", []))}')
print(f'  Env var refs:        {len(js.get(\"env_vars\", []))}')
print(f'  Secret patterns:     {len(js.get(\"secret_patterns\", []))}')
print(f'  GraphQL detected:    {js.get(\"graphql\", False)}')

if js.get('endpoints'):
    print(f'  Endpoints:')
    for ep in js['endpoints'][:5]:
        print(f'    {DIM}{ep}{NC}')

dns = r.get('dns_intel', {})
print(f'\n{CYAN}━━━ DNS INTEL ━━━{NC}')
print(f'  A records:  {dns.get(\"a_records\", [])}')
print(f'  MX records: {dns.get(\"mx_records\", [])}')
if dns.get('cname'):
    print(f'  CNAME:      {dns[\"cname\"]}')
if dns.get('inferred_hosting'):
    print(f'  Hosting:    {AMBER}{dns[\"inferred_hosting\"]}{NC}')
if dns.get('txt_records'):
    print(f'  TXT ({len(dns[\"txt_records\"])} records):')
    for txt in dns['txt_records'][:3]:
        print(f'    {DIM}{txt[:80]}{NC}')

flags = r.get('risk_flags', [])
print(f'\n{CYAN}━━━ RISK FLAGS ({len(flags)}) ━━━{NC}')
if not flags:
    print(f'  {GREEN}✓ No risk flags{NC}')
else:
    for f in sorted(flags, key=lambda x: [\"HIGH\",\"MEDIUM\",\"LOW\"].index(x.get(\"severity\",\"LOW\")) if x.get(\"severity\") in [\"HIGH\",\"MEDIUM\",\"LOW\"] else 3):
        color = RED if f[\"severity\"]==\"HIGH\" else AMBER if f[\"severity\"]==\"MEDIUM\" else DIM
        print(f'  {color}[{f[\"severity\"]}]{NC} {f[\"type\"]}: {f[\"detail\"]}')

csp = h.get('csp_parsed')
print(f'\n{CYAN}━━━ SECURITY HEADERS ━━━{NC}')
raw = h.get('raw_headers', {})
sec_headers = [
    'content-security-policy', 'x-frame-options', 'x-content-type-options',
    'strict-transport-security', 'referrer-policy'
]
for sh in sec_headers:
    val = raw.get(sh)
    mark = f'{GREEN}✓{NC}' if val else f'{RED}✗{NC}'
    print(f'  {mark} {sh}')
"
        break
    elif [[ "$STATUS" == "error" ]]; then
        echo -e "\n  ${RED}✗ Scan failed${NC}"
        echo "$POLL" | python3 -m json.tool 2>/dev/null || echo "$POLL"
        exit 1
    elif [[ $WAITED -ge $MAX_WAIT ]]; then
        echo -e "\n  ${AMBER}⚠ Timed out after ${MAX_WAIT}s${NC}"
        exit 1
    fi
done

echo ""
echo -e "${DIM}Full JSON: curl -s $BASE/api/v1/analyze/$SCAN_ID -H 'X-Shadow-ID: $SID' | python3 -m json.tool${NC}"
