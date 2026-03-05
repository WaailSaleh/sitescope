import { useState, useEffect, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShadowContext } from '../App'

function StatusBadge({ status }) {
  const styles = {
    complete: { color: 'var(--green)', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.15)' },
    pending: { color: 'var(--amber)', bg: 'rgba(255,184,0,0.08)', border: 'rgba(255,184,0,0.15)' },
    error: { color: 'var(--red)', bg: 'rgba(255,68,85,0.08)', border: 'rgba(255,68,85,0.15)' },
  }
  const s = styles[status] || styles.pending
  return (
    <span
      className="px-2 py-0.5 text-xs rounded shrink-0"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
    >
      {status}
    </span>
  )
}

export default function ScanHistory({ onLoadScan }) {
  const { api } = useContext(ShadowContext)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.getHistory().then(data => {
      if (!cancelled) { setHistory(data.scans || []); setLoading(false) }
    }).catch(e => {
      if (!cancelled) { setError(e.message); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <motion.div
        className="text-xs py-4"
        style={{ color: 'var(--muted)' }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        loading history...
      </motion.div>
    )
  }

  if (error) {
    return (
      <motion.div
        className="text-xs py-2"
        style={{ color: 'var(--red)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        Failed to load history: {error}
      </motion.div>
    )
  }

  if (!history.length) {
    return (
      <motion.div
        className="text-xs py-4"
        style={{ color: 'var(--muted)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        // no previous scans
      </motion.div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <motion.div
        className="text-xs mb-3 tracking-widest uppercase"
        style={{ color: 'var(--text-dim)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        // scan history
      </motion.div>
      <div className="space-y-1">
        {history.map((scan, index) => (
          <motion.button
            key={scan.id}
            onClick={() => scan.status === 'complete' && onLoadScan(scan.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-left"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              cursor: scan.status === 'complete' ? 'pointer' : 'default',
              opacity: scan.status === 'error' ? 0.5 : 1,
            }}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: scan.status === 'error' ? 0.5 : 1, x: 0 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
            whileHover={scan.status === 'complete' ? {
              borderColor: 'var(--border-bright)',
              x: 3,
              transition: { duration: 0.15 }
            } : {}}
            whileTap={scan.status === 'complete' ? { scale: 0.99 } : {}}
          >
            <StatusBadge status={scan.status} />
            <span className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--text)' }}>
              {scan.target_domain || scan.target_url}
            </span>
            <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>
              {new Date(scan.created_at * 1000).toLocaleDateString()}
            </span>
            {scan.status === 'complete' && (
              <motion.span
                style={{ color: 'var(--muted)', fontSize: 10 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                →
              </motion.span>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  )
}
