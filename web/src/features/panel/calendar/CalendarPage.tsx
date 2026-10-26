import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  Ban,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Loader2,
  X,
} from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  useAppointments,
  useCreateManualAppointment,
  useMoveAppointment,
  useProfessionals,
  useServices,
  useSetAppointmentStatus,
  type PanelAppointment,
} from '@/features/panel/hooks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NewAppointmentDialog } from './NewAppointmentDialog'

type View = 'day' | 'week' | 'month'
const TZ = 'America/Santiago'

const STATUS_LABEL: Record<PanelAppointment['status'], string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
}

function fmtDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function CalendarPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [dragged, setDragged] = useState<PanelAppointment | null>(null)
  const [detail, setDetail] = useState<PanelAppointment | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [newSlot, setNewSlot] = useState<{ date: string; minute: number } | null>(null)

  const move = useMoveAppointment()
  const setStatus = useSetAppointmentStatus()

  // Rango de consulta según vista
  const { from, to } = useMemo(() => {
    const d = new Date(anchor)
    if (view === 'day') {
      return { from: fmtDay(d), to: fmtDay(d) }
    }
    if (view === 'week') {
      const dow = (d.getDay() + 6) % 7 // lunes 0
      const monday = new Date(d)
      monday.setDate(d.getDate() - dow)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      return { from: fmtDay(monday), to: fmtDay(sunday) }
    }
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { from: fmtDay(first), to: fmtDay(last) }
  }, [anchor, view])

  const { data: appts, isLoading } = useAppointments(from, to)

  function shift(delta: number) {
    const d = new Date(anchor)
    if (view === 'day') d.setDate(d.getDate() + delta)
    else if (view === 'week') d.setDate(d.getDate() + delta * 7)
    else d.setMonth(d.getMonth() + delta)
    setAnchor(d)
  }

  const periodLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' })
    if (view === 'month') {
      return fmt.format(anchor).replace(/^\w/, (c) => c.toUpperCase())
    }
    if (view === 'day') {
      return new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
        .format(anchor)
        .replace(/^\w/, (c) => c.toUpperCase())
    }
    const [f, t] = [new Date(`${from}T12:00:00`), new Date(`${to}T12:00:00`)]
    const sameMonth = f.getMonth() === t.getMonth()
    const fTxt = new Intl.DateTimeFormat('es-CL', { day: 'numeric', ...(sameMonth ? {} : { month: 'short' }) }).format(f)
    const tTxt = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long' }).format(t)
    return `${fTxt} – ${tTxt}`.replace(/^\w/, (c) => c.toUpperCase())
  }, [anchor, view, from, to])

  async function handleDrop(date: string, minute: number) {
    if (!dragged) return
    try {
      const res = await move.mutateAsync({ id: dragged.id, date, minuteOfDay: minute })
      toast.success(res.moved ? 'Cita movida' : 'Sin cambios')
      setDragged(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo mover la cita')
    }
  }

  function openNewAt(date: string, minute: number) {
    setNewSlot({ date, minute })
    setNewOpen(true)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Arrastra las citas para reprogramarlas. Clic en una hora libre para crear.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/70 bg-card p-0.5 shadow-sm" role="tablist" aria-label="Vista del calendario">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  view === v ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <Button onClick={() => { setNewSlot(null); setNewOpen(true) }}>
            <CalendarPlus className="size-4" />
            Nueva cita
          </Button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="text-sm font-semibold capitalize">{periodLabel}</p>
        <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
          Hoy
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-[520px] w-full rounded-xl" />
      ) : (
        <div className="mt-4">
          {view === 'month' ? (
            <MonthView
              anchor={anchor}
              appointments={appts ?? []}
              onSelectDay={(d) => {
                setAnchor(new Date(`${d}T12:00:00`))
                setView('day')
              }}
            />
          ) : view === 'week' ? (
            <WeekView
              from={from}
              appointments={appts ?? []}
              dragged={dragged}
              onDragStart={setDragged}
              onDrop={handleDrop}
              onSelect={setDetail}
              onNewAt={openNewAt}
              onOpenDay={(d) => { setAnchor(new Date(`${d}T12:00:00`)); setView('day') }}
            />
          ) : (
            <DayView
              date={from}
              appointments={appts ?? []}
              dragged={dragged}
              onDragStart={setDragged}
              onDrop={handleDrop}
              onSelect={setDetail}
              onNewAt={openNewAt}
            />
          )}
        </div>
      )}

      <NewAppointmentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        presetSlot={newSlot}
      />

      <AppointmentDetailDialog
        appointment={detail}
        onClose={() => setDetail(null)}
        onChangeStatus={async (status, reason) => {
          if (!detail) return
          try {
            await setStatus.mutateAsync({ id: detail.id, status, reason })
            toast.success(`Cita marcada como «${STATUS_LABEL[status]}»`)
            setDetail(null)
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar')
          }
        }}
        changing={setStatus.isPending}
      />
    </div>
  )
}

