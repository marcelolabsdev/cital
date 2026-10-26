import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CalendarCheck,
  CalendarX2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  UserRound,
} from 'lucide-react'
import { ApiError } from '@/lib/api'
import { formatClp } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  useCancelBooking,
  useManagedBooking,
  useRescheduleBooking,
  useAvailableDays,
  useSlots,
  type PublicSlot,
} from './hooks'
import { Button } from '@/components/ui/button'
import { SlotGrid } from './DateTimeShared'

const WEEKDAYS_MIN = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default function ManageBookingPage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, isError } = useManagedBooking(token ?? '')
  const [rescheduling, setRescheduling] = useState(false)

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-4 px-5 py-10">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Shell>
        <div className="flex flex-col items-center py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <CalendarX2 className="size-6 text-muted-foreground" />
          </span>
          <h1 className="mt-5 text-lg font-semibold tracking-tight">Reserva no encontrada</h1>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            El enlace puede haber expirado o estar incompleto.
          </p>
        </div>
      </Shell>
    )
  }

  const appt = data.appointment
  const active = appt.status === 'pending' || appt.status === 'confirmed'

  return (
    <Shell>
      {rescheduling && active ? (
        <RescheduleView token={token ?? ''} slug={appt.tenantSlug} serviceId={appt.serviceId} onDone={() => setRescheduling(false)} />
      ) : (
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tu reserva</h1>

          <div className="mt-5 rounded-xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{appt.serviceName}</p>
              <StatusBadge status={appt.status} />
            </div>
            <div className="mt-3 grid gap-1.5 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <CalendarCheck className="size-4 shrink-0" />
                {formatStart(appt.startAt)}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="size-4 shrink-0" />
                {appt.serviceDurationMinutes} min · {formatClp(appt.priceClp)}
              </p>
              <p className="flex items-center gap-2">
                <UserRound className="size-4 shrink-0" />
                {appt.professionalName}
              </p>
            </div>
            {appt.status === 'cancelled' && appt.cancelReason && (
              <p className="mt-3 rounded-lg bg-muted p-3 text-[13px] text-muted-foreground">
                Cancelada: {appt.cancelReason}
              </p>
            )}
          </div>

          {active && (
            <div className="mt-5 grid gap-2.5">
              <Button onClick={() => setRescheduling(true)}>Reprogramar</Button>
              <CancelAction token={token ?? ''} />
            </div>
          )}

          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            ¿Quieres otra hora?{' '}
            <Link to={`/r/${appt.tenantSlug}`} className="font-medium text-foreground hover:underline">
              Reserva de nuevo
            </Link>
          </p>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-lg px-5 pb-16 pt-10">{children}</div>
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'cancelled') {
    return <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">Cancelada</span>
  }
  if (status === 'completed') {
    return <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">Completada</span>
  }
  if (status === 'no_show') {
    return <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600">No asistió</span>
  }
  if (status === 'confirmed') {
    return <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">Confirmada</span>
  }
  return <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Pendiente</span>
}

function formatStart(isoUtc: string): string {
  const date = new Date(isoUtc)
  const fmt = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Santiago',
    hour12: false,
  })
  return fmt.format(date).replace(/^\w/, (c) => c.toUpperCase())
}

function CancelAction({ token }: { token: string }) {
  const cancel = useCancelBooking(token)
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-medium">¿Cancelar tu reserva?</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          La hora quedará liberada para otras personas.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={cancel.isPending}
            onClick={async () => {
              try {
                await cancel.mutateAsync()
                toast.success('Reserva cancelada')
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'No se pudo cancelar')
              }
            }}
          >
            {cancel.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Sí, cancelar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
            Volver
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button variant="outline" onClick={() => setConfirming(true)}>
      <CalendarX2 className="size-4" />
      Cancelar reserva
    </Button>
  )
}

