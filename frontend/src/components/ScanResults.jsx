import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import SourceMapViewer from './SourceMapViewer'
import { exportJSON, exportTXT, exportMarkdown } from '../utils/exportReport'

/* ── Export dropdown ─────────────────────────────────────────── */
function ExportMenu({ result }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  // Compute position from button so we can use position:fixed (escapes all overflow)
  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const options = [
    { label: '{ } JSON', sub: 'raw API response', action: () => exportJSON(result) },
    { label: '≡  Report.txt', sub: 'mirrors test-live-scan.sh', action: () => exportTXT(result) },
    { label: '#  Markdown', sub: 'GitHub-flavoured report', action: () => exportMarkdown(result) },
  ]

  return (
    <div style={{ position: 'relative' }}>
      <motion.button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        whileTap={{ scale: 0.94 }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs"
        style={{ background: open ? 'rgba(0,255,136,0.1)' : 'var(--surface)', border: `1px solid ${open ? 'rgba(0,255,136,0.3)' : 'var(--border-bright)'}`, color: open ? 'var(--green)' : 'var(--text-dim)', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
      >
        <span>⬇</span>
        <span>Export</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} style={{ display: 'inline-block', fontSize: 9 }}>▼</motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          // position:fixed so it's never clipped by overflow:hidden or overflow-x:auto parents
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              zIndex: 9999,
              background: 'var(--surface-2)',
              border: '1px solid var(--border-bright)',
              minWidth: 195,
              borderRadius: 6,
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div className="px-3 py-1.5 text-xs uppercase tracking-widest border-b" style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}>Export Report</div>
            {options.map(opt => (
              <button
                key={opt.label}
                onClick={() => { opt.action(); setOpen(false) }}
                className="w-full flex flex-col px-3 py-2 text-left hover:bg-white/5 transition-colors"
              >
                <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{opt.label}</span>
                <span style={{ color: 'var(--muted)', fontSize: 10, marginTop: 2 }}>{opt.sub}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const TABS = ['OVERVIEW', 'SOURCE MAPS', 'JS ANALYSIS', 'HEADERS', 'DNS INTEL', 'RISK FLAGS']

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.22 }
}

/* ── Shared primitives ───────────────────────────────────────────── */
function Badge({ severity }) {
  const cls = { HIGH: 'badge-high', MEDIUM: 'badge-medium', LOW: 'badge-low', OK: 'badge-ok' }[severity] || 'badge-ok'
  return <span className={`${cls} px-2 py-0.5 text-xs rounded font-semibold tracking-wider`}>{severity}</span>
}

function StackBadge({ name, index }) {
  return (
    <motion.span
      className="px-2 py-0.5 text-xs rounded"
      style={{ background: 'rgba(68,136,255,0.1)', color: 'var(--blue)', border: '1px solid rgba(68,136,255,0.2)' }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay: index * 0.06, type: 'spring', stiffness: 300 }}
    >{name}</motion.span>
  )
}

function Row({ label, value, highlight }) {
  if (!value && value !== 0) return null
  return (
    <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
      <td className="py-1.5 pr-4 text-xs" style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{label}</td>
      <td className="py-1.5 text-xs font-mono break-all" style={{ color: highlight ? 'var(--amber)' : 'var(--text)' }}>{String(value)}</td>
    </tr>
  )
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-4">
      <button className="flex items-center gap-2 w-full text-left py-1.5 text-xs" style={{ color: 'var(--text-dim)' }} onClick={() => setOpen(o => !o)}>
        <motion.span style={{ color: 'var(--green)', display: 'inline-block' }} animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }}>▼</motion.span>
        <span className="uppercase tracking-widest">{title}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="pl-4 overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeInOut' }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatCard({ label, value, index }) {
  return (
    <motion.div
      className="p-3 rounded"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 + index * 0.07 }}
      whileHover={{ borderColor: 'var(--border-bright)', transition: { duration: 0.15 } }}
    >
      <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>{label}</div>
      <div className="text-sm truncate" style={{ color: 'var(--text)' }}>{value}</div>
    </motion.div>
  )
}

