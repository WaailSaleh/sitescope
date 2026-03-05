import { useState, useEffect } from 'react'

async function generateCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 50
    const ctx = canvas.getContext('2d')
    ctx.textBaseline = 'alphabetic'
    ctx.font = '14px JetBrains Mono'
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('SiteScope🔍', 2, 15)
    ctx.fillStyle = 'rgba(102,204,0,0.7)'
    ctx.fillText('SiteScope🔍', 4, 17)
    return canvas.toDataURL()
  } catch {
    return 'canvas-blocked'
  }
}

async function buildFingerprint() {
  const canvas = await generateCanvasFingerprint()

  const components = [
    navigator.userAgent,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    String(navigator.hardwareConcurrency || 0),
    navigator.platform || '',
    canvas,
  ]

  const raw = components.join('||')
  const encoder = new TextEncoder()
  const data = encoder.encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useShadowId() {
  const [shadowId, setShadowId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    buildFingerprint()
      .then(id => {
        setShadowId(id)
        setLoading(false)
      })
      .catch(() => {
        // Fallback: use a random ID if crypto fails
        const fallback = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0')).join('')
        setShadowId(fallback)
        setLoading(false)
      })
  }, [])

  return { shadowId, loading }
}
