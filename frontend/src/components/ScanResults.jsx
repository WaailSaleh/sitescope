import { useState } from 'react'

const TABS = ['OVERVIEW', 'JS ANALYSIS', 'HEADERS', 'DNS INTEL', 'RISK FLAGS']

function Badge({ severity }) {
  const cls = {
    HIGH: 'badge-high',
    MEDIUM: 'badge-medium',
    LOW: 'badge-low',
    OK: 'badge-ok',
  }[severity] || 'badge-ok'
  return (
    <span className={`${cls} px-2 py-0.5 text-xs rounded font-semibold tracking-wider`}>
      {severity}
    </span>
  )
}

function StackBadge({ name }) {
  return (
    <span
      className="px-2 py-0.5 text-xs rounded"
      style={{
        background: 'rgba(68,136,255,0.1)',
        color: 'var(--blue)',
        border: '1px solid rgba(68,136,255,0.2)',
      }}
    >
      {name}
    </span>
  )
}

function Row({ label, value, highlight }) {
  if (!value && value !== 0) return null
  return (
    <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
      <td className="py-1.5 pr-4 text-xs" style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
        {label}
      </td>
      <td
        className="py-1.5 text-xs font-mono break-all"
        style={{ color: highlight ? 'var(--amber)' : 'var(--text)' }}
      >
        {String(value)}
      </td>
    </tr>
  )
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-4">
      <button
        className="flex items-center gap-2 w-full text-left py-1.5 text-xs"
        style={{ color: 'var(--text-dim)' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: 'var(--green)' }}>{open ? '▼' : '▶'}</span>
        <span className="uppercase tracking-widest">{title}</span>
      </button>
      {open && <div className="pl-4">{children}</div>}
    </div>
  )
}