/* ── Overview tab ────────────────────────────────────────────────── */
function OverviewTab({ result }) {
  const stack = result.tech_stack?.detected_stack || []
  const flags = result.risk_flags || []
  const highCount = flags.filter(f => f.severity === 'HIGH').length
  const medCount = flags.filter(f => f.severity === 'MEDIUM').length

  return (
    <motion.div className="space-y-4 sm:space-y-6" {...fadeUp}>
      <motion.div className="p-3 sm:p-4 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>// target</div>
        <div className="text-base sm:text-lg font-semibold break-all" style={{ color: 'var(--green)' }}>{result.domain}</div>
        <div className="text-xs mt-1 break-all" style={{ color: 'var(--muted)' }}>{result.url} · scanned {new Date(result.scanned_at * 1000).toLocaleString()}</div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Server', value: result.headers?.server || '—' },
          { label: 'CDN', value: result.headers?.cdn || result.dns_intel?.inferred_hosting || '—' },
          { label: 'HTTP Status', value: result.status_code || '—' },
          { label: 'Powered By', value: result.headers?.powered_by || '—' },
        ].map(({ label, value }, i) => <StatCard key={label} label={label} value={value} index={i} />)}
      </div>

      {stack.length > 0 && (
        <Section title="Detected Stack">
          <div className="flex flex-wrap gap-1.5 sm:gap-2 py-2">
            {stack.map((item, i) => <StackBadge key={i} name={`${item.name} (${item.confidence})`} index={i} />)}
          </div>
        </Section>
      )}

      {(highCount > 0 || medCount > 0) && (
        <motion.div className="p-3 rounded flex flex-wrap items-center gap-2 sm:gap-3 text-sm" style={{ background: highCount > 0 ? 'rgba(255,68,85,0.06)' : 'rgba(255,184,0,0.06)', border: `1px solid ${highCount > 0 ? 'rgba(255,68,85,0.2)' : 'rgba(255,184,0,0.2)'}` }} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.35 }}>
          <span style={{ color: highCount > 0 ? 'var(--red)' : 'var(--amber)' }}>⚠</span>
          <span style={{ color: 'var(--text)' }}>{highCount} HIGH · {medCount} MEDIUM risk flags found</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>→ see RISK FLAGS tab</span>
        </motion.div>
      )}
    </motion.div>
  )
}

/* ── Source Map tab ──────────────────────────────────────────────── */
function SourceMapsTab({ result }) {
  const sourceMaps = (result.js_analysis || {}).source_maps || []
  return <SourceMapViewer sourceMaps={sourceMaps} />
}

function langColor(lang) {
  return {
    typescript: '#4488ff',
    javascript: '#ffb800',
    vue: '#00d2a0',
    svelte: '#ff6600',
    css: '#cc88ff',
    json: '#888888',
    python: '#4488ff',
  }[lang] || 'var(--muted)'
}

/* ── JS Analysis tab ─────────────────────────────────────────────── */
function JsTab({ result }) {
  const js = result.js_analysis || {}
  const stagger = (i) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, delay: i * 0.06 } })

  return (
    <motion.div className="space-y-4" {...fadeUp}>
      {js.secret_patterns?.length > 0 && (
        <Section title="⚠ Potential Secrets in JS">
          {js.secret_patterns.map((s, i) => (
            <motion.div key={i} className="py-1 text-xs" style={{ color: 'var(--red)', fontFamily: 'monospace' }} {...stagger(i)}>
              <span style={{ color: 'var(--text-dim)' }}>{s.source?.split('/').pop()} → </span>{s.pattern}
            </motion.div>
          ))}
        </Section>
      )}

      {js.endpoints?.length > 0 && (
        <Section title={`API Endpoints (${js.endpoints.length})`}>
          <div className="space-y-0.5">
            {js.endpoints.map((ep, i) => (
              <motion.div key={i} className="text-xs py-0.5 font-mono break-all" style={{ color: 'var(--green-dim)' }} {...stagger(i)}>{ep}</motion.div>
            ))}
          </div>
        </Section>
      )}

      {js.env_vars?.length > 0 && (
        <Section title={`process.env References (${js.env_vars.length})`}>
          <div className="flex flex-wrap gap-1 py-1">
            {js.env_vars.map((v, i) => (
              <motion.span key={i} className="badge-medium px-2 py-0.5 text-xs rounded font-mono" {...stagger(i)}>{v}</motion.span>
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
            <motion.div key={i} className="text-xs py-0.5 font-mono break-all" style={{ color: 'var(--blue)' }} {...stagger(i)}>{ws}</motion.div>
          ))}
        </Section>
      )}

      {js.external_domains?.length > 0 && (
        <Section title={`External Domains (${js.external_domains.length})`} defaultOpen={false}>
          <div className="flex flex-wrap gap-1 py-1">
            {js.external_domains.slice(0, 20).map((d, i) => (
              <motion.span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }} {...stagger(i)}>{d}</motion.span>
            ))}
          </div>
        </Section>
      )}

      {!js.endpoints?.length && !js.secret_patterns?.length && (
        <motion.div className="text-xs py-8 text-center" style={{ color: 'var(--muted)' }} {...fadeUp}>No JS analysis findings.</motion.div>
      )}
    </motion.div>
  )
}