/** Reprogramación: elegir nueva fecha/hora con el mismo servicio. */
function RescheduleView({
  token,
  slug,
  serviceId,
  onDone,
}: {
  token: string
  slug: string
  serviceId: string
  onDone: () => void
}) {
  const [date, setDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<PublicSlot | null>(null)

  return (
    <div>
      <button
        type="button"
        onClick={onDone}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a mi reserva
      </button>
      <h1 className="text-xl font-semibold tracking-tight">Reprogramar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Elige una nueva fecha y hora. Tu reserva actual se reemplazará.
      </p>
      <ReschedulePicker
        token={token}
        slug={slug}
        serviceId={serviceId}
        date={date}
        slot={slot}
        onPickDate={(d) => {
          setDate(d)
          setSlot(null)
        }}
        onPickSlot={setSlot}
        onDone={onDone}
      />
    </div>
  )
}

function ReschedulePicker({
  token,
  slug,
  serviceId,
  date,
  slot,
  onPickDate,
  onPickSlot,
  onDone,
}: {
  token: string
  slug: string
  serviceId: string
  date: string | null
  slot: PublicSlot | null
  onPickDate: (d: string) => void
  onPickSlot: (s: PublicSlot) => void
  onDone: () => void
}) {
  const today = new Date()
  const [monthCursor, setMonthCursor] = useState(today.toISOString().slice(0, 7))
  const { data: daysData, isLoading: daysLoading } = useAvailableDays(slug, serviceId, monthCursor, null)
  const { data: slotsData, isLoading: slotsLoading } = useSlots(slug, serviceId, date ?? '', null)
  const reschedule = useRescheduleBooking(token)

  const availableDays = new Set(daysData?.days ?? [])
  const todayStr = today.toISOString().slice(0, 10)
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1).toISOString().slice(0, 7)

  const [y, m] = monthCursor.split('-').map(Number)
  const first = new Date(y!, (m! - 1), 1)
  const lead = (first.getDay() + 6) % 7
  const total = new Date(y!, m!, 0).getDate()
  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null)]
  for (let d = 1; d <= total; d++) cells.push(`${monthCursor}-${String(d).padStart(2, '0')}`)

  return (
    <div className="mt-5">
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            disabled={monthCursor <= todayStr.slice(0, 7)}
            onClick={() => shift(-1)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="text-sm font-semibold capitalize">
            {MONTHS_ES[(m ?? 1) - 1]} {y}
          </p>
          <button
            type="button"
            disabled={monthCursor >= maxMonth}
            onClick={() => shift(1)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS_MIN.map((d, i) => (
            <span key={i} className="pb-1 text-[11px] font-medium text-muted-foreground">
              {d}
            </span>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <span key={`e${i}`} />
            const selectable = cell >= todayStr && availableDays.has(cell)
            const active = date === cell
            return (
              <button
                key={cell}
                type="button"
                disabled={!selectable}
                aria-pressed={active}
                onClick={() => onPickDate(cell)}
                className={cn(
                  'flex h-9 w-full items-center justify-center rounded-lg text-sm transition-colors',
                  selectable ? 'hover:bg-accent' : 'text-muted-foreground/40',
                  active && 'bg-primary font-semibold text-white hover:bg-primary',
                )}
              >
                {Number(cell.slice(8))}
              </button>
            )
          })}
        </div>
        {daysLoading && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Buscando días con hora…</p>
        )}
      </div>

      {date && (
        <div className="mt-5">
          <h2 className="mb-3 text-sm font-semibold">Horas disponibles</h2>
          <SlotGrid
            slots={slotsData?.slots ?? []}
            selectedIso={slot?.startIso}
            loading={slotsLoading}
            onSelect={onPickSlot}
          />
        </div>
      )}

      <Button
        className="mt-6 w-full"
        size="lg"
        disabled={!slot || reschedule.isPending}
        onClick={async () => {
          if (!slot) return
          try {
            await reschedule.mutateAsync({ professionalId: slot.professionalId, startIso: slot.startIso })
            toast.success('Reserva reprogramada')
            onDone()
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'No se pudo reprogramar')
          }
        }}
      >
        {reschedule.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Confirmar nueva hora
      </Button>
    </div>
  )

  function shift(delta: number) {
    const [yy, mm] = monthCursor.split('-').map(Number)
    const next = new Date(yy!, (mm! - 1) + delta, 1)
    setMonthCursor(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }
}
