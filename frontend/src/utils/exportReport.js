/**
 * exportReport.js
 * Browser-side export utilities that mirror the output of test-live-scan.sh
 *
 * Three formats:
 *  1. JSON   — raw scan result (same as: curl … | python3 -m json.tool)
 *  2. TXT    — terminal-style text matching test-live-scan.sh pretty-print
 *  3. MD     — GitHub-flavoured markdown version for sharing
 */

/* ── helpers ─────────────────────────────────────────────────── */
function download(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

function safeSlug(str) {
    return (str || 'scan').replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40)
}

function ts(result) {
    return new Date(result.scanned_at * 1000).toISOString().replace('T', '_').slice(0, 19).replace(/:/g, '-')
}

const SECURITY_HEADERS = [
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'strict-transport-security',
    'referrer-policy',
]

/* ═══════════════════════════════════════════════════════════════
   FORMAT 1 — RAW JSON (identical to full API response)
═══════════════════════════════════════════════════════════════ */
export function exportJSON(result) {
    const filename = `sitescope_${safeSlug(result.domain)}_${ts(result)}.json`
    download(filename, JSON.stringify(result, null, 2), 'application/json')
}

/* ═══════════════════════════════════════════════════════════════
   FORMAT 2 — PLAIN TEXT (mirrors test-live-scan.sh output exactly)
═══════════════════════════════════════════════════════════════ */
export function exportTXT(result) {
    const r = result
    const h = r.headers || {}
    const raw = h.raw_headers || {}
    const js = r.js_analysis || {}
    const dns = r.dns_intel || {}
    const stack = r.tech_stack?.detected_stack || []
    const flags = [...(r.risk_flags || [])].sort((a, b) =>
        ['HIGH', 'MEDIUM', 'LOW'].indexOf(a.severity) - ['HIGH', 'MEDIUM', 'LOW'].indexOf(b.severity)
    )

    const lines = []
    const sep = '━'.repeat(48)
    const line = (s = '') => lines.push(s)

    line('SiteScope — Passive Recon Report')
    line(`Generated: ${new Date(r.scanned_at * 1000).toLocaleString()}`)
    line(`Target:    ${r.url}`)
    line()

    // ── OVERVIEW ──────────────────────────────────────────────
    line(sep)
    line('OVERVIEW')
    line(sep)
    line(`  Domain:     ${r.domain || '—'}`)
    line(`  Status:     ${r.status_code || '—'}`)
    line(`  Server:     ${h.server || '—'}`)
    line(`  CDN:        ${h.cdn || '—'}`)
    line(`  Powered by: ${h.powered_by || '—'}`)
    line()

    // ── TECH STACK ────────────────────────────────────────────
    if (stack.length) {
        line(sep)
        line('TECH STACK')
        line(sep)
        for (const item of stack) {
            line(`  ${item.name} (${item.confidence}) — evidence: ${item.evidence?.join(', ')}`)
        }
        line()
    }

    // ── JS ANALYSIS ───────────────────────────────────────────
    line(sep)
    line('JS ANALYSIS')
    line(sep)
    line(`  Scripts analyzed:    ${r.html_surface?.scripts?.length || 0}`)
    line(`  API endpoints found: ${js.endpoints?.length || 0}`)
    line(`  Source map leaks:    ${js.source_map_leaks?.length || 0}`)
    line(`  Source maps parsed:  ${js.source_maps?.length || 0}`)
    line(`  Env var refs:        ${js.env_vars?.length || 0}`)
    line(`  Secret patterns:     ${js.secret_patterns?.length || 0}`)
    line(`  GraphQL detected:    ${js.graphql ? 'yes' : 'no'}`)
    line(`  WebSocket endpoints: ${js.websockets?.length || 0}`)

    if (js.endpoints?.length) {
        line()
        line('  API Endpoints:')
        for (const ep of js.endpoints.slice(0, 20)) line(`    ${ep}`)
        if (js.endpoints.length > 20) line(`    … and ${js.endpoints.length - 20} more`)
    }
    if (js.source_map_leaks?.length) {
        line()
        line('  Source Map URLs:')
        for (const url of js.source_map_leaks) line(`    ${url}`)
    }
    if (js.source_maps?.length) {
        line()
        line('  Parsed Source Maps:')
        for (const sm of js.source_maps) {
            line(`    [${sm.exposure === 'full_source' ? 'FULL SOURCE' : 'PATHS ONLY'}] ${sm.map_url}`)
            line(`      ${sm.file_count} files recovered, source map v${sm.version}`)
            if (sm.files?.length) {
                line(`      File tree (first 10):`)
                for (const f of sm.files.slice(0, 10)) line(`        ${f.path}`)
                if (sm.files.length > 10) line(`        … and ${sm.files.length - 10} more`)
            }
        }
    }
    if (js.env_vars?.length) {
        line()
        line(`  process.env refs: ${js.env_vars.slice(0, 10).join(', ')}`)
    }
    if (js.secret_patterns?.length) {
        line()
        line('  Secret patterns found:')
        for (const s of js.secret_patterns.slice(0, 10)) {
            line(`    [${s.source?.split('/').pop()}] ${s.pattern.slice(0, 80)}`)
        }
    }
    line()

    // ── DNS INTEL ─────────────────────────────────────────────
    line(sep)
    line('DNS INTEL')
    line(sep)
    line(`  A records:  ${(dns.a_records || []).join(', ') || '—'}`)
    line(`  MX records: ${(dns.mx_records || []).join(', ') || '—'}`)
    if (dns.cname?.length) line(`  CNAME:      ${dns.cname.join(', ')}`)
    if (dns.inferred_hosting) line(`  Hosting:    ${dns.inferred_hosting}`)
    if (dns.txt_records?.length) {
        line(`  TXT records (${dns.txt_records.length}):`)
        for (const t of dns.txt_records.slice(0, 5)) line(`    ${t.slice(0, 100)}`)
    }
    line()

    // ── RISK FLAGS ────────────────────────────────────────────
    line(sep)
    line(`RISK FLAGS (${flags.length})`)
    line(sep)
    if (!flags.length) {
        line('  ✓ No risk flags identified')
    } else {
        for (const f of flags) {
            const badge = f.severity === 'HIGH' ? '[HIGH]  ' : f.severity === 'MEDIUM' ? '[MED]   ' : '[LOW]   '
            line(`  ${badge} ${f.type}: ${f.detail}`)
        }
    }
    line()

    // ── SECURITY HEADERS ──────────────────────────────────────
    line(sep)
    line('SECURITY HEADERS')
    line(sep)
    for (const sh of SECURITY_HEADERS) {
        const present = !!raw[sh]
        line(`  ${present ? '✓' : '✗'} ${sh}`)
    }
    line()

    // ── RAW CURL HINT (mirrors script footer) ─────────────────
    line(sep)
    line('RAW JSON EXPORT')
    line(sep)
    line(`  This report was generated by SiteScope.`)
    line(`  Scan ID: ${r.scan_id || '(see JSON export)'}`)
    line(`  Scanned: ${new Date(r.scanned_at * 1000).toUTCString()}`)

    const filename = `sitescope_${safeSlug(r.domain)}_${ts(r)}.txt`
    download(filename, lines.join('\n'))
}

