import { motion } from 'framer-motion'

export default function Why() {
    return (
        <motion.div
            className="w-full max-w-4xl mx-auto space-y-12 pb-20"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            {/* Header section */}
            <section className="space-y-4">
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
                    SiteScope: <span style={{ color: 'var(--green)' }}>Building a Stealth Recon Terminal</span>
                </h1>
                <p className="text-sm italic border-l-2 pl-4 py-1" style={{ borderColor: 'var(--green)', color: 'var(--text-dim)' }}>
                    Passive web reconnaissance, reimagined. SiteScope is a terminal-inspired tool designed to analyze public websites through a privacy-first, read-only lens—mimicking exactly what a browser does, without the noise.
                </p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-sm leading-relaxed">

                {/* Why SiteScope? */}
                <section className="space-y-4">
                    <h2 className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--green)' }}>01 // The Hook</h2>
                    <p style={{ color: 'var(--text-dim)' }}>
                        Most reconnaissance tools are "loud." They probe ports, run active scans, and often trigger security alerts before you've even looked at the homepage.
                    </p>
                    <p style={{ color: 'var(--text)' }}>
                        I wanted to build something different: a tool that performs <strong style={{ color: 'var(--green)' }}>deep analysis</strong> using only public, read-only HTTP requests—essentially a "browser in a terminal" that extracts the hidden DNA of a website.
                    </p>
                </section>

                {/* Tech Stack */}
                <section className="space-y-4">
                    <h2 className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--green)' }}>02 // Tech Stack</h2>
                    <ul className="space-y-2 list-none p-0" style={{ color: 'var(--text-dim)' }}>
                        <li className="flex gap-2"><span style={{ color: 'var(--green)' }}>›</span> <strong>Backend:</strong> FastAPI + aiosqlite</li>
                        <li className="flex gap-2"><span style={{ color: 'var(--green)' }}>›</span> <strong>Frontend:</strong> React + Vite + Framer Motion</li>
                        <li className="flex gap-2"><span style={{ color: 'var(--green)' }}>›</span> <strong>Styling:</strong> Tailwind CSS</li>
                        <li className="flex gap-2"><span style={{ color: 'var(--green)' }}>›</span> <strong>Infra:</strong> Docker + Kubernetes</li>
                    </ul>
                </section>

                {/* 5-Pass Analysis */}
                <section className="space-y-4">
                    <h2 className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--green)' }}>03 // Analysis Engine</h2>
                    <p style={{ color: 'var(--text-dim)' }}>
                        SiteScope breaks down targets into five distinct "passes" running in parallel:
                    </p>
                    <ol className="space-y-2 list-none p-0" style={{ color: 'var(--text-dim)' }}>
                        <li className="flex gap-2"><span style={{ color: 'var(--green)' }}>1.</span> HTTP Fingerprinting</li>
                        <li className="flex gap-2"><span style={{ color: 'var(--green)' }}>2.</span> HTML Surface Analysis</li>
                        <li className="flex gap-2"><span style={{ color: 'var(--green)' }}>3.</span> JS Bundle Recovery (Source Maps)</li>
                        <li className="flex gap-2"><span style={{ color: 'var(--green)' }}>4.</span> Tech Stack Signatures</li>
                        <li className="flex gap-2"><span style={{ color: 'var(--green)' }}>5.</span> Passive DNS Intel (DoH)</li>
                    </ol>
                </section>

                {/* Privacy */}
                <section className="space-y-4">
                    <h2 className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--green)' }}>04 // Shadow ID</h2>
                    <p style={{ color: 'var(--text-dim)' }}>
                        SiteScope is usable without accounts. The <strong>Shadow ID</strong> system generates an ephemeral SHA-256 hash using the Web Crypto API.
                    </p>
                    <p style={{ color: 'var(--text-dim)' }}>
                        No data is persisted between browser sessions, and no cookies are ever set. Total privacy by design.
                    </p>
                </section>

                {/* Security */}
                <section className="space-y-4 md:col-span-2">
                    <h2 className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--green)' }}>05 // Security-First</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="p-4 border border-zinc-800 rounded bg-black/20">
                            <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>SSRF Guard</div>
                            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Pre-resolving DNS to block private/loopback IPs.</p>
                        </div>
                        <div className="p-4 border border-zinc-800 rounded bg-black/20">
                            <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>ReDoS Protection</div>
                            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Linear-time patterns capped at 500KB scans.</p>
                        </div>
                        <div className="p-4 border border-zinc-800 rounded bg-black/20">
                            <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>Strict CSP</div>
                            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Fail-closed security headers on all responses.</p>
                        </div>
                    </div>
                </section>

            </div>

            <footer className="pt-12 border-t flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                    terminal aesthetic · stealth recon · passive mode
                </div>
                <button
                    onClick={() => window.location.hash = ''}
                    className="text-xs px-3 py-1 border hover:bg-green-500/10 transition-colors"
                    style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
                >
                    &lt; RETURN TO TERMINAL
                </button>
            </footer>
        </motion.div>
    )
}
