import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

/**
 * Widget de Cloudflare Turnstile (anti-spam). Solo se monta si el backend
 * expone un siteKey; en desarrollo no se muestra.
 */
export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string | null
  onToken: (token: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!siteKey) return
    function render() {
      if (!ref.current || !window.turnstile || widgetId.current) return
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        callback: (token: string) => onToken(token),
      })
    }
    if (window.turnstile) {
      setReady(true)
      render()
      return
    }
    // Carga el script una sola vez
    window.onTurnstileLoad = () => {
      setReady(true)
      render()
    }
    if (!document.querySelector('script[data-turnstile]')) {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.defer = true
      s.dataset['turnstile'] = 'true'
      document.head.append(s)
    }
    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }
  }, [siteKey, onToken])

  if (!siteKey) return null
  return (
    <div ref={ref} role="complementary" aria-label="Verificación anti-spam">
      {!ready && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
    </div>
  )
}
