import { createContext, useState, useEffect, useCallback } from 'react'
import { useShadowId } from './hooks/useShadowId'
import { createApiService, ApiError } from './services/api'
import ScanInput from './components/ScanInput'
import ScanResults from './components/ScanResults'
import ScanLoader from './components/ScanLoader'
import ScanHistory from './components/ScanHistory'
import './index.css'

export const ShadowContext = createContext(null)

const POLL_INTERVAL = 2000

export default function App() {
  const { shadowId, loading: sidLoading } = useShadowId()
  const [api, setApi] = useState(null)

  const [activeScanId, setActiveScanId] = useState(null)
  const [scanStatus, setScanStatus] = useState(null) // 'pending' | 'complete' | 'error'
  const [scanResult, setScanResult] = useState(null)
  const [sessionStats, setSessionStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [view, setView] = useState('main') // 'main' | 'history'

  useEffect(() => {
    if (shadowId) {
      setApi(createApiService(shadowId))
    }
  }, [shadowId])

  useEffect(() => {
    if (!api) return
    api.getSessionStats()
      .then(stats => { setSessionStats(stats); setStatsLoading(false) })
      .catch(() => setStatsLoading(false))
  }, [api])

  // Poll for scan completion
  useEffect(() => {
    if (!activeScanId || !api || scanStatus === 'complete' || scanStatus === 'error') return

    let cancelled = false
    const poll = async () => {
      try {
        const data = await api.getScan(activeScanId)
        if (cancelled) return
        setScanStatus(data.status)
        if (data.status === 'complete') {
          setScanResult(data.result)
          // Refresh session stats
          api.getSessionStats().then(s => setSessionStats(s)).catch(() => {})
        }
      } catch (e) {
        if (!cancelled) setScanStatus('error')
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeScanId, api, scanStatus])

  const handleScanStart = useCallback((scanId) => {
    setActiveScanId(scanId)
    setScanStatus('pending')
    setScanResult(null)
    setView('main')
  }, [])

  const handleLoadScan = useCallback(async (scanId) => {
    if (!api) return
    try {
      const data = await api.getScan(scanId)
      setActiveScanId(scanId)
      setScanStatus(data.status)
      setScanResult(data.result)
      setView('main')
    } catch (e) {
      console.error('Failed to load scan:', e)
    }
  }, [api])

  const handleNewScan = () => {
    setActiveScanId(null)
    setScanStatus(null)
    setScanResult(null)
    setView('main')
  }

  if (sidLoading || !shadowId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-xs" style={{ color: 'var(--green)' }}>
          initializing session<span style={{ animation: 'blink 1s step-end infinite' }}>█</span>
        </div>
      </div>
    )
  }

  return (
    <ShadowContext.Provider value={{ shadowId, api }}>
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        {/* Header */}
        <header
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }}
            />
            <span className="text-sm font-bold tracking-wider" style={{ color: 'var(--green)' }}>
              SITE<span style={{ color: 'var(--text)' }}>SCOPE</span>
            </span>
            <span
              className="px-2 py-0.5 text-xs rounded"
              style={{
                background: 'rgba(0,255,136,0.08)',
                color: 'var(--green)',
                border: '1px solid rgba(0,255,136,0.15)',
              }}
            >
              v1.0 // passive
            </span>
          </div>

          <nav className="flex items-center gap-4">
            <button
              onClick={handleNewScan}
              className="text-xs transition-colors"
              style={{ color: view === 'main' ? 'var(--text)' : 'var(--muted)' }}
            >
              SCAN
            </button>
            <button
              onClick={() => setView('history')}
              className="text-xs transition-colors"
              style={{ color: view === 'history' ? 'var(--text)' : 'var(--muted)' }}
            >
              HISTORY
            </button>
          </nav>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center px-4 py-12 gap-8">
          {view === 'history' ? (
            <ScanHistory onLoadScan={handleLoadScan} />
          ) : (
            <>
              {/* Hero */}
              {!activeScanId && (
                <div className="text-center mb-4">
                  <div className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
                    passive recon terminal
                  </div>
                  <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
                    Analyze any public website<span className="cursor" style={{ color: 'var(--green)' }} />
                  </div>
                  <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                    headers · js bundles · tech stack · dns · risk flags
                  </div>
                </div>
              )}

              <ScanInput
                onScanStart={handleScanStart}
                sessionStats={sessionStats}
                statsLoading={statsLoading}
              />

              {activeScanId && scanStatus === 'pending' && (
                <ScanLoader scanId={activeScanId} />
              )}

              {scanStatus === 'error' && (
                <div
                  className="w-full max-w-3xl p-4 rounded text-sm"
                  style={{
                    background: 'rgba(255,68,85,0.06)',
                    border: '1px solid rgba(255,68,85,0.2)',
                    color: 'var(--red)',
                  }}
                >
                  ✗ Scan failed. The target may be unreachable or have blocked requests.
                </div>
              )}

              {scanResult && scanStatus === 'complete' && (
                <ScanResults result={scanResult} />
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer
          className="px-6 py-3 border-t flex items-center justify-between"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            read-only · no active probing · no exploit testing
          </span>
          <span className="text-xs" style={{ color: 'var(--border-bright)' }}>
            SiteScope
          </span>
        </footer>
      </div>
    </ShadowContext.Provider>
  )
}