/* ── Headers tab ─────────────────────────────────────────────────── */
function HeadersTab({ result }) {
  const headers = result.headers || {}
  const raw = headers.raw_headers || {}
  const csp = headers.csp_parsed

  const SECURITY_HEADERS = [
    'content-security-policy', 'x-frame-options', 'x-content-type-options',
    'strict-transport-security', 'referrer-policy', 'permissions-policy',
  ]

  return (
    <motion.div className="space-y-4" {...fadeUp}>
      <Section title="Security Header Audit">
        <table className="w-full">
          <tbody>
            {SECURITY_HEADERS.map((h, i) => {
              const val = raw[h]
              return (
                <motion.tr key={h} className="border-b" style={{ borderColor: 'var(--border)' }} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: i * 0.05 }}>
                  <td className="py-1.5 pr-2 sm:pr-4 text-xs font-mono" style={{ color: 'var(--text-dim)', width: '55%' }}>{h}</td>
                  <td className="py-1.5 text-xs">
                    {val
                      ? <motion.span style={{ color: 'var(--green)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 + 0.1 }}>✓ set</motion.span>
                      : <motion.span style={{ color: 'var(--red)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 + 0.1 }}>✗ missing</motion.span>}
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </Section>

      {csp && (
        <Section title="CSP Analysis">
          <div className="space-y-1 py-1">
            {csp.flags?.map(f => <div key={f} className="badge-high px-2 py-1 text-xs rounded inline-block mr-1">⚠ {f}</div>)}
            {Object.entries(csp.directives || {}).map(([dir, vals]) => (
              <div key={dir} className="text-xs py-0.5 break-all">
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
              {Object.entries(headers.cors).filter(([_, v]) => v).map(([k, v]) => <Row key={k} label={k} value={v} highlight={v === '*'} />)}
            </tbody>
          </table>
        </Section>
      )}

      <Section title={`All Response Headers (${Object.keys(raw).length})`} defaultOpen={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-0">
            <tbody>
              {Object.entries(raw).map(([k, v]) => (
                <tr key={k} className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-1 pr-3 text-xs font-mono" style={{ color: 'var(--text-dim)', width: '40%', wordBreak: 'break-all' }}>{k}</td>
                  <td className="py-1 text-xs font-mono break-all" style={{ color: 'var(--text)' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </motion.div>
  )
}

/* ── DNS tab ─────────────────────────────────────────────────────── */
function DnsTab({ result }) {
  const dns = result.dns_intel || {}
  return (
    <motion.div className="space-y-4" {...fadeUp}>
      {dns.inferred_hosting && (
        <motion.div className="p-3 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Inferred Hosting: </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--amber)' }}>{dns.inferred_hosting}</span>
        </motion.div>
      )}
      {[
        { label: 'A Records', values: dns.a_records },
        { label: 'MX Records', values: dns.mx_records },
        { label: 'CNAME', values: dns.cname },
        { label: 'TXT Records', values: dns.txt_records },
      ].map(({ label, values }) => values?.length > 0 && (
        <Section key={label} title={`${label} (${values.length})`}>
          {values.map((v, i) => (
            <motion.div key={i} className="text-xs py-0.5 font-mono break-all" style={{ color: 'var(--text)' }} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: i * 0.04 }}>{v}</motion.div>
          ))}
        </Section>
      ))}
    </motion.div>
  )
}

/* ── Risk Flags tab ──────────────────────────────────────────────── */
function RiskFlagsTab({ result }) {
  const flags = result.risk_flags || []
  if (!flags.length) {
    return (
      <motion.div className="text-xs py-12 text-center" style={{ color: 'var(--green)' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
        ✓ No risk flags identified.
      </motion.div>
    )
  }
  const sorted = [...flags].sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.severity] ?? 3) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.severity] ?? 3))
  return (
    <motion.div className="space-y-2" {...fadeUp}>
      {sorted.map((flag, i) => (
        <motion.div key={i} className="p-3 rounded flex items-start gap-2 sm:gap-3"
          style={{
            background: flag.severity === 'HIGH' ? 'rgba(255,68,85,0.06)' : flag.severity === 'MEDIUM' ? 'rgba(255,184,0,0.06)' : 'rgba(68,136,255,0.06)',
            border: `1px solid ${flag.severity === 'HIGH' ? 'rgba(255,68,85,0.15)' : flag.severity === 'MEDIUM' ? 'rgba(255,184,0,0.15)' : 'rgba(68,136,255,0.15)'}`,
          }}
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, delay: i * 0.07 }}
          whileHover={{ x: 2, transition: { duration: 0.15 } }}
        >
          <Badge severity={flag.severity} />
          <div className="min-w-0">
            <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text)' }}>{flag.type.replace(/_/g, ' ').toUpperCase()}</div>
            <div className="text-xs font-mono break-all" style={{ color: 'var(--text-dim)' }}>{flag.detail}</div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}

/* ── Root component ──────────────────────────────────────────────── */
const tabComponents = [OverviewTab, SourceMapsTab, JsTab, HeadersTab, DnsTab, RiskFlagsTab]

export default function ScanResults({ result }) {
  const [activeTab, setActiveTab] = useState(0)
  const flagCount = result.risk_flags?.length || 0
  const highCount = result.risk_flags?.filter(f => f.severity === 'HIGH').length || 0
  const sourceMapCount = result.js_analysis?.source_maps?.length || 0

  const TabContent = tabComponents[activeTab]

  return (
    <div className="w-full max-w-3xl xl:max-w-5xl mx-auto rounded relative" style={{ border: '1px solid var(--border-bright)' }}>
      {/* Export button — outside overflow div so dropdown isn't clipped */}
      <div className="absolute top-0 right-0 z-10 flex items-center" style={{ height: '41px', paddingRight: 8 }}>
        <ExportMenu result={result} />
      </div>

      {/* Tab bar — scrollable on mobile, padded right so last tab doesn't hide behind Export button */}
      <div className="flex border-b overflow-x-auto relative" style={{ borderColor: 'var(--border)', background: 'var(--surface)', scrollbarWidth: 'none', paddingRight: 90 }}>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className="px-3 sm:px-4 py-2.5 sm:py-3 text-xs tracking-widest whitespace-nowrap relative shrink-0"
            style={{ color: activeTab === i ? 'var(--green)' : 'var(--text-dim)', textShadow: activeTab === i ? '0 0 8px rgba(0,255,136,0.4)' : 'none', transition: 'color 0.2s, text-shadow 0.2s' }}
          >
            {tab}
            {tab === 'RISK FLAGS' && flagCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded" style={{ background: highCount > 0 ? 'rgba(255,68,85,0.2)' : 'rgba(255,184,0,0.2)', color: highCount > 0 ? 'var(--red)' : 'var(--amber)', fontSize: 10 }}>{flagCount}</span>
            )}
            {tab === 'SOURCE MAPS' && sourceMapCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,68,85,0.2)', color: 'var(--red)', fontSize: 10 }}>{sourceMapCount}</span>
            )}
            {activeTab === i && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3 sm:p-4" style={{ background: 'var(--surface)', minHeight: 200 }}>
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <TabContent result={result} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
