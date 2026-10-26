import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PublicSlot } from './hooks'

/**
 * Horas en dos grupos — Mañana y Tarde — cada uno con su tira horizontal
 * deslizable y flechas propias (‹ ›) que avanzan por páginas alineadas al
 * paso de las horas y se desactivan en los extremos. La hora elegida se
 * centra sola en su fila.
 *
 * El desplazamiento es instantáneo (sin scroll suave ni rAF): el smooth del
 * navegador es poco fiable dentro de contenedores con snap, y rAF queda
 * suspendido en pestañas no visibles. Así funciona siempre.
 * El acento viene de --slot-accent.
 */

/** Fija scrollLeft de `el` en `to`, acotado al rango válido. */
function scrollToClamped(el: HTMLElement, to: number) {
  el.scrollLeft = Math.max(0, Math.min(to, el.scrollWidth - el.clientWidth))
}

export function SlotGrid({
  slots,
  selectedIso,
  loading,
  onSelect,
  skeletonCount = 10,
}: {
  slots: PublicSlot[]
  selectedIso?: string
  loading: boolean
  onSelect: (slot: PublicSlot) => void
  skeletonCount?: number
}) {
  if (loading) {
    return (
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="h-12 w-[4.25rem] shrink-0 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        No quedan horas este día. Prueba otra fecha.
      </p>
    )
  }

  const manana = slots.filter((s) => s.localMinute < 12 * 60)
  const tarde = slots.filter((s) => s.localMinute >= 12 * 60)

  return (
    <div className="space-y-4">
      <SlotGroupRow label="Mañana" slots={manana} selectedIso={selectedIso} onSelect={onSelect} />
      <SlotGroupRow label="Tarde" slots={tarde} selectedIso={selectedIso} onSelect={onSelect} />
    </div>
  )
}

/** Una fila etiquetada: rótulo + flechas arriba, tira deslizable abajo. */
function SlotGroupRow({
  label,
  slots,
  selectedIso,
  onSelect,
}: {
  label: string
  slots: PublicSlot[]
  selectedIso?: string
  onSelect: (slot: PublicSlot) => void
}) {
  const { trackRef, canLeft, canRight, updateArrows, scrollByPage, centerChip } = useTrackArrows()

  // Centra la hora seleccionada al elegir una
  useEffect(() => {
    if (!selectedIso) return
    centerChip(selectedIso)
  }, [selectedIso, centerChip])

  if (slots.length === 0) return null

  return (
    <section aria-label={`Horas de la ${label.toLowerCase()}`}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h4>
        <div className="flex gap-1.5">
          <ArrowButton direction="left" disabled={!canLeft} onClick={() => scrollByPage(-1)} />
          <ArrowButton direction="right" disabled={!canRight} onClick={() => scrollByPage(1)} />
        </div>
      </div>
      <div
        ref={trackRef}
        onScroll={updateArrows}
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slots.map((s) => {
          const active = selectedIso === s.startIso
          return (
            <button
              key={s.startIso}
              type="button"
              data-slot={s.startIso}
              onClick={() => onSelect(s)}
              aria-pressed={active}
              className={cn(
                'flex h-12 w-[4.25rem] shrink-0 items-center justify-center rounded-lg border text-sm font-medium tabular-nums shadow-sm transition-colors',
                'hover:border-[var(--slot-accent,var(--primary))]/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--slot-accent,var(--primary))]/50',
                active
                  ? 'border-transparent text-white shadow-md'
                  : 'border-border/80 bg-card',
              )}
              style={active ? { backgroundColor: 'var(--slot-accent, var(--primary))' } : undefined}
            >
              {String(Math.floor(s.localMinute / 60)).padStart(2, '0')}:
              {String(s.localMinute % 60).padStart(2, '0')}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Lógica de tira deslizable: refs, flechas y centrado del chip elegido. */
function useTrackArrows() {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    updateArrows()
    const el = trackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateArrows])

  /** Paso entre horas (ancho chip + gap), para avanzar alineado al snap. */
  function stride(el: HTMLElement): number {
    const chips = el.querySelectorAll<HTMLElement>('[data-slot]')
    return chips.length > 1 ? chips[1]!.offsetLeft - chips[0]!.offsetLeft : 76
  }

  function scrollByPage(direction: 1 | -1) {
    const el = trackRef.current
    if (!el) return
    const step = stride(el)
    const jump = Math.max(1, Math.round((el.clientWidth * 0.8) / step)) * step
    const target = el.scrollLeft + direction * jump
    // Alinear al centro de un chip para que no quede a medio corte
    const snapped = Math.round(target / step) * step - (step - 68) / 2
    scrollToClamped(el, snapped)
    // Algunos entornos no disparan scroll en scroll programático: actualizar acá
    updateArrows()
  }

  function centerChip(iso: string) {
    const el = trackRef.current
    const chip = el?.querySelector<HTMLElement>(`[data-slot="${iso}"]`)
    if (!el || !chip) return
    const target = chip.offsetLeft + chip.offsetWidth / 2 - el.clientWidth / 2
    scrollToClamped(el, target)
    updateArrows()
  }

  return { trackRef, canLeft, canRight, updateArrows, scrollByPage, centerChip }
}

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  const Chevron = direction === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'left' ? 'Ver horas anteriores' : 'Ver más horas'}
      className={cn(
        'flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-all',
        'hover:bg-accent hover:text-foreground active:scale-90',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--slot-accent,var(--primary))]/50',
        disabled && 'pointer-events-none opacity-30',
      )}
    >
      <Chevron className="size-4" />
    </button>
  )
}
