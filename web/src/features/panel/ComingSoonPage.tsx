import { Hourglass } from 'lucide-react'

/** Pantalla para secciones del panel que se habilitan en fases siguientes. */
export function ComingSoonPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-1 items-center justify-center py-20">
      <div
        className="flex flex-col items-center text-center"
      >
        <span className="flex size-14 items-center justify-center rounded-2xl border border-border/70 bg-card text-muted-foreground shadow-sm">
          <Hourglass className="size-6" />
        </span>
        <h1 className="mt-5 text-lg font-semibold tracking-tight">Sección en camino</h1>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Estamos construyendo cital por partes. Esta sección se habilitará en una
          próxima actualización.
        </p>
      </div>
    </div>
  )
}