/* ═══════════════════════════════════════════════════════════════
   FORMAT 3 — MARKDOWN (GitHub-flavoured, shareable)
═══════════════════════════════════════════════════════════════ */
export function exportMarkdown(result) {
    const r = result
    const h = r.headers || {}
    const raw = h.raw_headers || {}
    const js = r.js_analysis || {}
    const dns = r.dns_intel || {}
    const stack = r.tech_stack?.detected_stack || []
    const flags = [...(r.risk_flags || [])].sort((a, b) =>
        ['HIGH', 'MEDIUM', 'LOW'].indexOf(a.severity) - ['HIGH', 'MEDIUM', 'LOW'].indexOf(b.severity)
    )

    const lines = []
    const line = (s = '') => lines.push(s)

    line(`# SiteScope Report — \`${r.domain}\``)
    line()
    line(`| Field | Value |`)
    line(`|---|---|`)
    line(`| **Target** | \`${r.url}\` |`)
    line(`| **Scanned** | ${new Date(r.scanned_at * 1000).toLocaleString()} |`)
    line(`| **HTTP Status** | ${r.status_code || '—'} |`)
    line(`| **Server** | ${h.server || '—'} |`)
    line(`| **CDN** | ${h.cdn || dns.inferred_hosting || '—'} |`)
    line(`| **Powered By** | ${h.powered_by || '—'} |`)
    line()

    // Risk summary banner
    const highCount = flags.filter(f => f.severity === 'HIGH').length
    const medCount = flags.filter(f => f.severity === 'MEDIUM').length
    if (highCount) {
        line(`> [!WARNING]`)
        line(`> **${highCount} HIGH severity** and **${medCount} MEDIUM severity** risk flags found.`)
        line()
    }

    // Tech stack
    if (stack.length) {
        line('## Tech Stack')
        line()
        line('| Technology | Confidence | Evidence |')
        line('|---|---|---|')
        for (const item of stack) {
            line(`| ${item.name} | ${item.confidence} | \`${item.evidence?.join(', ')}\` |`)
        }
        line()
    }

    // Risk flags
    line('## Risk Flags')
    line()
    if (!flags.length) {
        line('✅ No risk flags identified.')
    } else {
        line('| Severity | Type | Detail |')
        line('|---|---|---|')
        for (const f of flags) {
            const emoji = f.severity === 'HIGH' ? '🔴' : f.severity === 'MEDIUM' ? '🟡' : '🔵'
            line(`| ${emoji} **${f.severity}** | \`${f.type}\` | ${f.detail} |`)
        }
    }
    line()

    // Security headers
    line('## Security Headers')
    line()
    line('| Header | Status |')
    line('|---|---|')
    for (const sh of SECURITY_HEADERS) {
        line(`| \`${sh}\` | ${raw[sh] ? '✅ Present' : '❌ Missing'} |`)
    }
    line()

    // JS Analysis
    line('## JS Analysis')
    line()
    line('| Finding | Count |')
    line('|---|---|')
    const scriptCount = r.html_surface?.scripts?.length || 0
    line(`| Scripts analyzed | ${scriptCount} |`)
    line(`| API endpoints | ${js.endpoints?.length || 0} |`)
    line(`| Source map leaks | ${js.source_map_leaks?.length || 0} |`)
    line(`| Parsed source maps | ${js.source_maps?.length || 0} |`)
    line(`| process.env references | ${js.env_vars?.length || 0} |`)
    line(`| Potential secrets | ${js.secret_patterns?.length || 0} |`)
    line(`| GraphQL | ${js.graphql ? 'Yes' : 'No'} |`)
    line(`| WebSocket endpoints | ${js.websockets?.length || 0} |`)

    if (js.endpoints?.length) {
        line()
        line('### API Endpoints')
        line('```')
        for (const ep of js.endpoints.slice(0, 20)) line(ep)
        if (js.endpoints.length > 20) line(`… and ${js.endpoints.length - 20} more`)
        line('```')
    }

    if (js.source_maps?.length) {
        line()
        line('### Source Maps Recovered')
        for (const sm of js.source_maps) {
            line()
            line(`**\`${sm.map_url}\`**`)
            line()
            line(`- Exposure: **${sm.exposure === 'full_source' ? '🔴 FULL SOURCE — pre-minification code exposed' : '🟡 PATHS ONLY — file structure exposed'}**`)
            line(`- Files recovered: ${sm.file_count}`)
            if (sm.files?.length) {
                line()
                line('```')
                for (const f of sm.files.slice(0, 20)) line(f.path)
                if (sm.files.length > 20) line(`… and ${sm.files.length - 20} more`)
                line('```')
            }
        }
    }

    if (js.secret_patterns?.length) {
        line()
        line('### ⚠ Potential Secrets in JS')
        line('```')
        for (const s of js.secret_patterns.slice(0, 10)) {
            line(`[${s.source?.split('/').pop()}] ${s.pattern.slice(0, 80)}`)
        }
        line('```')
    }

    // DNS
    line()
    line('## DNS Intel')
    line()
    if (dns.inferred_hosting) line(`**Inferred Hosting:** ${dns.inferred_hosting}`)
    line()
    if (dns.a_records?.length) { line('**A Records:**'); line('```'); for (const r of dns.a_records) line(r); line('```') }
    if (dns.mx_records?.length) { line('**MX Records:**'); line('```'); for (const r of dns.mx_records) line(r); line('```') }
    if (dns.cname?.length) { line('**CNAME:**'); line('```'); for (const r of dns.cname) line(r); line('```') }
    if (dns.txt_records?.length) {
        line(`**TXT Records (${dns.txt_records.length}):**`)
        line('```')
        for (const t of dns.txt_records.slice(0, 5)) line(t.slice(0, 120))
        if (dns.txt_records.length > 5) line(`… and ${dns.txt_records.length - 5} more`)
        line('```')
    }

    line()
    line('---')
    line(`*Generated by [SiteScope](https://github.com/sitescope/sitescope) — passive recon only.*`)

    const filename = `sitescope_${safeSlug(r.domain)}_${ts(r)}.md`
    download(filename, lines.join('\n'), 'text/markdown')
}