// ---------- Vista de mes ----------

function MonthView({
  anchor,
  appointments,
  onSelectDay,
}: {
  anchor: Date
  appointments: PanelAppointment[]
  onSelectDay: (date: string) => void
}) {
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const first = new Date(y, m, 1)
  const lead = (first.getDay() + 6) % 7
  const total = new Date(y, m + 1, 0).getDate()
  const todayStr = fmtDay(new Date())

  const byDay = new Map<string, PanelAppointment[]>()
  for (const a of appointments) {
    const d = a.startAt.slice(0, 10)
    const list = byDay.get(d) ?? []
    list.push(a)
    byDay.set(d, list)
  }

  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null)]
  for (let d = 1; d <= total; d++) cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <div className="grid grid-cols-7 border-b border-border/60 text-center text-[11px] font-medium text-muted-foreground">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <span key={d} className="py-2">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} className="min-h-24 border-b border-r border-border/40 bg-muted/20" aria-hidden="true" />
          const dayAppts = byDay.get(cell) ?? []
          const isToday = cell === todayStr
          return (
            <button
              key={cell}
              onClick={() => onSelectDay(cell)}
              className={cn(
                'min-h-24 border-b border-r border-border/40 p-1.5 text-left transition-colors hover:bg-accent/50',
                (i + 1) % 7 === 0 && 'border-r-0',
              )}
            >
              <span
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-full text-xs font-medium',
                  isToday && 'bg-primary text-primary-foreground',
                )}
              >
                {Number(cell.slice(8))}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayAppts.slice(0, 2).map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      'truncate rounded px-1 py-0.5 text-[10px]',
                      a.status === 'cancelled' || a.status === 'no_show'
                        ? 'bg-muted text-muted-foreground line-through'
                        : 'bg-primary/10 text-primary',
                    )}
                  >
                    {a.startAt.slice(11, 16)} {a.customerName.split(' ')[0]}
                  </div>
                ))}
                {dayAppts.length > 2 && (
                  <div className="px-1 text-[10px] text-muted-foreground">+{dayAppts.length - 2} más</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Vistas de semana y día (rejilla de horas) ----------

const START_HOUR = 8
const END_HOUR = 20
const PX_PER_MIN = 1.1

function TimeGrid({
  days,
  appointments,
  dragged,
  onDragStart,
  onDrop,
  onSelect,
  onNewAt,
}: {
  days: string[]
  appointments: PanelAppointment[]
  dragged: PanelAppointment | null
  onDragStart: (a: PanelAppointment) => void
  onDrop: (date: string, minute: number) => void
  onSelect: (a: PanelAppointment) => void
  onNewAt: (date: string, minute: number) => void
}) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const todayStr = fmtDay(new Date())

  const byDayCol = new Map<string, { active: PanelAppointment[]; inactive: PanelAppointment[] }>()
  for (const d of days) byDayCol.set(d, { active: [], inactive: [] })
  for (const a of appointments) {
    const d = a.startAt.slice(0, 10)
    const col = byDayCol.get(d)
    if (!col) continue
    if (a.status === 'cancelled' || a.status === 'no_show') col.inactive.push(a)
    else col.active.push(a)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        {/* Encabezado */}
        <div className="border-b border-r border-border/60" />
        {days.map((d) => {
          const date = new Date(`${d}T12:00:00`)
          const isToday = d === todayStr
          return (
            <div
              key={d}
              className={cn(
                'border-b border-border/60 py-2 text-center',
                days.length > 1 && 'border-r last:border-r-0 border-border/40',
              )}
            >
              <p className="text-[11px] font-medium text-muted-foreground">
                {new Intl.DateTimeFormat('es-CL', { weekday: 'short' }).format(date).replace('.', '')}
              </p>
              <p
                className={cn(
                  'mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                  isToday && 'bg-primary text-primary-foreground',
                )}
              >
                {Number(d.slice(8))}
              </p>
            </div>
          )
        })}
      </div>

      <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        {/* Columna de horas */}
        <div className="border-r border-border/60">
          {hours.map((h) => (
            <div key={h} className="relative" style={{ height: 60 * PX_PER_MIN }}>
              <span className="absolute -top-2 right-1.5 text-[10px] text-muted-foreground">
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Columnas de días */}
        {days.map((d) => (
          <div
            key={d}
            className={cn('relative', days.length > 1 && 'border-r last:border-r-0 border-border/40')}
            style={{ height: (END_HOUR - START_HOUR) * 60 * PX_PER_MIN }}
            onDragOver={(e) => {
              if (dragged) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const rect = e.currentTarget.getBoundingClientRect()
              const y = e.clientY - rect.top
              const minute = START_HOUR * 60 + Math.round(y / PX_PER_MIN / 15) * 15
              onDrop(d, Math.min(minute, END_HOUR * 60 - 30))
            }}
          >
            {/* Líneas de hora */}
            {hours.map((h) => (
              <div key={h} className="border-b border-border/30" style={{ height: 60 * PX_PER_MIN }} />
            ))}

            {/* Clic en hora libre */}
            <button
              type="button"
              className="absolute inset-0 cursor-cell"
              aria-label={`Nueva cita el ${d}`}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const y = e.clientY - rect.top
                const minute = START_HOUR * 60 + Math.round(y / PX_PER_MIN / 15) * 15
                onNewAt(d, Math.max(0, Math.min(minute, END_HOUR * 60 - 15)))
              }}
            />

            {/* Citas */}
            {[...byDayCol.get(d)!.active, ...byDayCol.get(d)!.inactive].map((a) => {
              const startMin = Number(a.startAt.slice(11, 13)) * 60 + Number(a.startAt.slice(14, 16))
              const endMin = Number(a.endAt.slice(11, 13)) * 60 + Number(a.endAt.slice(14, 16))
              // Hora local de Chile: los ISO vienen en UTC; convertir para pintar
              const local = toLocalMinutes(a.startAt, a.endAt)
              const top = (local.start - START_HOUR * 60) * PX_PER_MIN
              const height = Math.max(24, (local.end - local.start) * PX_PER_MIN - 2)
              const inactive = a.status === 'cancelled' || a.status === 'no_show'
              return (
                <button
                  key={a.id}
                  draggable={!inactive}
                  onDragStart={() => onDragStart(a)}
                  onClick={() => onSelect(a)}
                  style={{ top, height, zIndex: 2 }}
                  className={cn(
                    'absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1 text-left shadow-sm transition-colors',
                    inactive
                      ? 'border-border bg-muted text-muted-foreground'
                      : a.status === 'pending'
                        ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
                        : 'border-primary/30 bg-primary/10 hover:bg-primary/20',
                    dragged?.id === a.id && 'opacity-40',
                  )}
                >
                  <span className={cn('block truncate text-[11px] font-semibold', inactive && 'line-through')}>
                    {local.startLabel} · {a.customerName}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {a.serviceName}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Convierte UTC ISO a minutos locales de Chile para pintar la rejilla. */
function toLocalMinutes(startIso: string, endIso: string): { start: number; end: number; startLabel: string } {
  const fmt = new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = (iso: string) => {
    const [h, m] = fmt.format(new Date(iso)).split(':').map(Number)
    return (h! % 24) * 60 + (m ?? 0)
  }
  return {
    start: parts(startIso),
    end: parts(endIso),
    startLabel: fmt.format(new Date(startIso)),
  }
}

function WeekView(props: {
  from: string
  appointments: PanelAppointment[]
  dragged: PanelAppointment | null
  onDragStart: (a: PanelAppointment) => void
  onDrop: (date: string, minute: number) => void
  onSelect: (a: PanelAppointment) => void
  onNewAt: (date: string, minute: number) => void
  onOpenDay: (date: string) => void
}) {
  const days = useMemo(() => {
    const list: string[] = []
    const cursor = new Date(`${props.from}T12:00:00`)
    for (let i = 0; i < 7; i++) {
      list.push(fmtDay(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return list
  }, [props.from])
  void props.onOpenDay
  return <TimeGrid {...props} days={days} />
}

function DayView(props: {
  date: string
  appointments: PanelAppointment[]
  dragged: PanelAppointment | null
  onDragStart: (a: PanelAppointment) => void
  onDrop: (date: string, minute: number) => void
  onSelect: (a: PanelAppointment) => void
  onNewAt: (date: string, minute: number) => void
}) {
  return <TimeGrid {...props} days={[props.date]} />
}

// ---------- Detalle de cita ----------

function AppointmentDetailDialog({
  appointment,
  onClose,
  onChangeStatus,
  changing,
}: {
  appointment: PanelAppointment | null
  onClose: () => void
  onChangeStatus: (status: PanelAppointment['status'], reason?: string) => Promise<void>
  changing: boolean
}) {
  return (
    <Dialog open={!!appointment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        {appointment && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-3">
                <span className="truncate">{appointment.customerName}</span>
                <StatusChip status={appointment.status} />
              </DialogTitle>
              <DialogDescription>
                {new Intl.DateTimeFormat('es-CL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: TZ,
                  hour12: false,
                })
                  .format(new Date(appointment.startAt))
                  .replace(/^\w/, (c) => c.toUpperCase())}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 text-sm">
              <p className="flex justify-between gap-4">
                <span className="text-muted-foreground">Servicio</span>
                <span className="text-right font-medium">{appointment.serviceName}</span>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-muted-foreground">Profesional</span>
                <span className="font-medium">{appointment.professionalName}</span>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-muted-foreground">Teléfono</span>
                <span className="font-medium">{appointment.customerPhone ?? '—'}</span>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-muted-foreground">Precio</span>
                <span className="font-medium">
                  {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(appointment.priceClp)}
                </span>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-muted-foreground">Origen</span>
                <Badge variant={appointment.source === 'public' ? 'success' : 'secondary'}>
                  {appointment.source === 'public' ? 'Online' : 'Manual'}
                </Badge>
              </p>
              {appointment.notes && (
                <p className="rounded-lg bg-muted p-2.5 text-[13px] text-muted-foreground">{appointment.notes}</p>
              )}
            </div>
            <DialogFooter className="mt-2 flex-wrap">
              {appointment.status !== 'confirmed' && appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                <Button
                  size="sm"
                  disabled={changing}
                  onClick={() => onChangeStatus('confirmed')}
                >
                  <Check className="size-3.5" /> Confirmar
                </Button>
              )}
              {appointment.status === 'confirmed' || appointment.status === 'pending' ? (
                <>
                  <Button size="sm" variant="outline" disabled={changing} onClick={() => onChangeStatus('completed')}>
                    <Check className="size-3.5" /> Completada
                  </Button>
                  <Button size="sm" variant="outline" disabled={changing} onClick={() => onChangeStatus('no_show')}>
                    <CircleAlert className="size-3.5" /> No asistió
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={changing}
                    onClick={() => onChangeStatus('cancelled', 'Cancelada por el negocio')}
                  >
                    <X className="size-3.5" /> Cancelar
                  </Button>
                </>
              ) : null}
              {appointment.status === 'cancelled' && (
                <Button size="sm" variant="outline" disabled={changing} onClick={() => onChangeStatus('confirmed')}>
                  <Ban className="size-3.5" /> Reactivar
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatusChip({ status }: { status: PanelAppointment['status'] }) {
  const styles: Record<PanelAppointment['status'], string> = {
    pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    confirmed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    completed: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    cancelled: 'bg-destructive/10 text-destructive',
    no_show: 'bg-muted text-muted-foreground',
  }
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', styles[status])}>{STATUS_LABEL[status]}</span>
}

export { NewAppointmentDialog }