function OverviewTab({ result }) {
  const stack = result.tech_stack?.detected_stack || []
  const dns = result.dns_intel || {}
  const flags = result.risk_flags || []
  const highCount = flags.filter(f => f.severity === 'HIGH').length
  const medCount = flags.filter(f => f.severity === 'MEDIUM').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div
        className="p-4 rounded"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <div className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>// target</div>
        <div className="text-lg font-semibold" style={{ color: 'var(--green)' }}>
          {result.domain}
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          {result.url} · scanned {new Date(result.scanned_at * 1000).toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Server', value: result.headers?.server || '—' },
          { label: 'CDN', value: result.headers?.cdn || result.dns_intel?.inferred_hosting || '—' },
          { label: 'HTTP Status', value: result.status_code || '—' },
          { label: 'Powered By', value: result.headers?.powered_by || '—' },
        ].map(({ label, value }) => (
          <div key={label} className="p-3 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>{label}</div>
            <div className="text-sm" style={{ color: 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      {stack.length > 0 && (
        <Section title="Detected Stack">
          <div className="flex flex-wrap gap-2 py-2">
            {stack.map((item, i) => (
              <StackBadge key={i} name={`${item.name} (${item.confidence})`} />
            ))}
          </div>
        </Section>
      )}

      {(highCount > 0 || medCount > 0) && (
        <div
          className="p-3 rounded flex items-center gap-3 text-sm"
          style={{
            background: highCount > 0 ? 'rgba(255,68,85,0.06)' : 'rgba(255,184,0,0.06)',
            border: `1px solid ${highCount > 0 ? 'rgba(255,68,85,0.2)' : 'rgba(255,184,0,0.2)'}`,
          }}
        >
          <span style={{ color: highCount > 0 ? 'var(--red)' : 'var(--amber)' }}>⚠</span>
          <span style={{ color: 'var(--text)' }}>
            {highCount} HIGH · {medCount} MEDIUM risk flags found
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>→ see RISK FLAGS tab</span>
        </div>
      )}
    </div>
  )
}

function JsTab({ result }) {
  const js = result.js_analysis || {}
  return (
    <div className="space-y-4 animate-fade-in">
      {js.source_map_leaks?.length > 0 && (
        <Section title="⚠ Source Map Leaks (HIGH)">
          {js.source_map_leaks.map((url, i) => (
            <div key={i} className="py-1 text-xs badge-high px-2 rounded mb-1 font-mono">
              {url}
            </div>
          ))}
        </Section>
      )}

      {js.secret_patterns?.length > 0 && (
        <Section title="⚠ Potential Secrets in JS">
          {js.secret_patterns.map((s, i) => (
            <div key={i} className="py-1 text-xs" style={{ color: 'var(--red)', fontFamily: 'monospace' }}>
              <span style={{ color: 'var(--text-dim)' }}>{s.source?.split('/').pop()} → </span>
              {s.pattern}
            </div>
          ))}
        </Section>
      )}

      {js.endpoints?.length > 0 && (
        <Section title={`API Endpoints (${js.endpoints.length})`}>
          <div className="space-y-0.5">
            {js.endpoints.map((ep, i) => (
              <div key={i} className="text-xs py-0.5 font-mono" style={{ color: 'var(--green-dim)' }}>
                {ep}
              </div>
            ))}
          </div>
        </Section>
      )}

      {js.env_vars?.length > 0 && (
        <Section title={`process.env References (${js.env_vars.length})`}>
          <div className="flex flex-wrap gap-1">
            {js.env_vars.map((v, i) => (
              <span key={i} className="badge-medium px-2 py-0.5 text-xs rounded font-mono">
                {v}
              </span>
            ))}
          </div>
        </Section>
      )}

      {js.graphql && (
        <Section title="GraphQL Detected">
          <span className="badge-ok px-2 py-1 text-xs rounded">GraphQL queries/mutations found in JS</span>
        </Section>
      )}

      {js.websockets?.length > 0 && (
        <Section title={`WebSocket Endpoints (${js.websockets.length})`}>
          {js.websockets.map((ws, i) => (
            <div key={i} className="text-xs py-0.5 font-mono" style={{ color: 'var(--blue)' }}>{ws}</div>
          ))}
        </Section>
      )}

      {js.external_domains?.length > 0 && (
        <Section title={`External Domains Referenced (${js.external_domains.length})`} defaultOpen={false}>
          <div className="flex flex-wrap gap-1">
            {js.external_domains.slice(0, 20).map((d, i) => (
              <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                {d}
              </span>
            ))}
          </div>
        </Section>
      )}

      {!js.endpoints?.length && !js.source_map_leaks?.length && !js.secret_patterns?.length && (
        <div className="text-xs py-8 text-center" style={{ color: 'var(--muted)' }}>
          No JS analysis findings.
        </div>
      )}
    </div>
  )
}

function HeadersTab({ result }) {
  const headers = result.headers || {}
  const raw = headers.raw_headers || {}
  const csp = headers.csp_parsed

  const SECURITY_HEADERS = [
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'strict-transport-security',
    'referrer-policy',
    'permissions-policy',
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      <Section title="Security Header Audit">
        <table className="w-full">
          <tbody>
            {SECURITY_HEADERS.map(h => {
              const val = raw[h]
              return (
                <tr key={h} className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-1.5 pr-4 text-xs font-mono" style={{ color: 'var(--text-dim)', width: '45%' }}>
                    {h}
                  </td>
                  <td className="py-1.5 text-xs">
                    {val ? (
                      <span style={{ color: 'var(--green)' }}>✓ set</span>
                    ) : (
                      <span style={{ color: 'var(--red)' }}>✗ missing</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>

      {csp && (
        <Section title="CSP Analysis">
          <div className="space-y-1">
            {csp.flags?.map(f => (
              <div key={f} className="badge-high px-2 py-1 text-xs rounded inline-block mr-1">
                ⚠ {f}
              </div>
            ))}
            {Object.entries(csp.directives || {}).map(([dir, vals]) => (
              <div key={dir} className="text-xs py-0.5">
                <span className="font-semibold" style={{ color: 'var(--amber)' }}>{dir}</span>
                <span style={{ color: 'var(--text-dim)' }}> {vals.join(' ')}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {headers.cors && (
        <Section title="CORS Policy">
          <table className="w-full">
            <tbody>
              {Object.entries(headers.cors).filter(([_, v]) => v).map(([k, v]) => (
                <Row key={k} label={k} value={v} highlight={v === '*'} />
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title={`All Response Headers (${Object.keys(raw).length})`} defaultOpen={false}>
        <table className="w-full">
          <tbody>
            {Object.entries(raw).map(([k, v]) => (
              <tr key={k} className="border-b" style={{ borderColor: 'var(--border)' }}>
                <td className="py-1 pr-3 text-xs font-mono" style={{ color: 'var(--text-dim)', width: '40%' }}>{k}</td>
                <td className="py-1 text-xs font-mono break-all" style={{ color: 'var(--text)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

function DnsTab({ result }) {
  const dns = result.dns_intel || {}
  return (
    <div className="space-y-4 animate-fade-in">
      {dns.inferred_hosting && (
        <div className="p-3 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Inferred Hosting: </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--amber)' }}>{dns.inferred_hosting}</span>
        </div>
      )}

      {[
        { label: 'A Records', values: dns.a_records },
        { label: 'MX Records', values: dns.mx_records },
        { label: 'CNAME', values: dns.cname },
        { label: 'TXT Records', values: dns.txt_records },
      ].map(({ label, values }) => (
        values?.length > 0 && (
          <Section key={label} title={`${label} (${values.length})`}>
            {values.map((v, i) => (
              <div key={i} className="text-xs py-0.5 font-mono" style={{ color: 'var(--text)' }}>{v}</div>
            ))}
          </Section>
        )
      ))}
    </div>
  )
}

function RiskFlagsTab({ result }) {
  const flags = result.risk_flags || []
  if (!flags.length) {
    return (
      <div className="text-xs py-12 text-center" style={{ color: 'var(--green)' }}>
        ✓ No risk flags identified.
      </div>
    )
  }

  const sorted = [...flags].sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  })

  return (
    <div className="space-y-2 animate-fade-in">
      {sorted.map((flag, i) => (
        <div
          key={i}
          className="p-3 rounded flex items-start gap-3"
          style={{
            background: flag.severity === 'HIGH'
              ? 'rgba(255,68,85,0.06)'
              : flag.severity === 'MEDIUM'
                ? 'rgba(255,184,0,0.06)'
                : 'rgba(68,136,255,0.06)',
            border: `1px solid ${flag.severity === 'HIGH' ? 'rgba(255,68,85,0.15)' : flag.severity === 'MEDIUM' ? 'rgba(255,184,0,0.15)' : 'rgba(68,136,255,0.15)'}`,
          }}
        >
          <Badge severity={flag.severity} />
          <div>
            <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text)' }}>
              {flag.type.replace(/_/g, ' ').toUpperCase()}
            </div>
            <div className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              {flag.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ScanResults({ result }) {
  const [activeTab, setActiveTab] = useState(0)
  const flagCount = result.risk_flags?.length || 0
  const highCount = result.risk_flags?.filter(f => f.severity === 'HIGH').length || 0

  return (
    <div
      className="w-full max-w-3xl mx-auto rounded"
      style={{ border: '1px solid var(--border-bright)' }}
    >
      {/* Tab bar */}
      <div
        className="flex border-b overflow-x-auto"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-xs tracking-widest whitespace-nowrap transition-colors ${
              activeTab === i ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {tab}
            {tab === 'RISK FLAGS' && flagCount > 0 && (
              <span
                className="ml-1.5 px-1.5 py-0.5 rounded text-xs"
                style={{
                  background: highCount > 0 ? 'rgba(255,68,85,0.2)' : 'rgba(255,184,0,0.2)',
                  color: highCount > 0 ? 'var(--red)' : 'var(--amber)',
                  fontSize: 10,
                }}
              >
                {flagCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4" style={{ background: 'var(--surface)' }}>
        {activeTab === 0 && <OverviewTab result={result} />}
        {activeTab === 1 && <JsTab result={result} />}
        {activeTab === 2 && <HeadersTab result={result} />}
        {activeTab === 3 && <DnsTab result={result} />}
        {activeTab === 4 && <RiskFlagsTab result={result} />}
      </div>
    </div>
  )
}
