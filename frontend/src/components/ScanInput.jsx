import { useState, useContext } from 'react'
import { ShadowContext } from '../App'
import { ApiError } from '../services/api'

function isValidUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export default function ScanInput({ onScanStart, sessionStats, statsLoading }) {
  const { shadowId, api } = useContext(ShadowContext)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retryCountdown, setRetryCountdown] = useState(0)

  const handleScan = async () => {
    setError(null)
    const trimmed = url.trim()

    if (!trimmed) { setError('Enter a target URL'); return }
    if (trimmed.length > 2048) { setError('URL too long (max 2048 chars)'); return }
    if (!isValidUrl(trimmed)) { setError('Invalid URL — must start with http:// or https://'); return }

    setLoading(true)
    try {
      const result = await api.startScan(trimmed)
      onScanStart(result.scan_id)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const wait = err.retryAfter || 60
          setError(`Rate limit exceeded`)
          let remaining = wait
          const interval = setInterval(() => {
            remaining--
            setRetryCountdown(remaining)
            if (remaining <= 0) { clearInterval(interval); setRetryCountdown(0); setError(null) }
          }, 1000)
          setRetryCountdown(wait)
        } else if (err.status === 400) {
          setError(err.message)
        } else {
          setError('Scan failed. Try again.')
        }
      } else {
        setError('Connection error. Is the backend running?')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) handleScan()
  }

  const truncatedId = shadowId ? `${shadowId.slice(0, 8)}...${shadowId.slice(-4)}` : '--------'

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Session info bar */}
      <div className="flex items-center justify-between mb-4 text-xs" style={{ color: 'var(--text-dim)' }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span style={{ color: 'var(--green)' }}>●</span>
            <span>SID:</span>
            <span className="font-mono" style={{ color: 'var(--text)' }}>{truncatedId}</span>
          </span>
          {!statsLoading && sessionStats && (
            <span style={{ color: 'var(--muted)' }}>
              scans: <span style={{ color: 'var(--amber)' }}>{sessionStats.scan_count}</span>
            </span>
          )}
        </div>
        <span style={{ color: 'var(--muted)' }}>passive recon only</span>
      </div>

      {/* Main input */}
      <div
        className="flex items-center gap-0 rounded"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-bright)',
        }}
      >
        <span className="px-3 text-xs shrink-0" style={{ color: 'var(--green)' }}>TARGET›</span>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com"
          maxLength={2048}
          disabled={loading || retryCountdown > 0}
          className="flex-1 bg-transparent py-3 px-2 font-mono text-sm outline-none"
          style={{
            color: 'var(--text)',
            caretColor: 'var(--green)',
          }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
        />
        <button
          onClick={handleScan}
          disabled={loading || retryCountdown > 0 || !url.trim()}
          className="px-5 py-3 text-xs font-semibold tracking-widest uppercase transition-all duration-150 shrink-0 rounded-r"
          style={{
            background: loading ? 'transparent' : 'rgba(0,255,136,0.08)',
            color: loading ? 'var(--muted)' : 'var(--green)',
            borderLeft: '1px solid var(--border-bright)',
            cursor: loading || retryCountdown > 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <ScanSpinner />
              SCANNING
            </span>
          ) : retryCountdown > 0 ? (
            `WAIT ${retryCountdown}s`
          ) : (
            'SCAN ▶'
          )}
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div
          className="mt-3 px-3 py-2 text-xs rounded flex items-center gap-2"
          style={{
            background: 'rgba(255,68,85,0.08)',
            border: '1px solid rgba(255,68,85,0.2)',
            color: 'var(--red)',
          }}
        >
          <span>✗</span>
          <span>{error}</span>
          {retryCountdown > 0 && (
            <span style={{ color: 'var(--text-dim)' }}>
              — retry in {retryCountdown}s
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ScanSpinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        border: '1px solid var(--green)',
        borderTopColor: 'transparent',
        animation: 'spin 0.6s linear infinite',
      }}
    />
  )
}
