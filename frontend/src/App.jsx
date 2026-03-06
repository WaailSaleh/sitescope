import { createContext, useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useShadowId } from './hooks/useShadowId'
import { createApiService, ApiError } from './services/api'
import ScanInput from './components/ScanInput'
import ScanResults from './components/ScanResults'
import ScanLoader from './components/ScanLoader'
import ScanHistory from './components/ScanHistory'
import Why from './components/Why'
import sitescopeIcon from './assets/sitescope-icon.svg'
import './index.css'

export const ShadowContext = createContext(null)

const POLL_INTERVAL = 2000

export default function App() {
  const { shadowId, loading: sidLoading } = useShadowId()
  const [api, setApi] = useState(null)

  const [activeScanId, setActiveScanId] = useState(null)
  const [scanStatus, setScanStatus] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [sessionStats, setSessionStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [view, setView] = useState('main') // 'main' | 'history' | 'why'

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#why') setView('why')
      else if (view === 'why') setView('main')
    }
    window.addEventListener('hashchange', handleHash)
    handleHash()
    return () => window.removeEventListener('hashchange', handleHash)
  }, [view])

  useEffect(() => {
    if (shadowId) setApi(createApiService(shadowId))
  }, [shadowId])

  useEffect(() => {
    if (!api) return
    api.getSessionStats()
      .then(stats => { setSessionStats(stats); setStatsLoading(false) })
      .catch(() => setStatsLoading(false))
  }, [api])

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
          api.getSessionStats().then(s => setSessionStats(s)).catch(() => { })
        }
      } catch {
        if (!cancelled) setScanStatus('error')
      }
    }
    poll()
    const interval = setInterval(poll, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(interval) }
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
        <motion.div
          className="text-xs"
          style={{ color: 'var(--green)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          initializing session<span style={{ animation: 'blink 1s step-end infinite' }}>█</span>
        </motion.div>
      </div>
    )
  }

  return (
    <ShadowContext.Provider value={{ shadowId, api }}>
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>

        {/* Header */}
        <motion.header
          className="flex items-center justify-between px-4 sm:px-6 lg:px-10 2xl:px-16 py-3 sm:py-4 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className="flex items-center gap-3">
            <motion.img
              src={sitescopeIcon}
              alt="SiteScope Logo"
              className="w-8 h-8"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
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
            {['SCAN', 'HISTORY'].map((label) => {
              const active = label === 'SCAN' ? view === 'main' : view === 'history'
              return (
                <motion.button
                  key={label}
                  onClick={label === 'SCAN' ? handleNewScan : () => setView('history')}
                  className="text-xs relative py-1"
                  style={{ color: active ? 'var(--text)' : 'var(--muted)' }}
                  whileHover={{ color: 'var(--text)' }}
                  transition={{ duration: 0.15 }}
                >
                  {label}
                  {active && (
                    <motion.div
                      layoutId="nav-underline"
                      className="absolute bottom-0 left-0 right-0 h-px"
                      style={{ background: 'var(--green)', boxShadow: '0 0 4px var(--green)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </motion.button>
              )
            })}
          </nav>
        </motion.header>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center px-3 sm:px-6 lg:px-10 2xl:px-16 py-8 sm:py-12 gap-6 sm:gap-8">
          <div className="w-full max-w-3xl xl:max-w-5xl 2xl:max-w-6xl mx-auto flex flex-col gap-6 sm:gap-8">
            <AnimatePresence mode="wait">
              {view === 'why' ? (
                <Why key="why" />
              ) : view === 'history' ? (
                <motion.div
                  key="history"
                  className="w-full flex flex-col items-center"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.25 }}
                >
                  <ScanHistory onLoadScan={handleLoadScan} />
                </motion.div>
              ) : (
                <motion.div
                  key="main"
                  className="w-full flex flex-col items-center gap-8"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.25 }}
                >
                  {/* Hero */}
                  <AnimatePresence>
                    {!activeScanId && (
                      <motion.div
                        className="text-center mb-4"
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12, scale: 0.97 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="text-xs tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>
                          passive recon terminal
                        </div>
                        <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
                          Analyze any public website<span className="cursor" style={{ color: 'var(--green)' }} />
                        </div>
                        <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                          headers · js bundles · tech stack · dns · risk flags
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <ScanInput
                    onScanStart={handleScanStart}
                    sessionStats={sessionStats}
                    statsLoading={statsLoading}
                  />

                  <AnimatePresence mode="wait">
                    {activeScanId && scanStatus === 'pending' && (
                      <motion.div
                        key="loader"
                        className="w-full max-w-3xl"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.25 }}
                      >
                        <ScanLoader scanId={activeScanId} />
                      </motion.div>
                    )}

                    {scanStatus === 'error' && (
                      <motion.div
                        key="error"
                        className="w-full max-w-3xl p-4 rounded text-sm"
                        style={{
                          background: 'rgba(255,68,85,0.06)',
                          border: '1px solid rgba(255,68,85,0.2)',
                          color: 'var(--red)',
                        }}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        ✗ Scan failed. The target may be unreachable or have blocked requests.
                      </motion.div>
                    )}

                    {scanResult && scanStatus === 'complete' && (
                      <motion.div
                        key="results"
                        className="w-full"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                      >
                        <ScanResults result={scanResult} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Footer */}
        <motion.footer
          className="px-4 sm:px-6 lg:px-10 2xl:px-16 py-3 border-t flex items-center justify-between"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            read-only · no active probing · no exploit testing
          </span>
          <span className="text-xs" style={{ color: 'var(--border-bright)' }}>
            SiteScope
          </span>
        </motion.footer>
      </div>
    </ShadowContext.Provider>
  )
}
