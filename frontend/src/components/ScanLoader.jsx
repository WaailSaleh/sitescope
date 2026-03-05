import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SCAN_STEPS = [
  { label: 'Resolving hostname', pass: 'SSRF check' },
  { label: 'Fetching HTTP headers', pass: 'Pass 1' },
  { label: 'Parsing HTML surface', pass: 'Pass 2' },
  { label: 'Analyzing JS bundles', pass: 'Pass 3' },
  { label: 'Running tech stack detection', pass: 'Pass 4' },
  { label: 'Querying DNS records', pass: 'Pass 5' },
  { label: 'Compiling risk flags', pass: 'Final' },
]

export default function ScanLoader({ scanId }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIdx(i => Math.min(i + 1, SCAN_STEPS.length - 1))
    }, 2000)
    const dotTimer = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => {
      clearInterval(stepTimer)
      clearInterval(dotTimer)
    }
  }, [])

  const progress = ((stepIdx + 1) / SCAN_STEPS.length) * 100

  return (
    <div
      className="w-full max-w-3xl mx-auto p-6 rounded"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Animated progress bar */}
      <div className="mb-5 h-px relative overflow-hidden" style={{ background: 'var(--border)' }}>
        <motion.div
          className="absolute top-0 left-0 h-full"
          style={{ background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
        {/* Shimmer */}
        <motion.div
          className="absolute top-0 h-full w-16"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(0,255,136,0.5), transparent)',
          }}
          animate={{ left: ['-10%', '110%'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'linear', repeatDelay: 0.5 }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2 mb-5">
        {SCAN_STEPS.map((step, i) => (
          <AnimatePresence key={i} mode="wait">
            <motion.div
              className="flex items-center gap-3 text-xs"
              initial={i === stepIdx ? { opacity: 0, x: -8 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
            >
              <span className="w-12 shrink-0 text-right" style={{ color: 'var(--muted)', fontSize: 10 }}>
                {step.pass}
              </span>

              {/* Icon */}
              {i < stepIdx ? (
                <motion.span
                  style={{ color: 'var(--green)' }}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >✓</motion.span>
              ) : i === stepIdx ? (
                <motion.span
                  style={{ color: 'var(--amber)' }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                >▶</motion.span>
              ) : (
                <span style={{ color: 'var(--border-bright)' }}>○</span>
              )}

              {/* Label */}
              <span style={{
                color: i < stepIdx
                  ? 'var(--muted)'
                  : i === stepIdx
                    ? 'var(--text)'
                    : 'var(--border-bright)',
              }}>
                {step.label}
                {i === stepIdx && (
                  <motion.span
                    style={{ color: 'var(--amber)', display: 'inline-block', width: 20 }}
                  >
                    {dots}
                  </motion.span>
                )}
              </span>
            </motion.div>
          </AnimatePresence>
        ))}
      </div>

      {/* Scan ID + scanning indicator */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          scan_id: <span className="font-mono" style={{ color: 'var(--text-dim)' }}>{scanId}</span>
        </span>
        <motion.div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--green)' }}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--green)',
              boxShadow: '0 0 6px var(--green)',
            }}
          />
          scanning
        </motion.div>
      </div>
    </div>
  )
}
