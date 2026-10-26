import { Link } from 'react-router'
import { LogoWordmark } from '@/components/logo'

/** Contenedor compartido de las pantallas de acceso: centrado, limpio, con marca. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-primary/10 via-primary/4 to-transparent blur-3xl"
      />
      <div
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex justify-center">
          <Link to="/" aria-label="Volver al inicio">
            <LogoWordmark />
          </Link>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-7 shadow-xl shadow-black/[0.04] dark:shadow-black/20">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </div>
  )
}
