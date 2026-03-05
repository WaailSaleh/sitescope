import { useState, useEffect } from 'react'

const SCAN_STEPS = [
  'Resolving hostname...',
  'Fetching HTTP headers...',
  'Parsing HTML surface...',
  'Analyzing JS bundles...',
  'Running tech stack detection...',
  'Querying DNS records...',
  'Compiling risk flags...',
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

  return (
    <div
      className="w-full max-w-3xl mx-auto p-6 rounded"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Progress bar */}
      <div className="mb-4 h-px relative overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="absolute top-0 left-0 h-full"
          style={{
            width: `${((stepIdx + 1) / SCAN_STEPS.length) * 100}%`,
            background: 'var(--green)',
            transition: 'width 0.5s ease',
            boxShadow: '0 0 8px var(--green)',
          }}
        />
      </div>

      {/* Steps log */}
      <div className="space-y-1 mb-4">
        {SCAN_STEPS.map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {i < stepIdx ? (
              <span style={{ color: 'var(--green)' }}>✓</span>
            ) : i === stepIdx ? (
              <span style={{ color: 'var(--amber)', animation: 'blink 1s step-end infinite' }}>▶</span>
            ) : (
              <span style={{ color: 'var(--border-bright)' }}>○</span>
            )}
            <span style={{
              color: i < stepIdx ? 'var(--muted)' : i === stepIdx ? 'var(--text)' : 'var(--border-bright)',
            }}>
              {step}
              {i === stepIdx && <span style={{ color: 'var(--amber)' }}>{dots}</span>}
            </span>
          </div>
        ))}
      </div>

      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        scan_id: <span style={{ color: 'var(--text-dim)' }}>{scanId}</span>
      </div>
    </div>
  )
}
