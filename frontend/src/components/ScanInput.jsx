import { useState, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [focused, setFocused] = useState(false)

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
          setError('Rate limit exceeded')
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
      <motion.div
        className="flex items-center justify-between mb-4 text-xs"
        style={{ color: 'var(--text-dim)' }}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <motion.span
              style={{ color: 'var(--green)', display: 'inline-block' }}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            >●</motion.span>
            <span>SID:</span>
            <span className="font-mono" style={{ color: 'var(--text)' }}>{truncatedId}</span>
          </span>
          {!statsLoading && sessionStats && (
            <motion.span
              style={{ color: 'var(--muted)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              scans: <span style={{ color: 'var(--amber)' }}>{sessionStats.scan_count}</span>
            </motion.span>
          )}
        </div>
        <span style={{ color: 'var(--muted)' }}>passive recon only</span>
      </motion.div>

      {/* Main input */}
      <motion.div
        className="flex items-center gap-0 rounded"
        style={{
          background: 'var(--surface)',
          border: `1px solid ${focused ? 'var(--green)' : 'var(--border-bright)'}`,
          boxShadow: focused ? '0 0 0 1px rgba(0,255,136,0.15), 0 0 20px rgba(0,255,136,0.04)' : 'none',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        whileTap={{ scale: 0.995 }}
      >
        <motion.span
          className="px-3 text-xs shrink-0"
          style={{ color: focused ? 'var(--green)' : 'var(--green-dim)' }}
          animate={{ color: focused ? 'var(--green)' : 'var(--green-dim)' }}
          transition={{ duration: 0.2 }}
        >TARGET›</motion.span>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="https://example.com"
          maxLength={2048}
          disabled={loading || retryCountdown > 0}
          className="flex-1 bg-transparent py-3 px-2 font-mono text-sm outline-none"
          style={{ color: 'var(--text)', caretColor: 'var(--green)' }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
        />
        <motion.button
          onClick={handleScan}
          disabled={loading || retryCountdown > 0 || !url.trim()}
          className="px-5 py-3 text-xs font-semibold tracking-widest uppercase shrink-0 rounded-r"
          style={{
            borderLeft: '1px solid var(--border-bright)',
            cursor: loading || retryCountdown > 0 ? 'not-allowed' : 'pointer',
            background: loading ? 'transparent' : 'rgba(0,255,136,0.08)',
            color: loading ? 'var(--muted)' : 'var(--green)',
          }}
          whileHover={!loading && !retryCountdown && url.trim() ? {
            background: 'rgba(0,255,136,0.15)',
            boxShadow: '0 0 12px rgba(0,255,136,0.1)',
          } : {}}
          whileTap={!loading ? { scale: 0.97 } : {}}
          transition={{ duration: 0.15 }}
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
        </motion.button>
      </motion.div>

      {/* Error display */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="mt-3 px-3 py-2 text-xs rounded flex items-center gap-2"
            style={{
              background: 'rgba(255,68,85,0.08)',
              border: '1px solid rgba(255,68,85,0.2)',
              color: 'var(--red)',
            }}
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span>✗</span>
            <span>{error}</span>
            {retryCountdown > 0 && (
              <span style={{ color: 'var(--text-dim)' }}>
                — retry in {retryCountdown}s
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ScanSpinner() {
  return (
    <motion.span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        border: '1.5px solid var(--green)',
        borderTopColor: 'transparent',
      }}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
    />
  )
}
