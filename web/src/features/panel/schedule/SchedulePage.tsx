import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Plus, Trash2, CalendarOff, Save, Sparkles, Loader2 } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  useBlocks,
  useCreateBlock,
  useDeleteBlock,
  useProfessionals,
  useSchedules,
  useSaveSchedule,
  useSeedHolidays,
} from '@/features/panel/hooks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { NativeSelect } from '@/components/ui/native-select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatLocalDateRange } from '@/lib/format'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

interface DayState {
  active: boolean
  ranges: { start: string; end: string }[] // 'HH:MM'
}

function minutesToHm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function defaultWeek(): DayState[] {
  return Array.from({ length: 7 }, (_, d) =>
    d < 5 ? { active: true, ranges: [{ start: '09:00', end: '18:30' }] } : { active: false, ranges: [] },
  )
}

export function SchedulePage() {
  const { data: team } = useProfessionals()
  const [scope, setScope] = useState<'business' | string>('business')
  const { data: intervals, isLoading } = useSchedules(scope === 'business' ? null : scope)

  const [week, setWeek] = useState<DayState[]>(defaultWeek())
  const [dirty, setDirty] = useState(false)
  const save = useSaveSchedule()

  useEffect(() => {
    if (!intervals) return
    const next = defaultWeek().map((d) => ({ ...d, active: false, ranges: [] as { start: string; end: string }[] }))
    for (const iv of intervals) {
      next[iv.weekday] = {
        active: true,
        ranges: [...next[iv.weekday]!.ranges, { start: minutesToHm(iv.startMinute), end: minutesToHm(iv.endMinute) }],
      }
    }
    setWeek(next)
    setDirty(false)
  }, [intervals])

  const activeTeam = useMemo(() => (team ?? []).filter((p) => p.isActive), [team])

  function updateDay(day: number, patch: Partial<DayState>) {
    setWeek((prev) => {
      const next = [...prev]
      next[day] = { ...next[day]!, ...patch }
      return next
    })
    setDirty(true)
  }

  async function handleSave() {
    const payload = week.flatMap((d, weekday) =>
      d.active
        ? d.ranges
            .filter((r) => r.end > r.start)
            .map((r) => ({ weekday, startMinute: hmToMinutes(r.start), endMinute: hmToMinutes(r.end) }))
        : [],
    )
    try {
      await save.mutateAsync({ professionalId: scope === 'business' ? null : scope, intervals: payload })
      toast.success('Horario guardado')
      setDirty(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el horario')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Horarios y bloqueos</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Define cuándo atiende tu negocio y cada integrante. Los bloqueos cubren feriados,
          vacaciones y días libres.
        </p>
      </div>

      {/* Selector de ámbito */}
      <div className="mt-6 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Horario de">
        <ScopeTab active={scope === 'business'} onClick={() => setScope('business')}>
          <CalendarClock className="size-3.5" />
          Negocio
        </ScopeTab>
        {activeTeam.map((p) => (
          <ScopeTab key={p.id} active={scope === p.id} onClick={() => setScope(p.id)}>
            {p.name}
          </ScopeTab>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-96 w-full rounded-xl" />
      ) : (
        <section
          key={scope}
          className="mt-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-6"
          aria-label="Horario semanal"
        >
          <p className="mb-4 text-sm text-muted-foreground">
            {scope === 'business'
              ? 'Horario base del negocio. Cada integrante puede tener su propio horario.'
              : 'Si un integrante no tiene horario propio, usa el del negocio.'}
          </p>
          <div className="space-y-2">
            {week.map((day, d) => (
              <div
                key={d}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border p-3.5 transition-colors sm:flex-row sm:items-center',
                  day.active ? 'border-border/70 bg-background' : 'border-transparent bg-muted/40',
                )}
              >
                <div className="flex w-36 shrink-0 items-center gap-3">
                  <Switch
                    checked={day.active}
                    onCheckedChange={(active) =>
                      updateDay(d, {
                        active,
                        ranges: active && day.ranges.length === 0 ? [{ start: '09:00', end: '18:30' }] : day.ranges,
                      })
                    }
                    aria-label={`Atiende el ${DAYS[d]}`}
                  />
                  <span className={cn('text-sm font-medium', !day.active && 'text-muted-foreground')}>
                    {DAYS[d]}
                  </span>
                </div>
                {day.active ? (
                  <div className="flex flex-1 flex-col gap-2">
                    {day.ranges.map((r, ri) => (
                      <div key={ri} className="flex items-center gap-2">
                        <input
                          type="time"
                          step={900}
                          value={r.start}
                          aria-label={`Hora de inicio del ${DAYS[d]}, rango ${ri + 1}`}
                          onChange={(e) => {
                            const ranges = [...day.ranges]
                            ranges[ri] = { ...r, start: e.target.value }
                            updateDay(d, { ranges })
                          }}
                          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        />
                        <span className="text-muted-foreground">–</span>
                        <input
                          type="time"
                          step={900}
                          value={r.end}
                          aria-label={`Hora de término del ${DAYS[d]}, rango ${ri + 1}`}
                          onChange={(e) => {
                            const ranges = [...day.ranges]
                            ranges[ri] = { ...r, end: e.target.value }
                            updateDay(d, { ranges })
                          }}
                          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        />
                        {day.ranges.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            aria-label={`Quitar rango ${ri + 1} del ${DAYS[d]}`}
                            onClick={() => updateDay(d, { ranges: day.ranges.filter((_, i) => i !== ri) })}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateDay(d, { ranges: [...day.ranges, { start: '16:00', end: '20:00' }] })}
                      className="w-fit text-[13px] font-medium text-primary hover:underline"
                    >
                      + Agregar rango
                    </button>
                  </div>
                ) : (
                  <p className="flex-1 text-sm text-muted-foreground">Cerrado</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 flex justify-end border-t border-border/60 pt-4">
            <Button onClick={handleSave} disabled={save.isPending || !dirty}>
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {dirty ? 'Guardar horario' : 'Guardado'}
            </Button>
          </div>
        </section>
      )}

      <BlocksSection />
    </div>
  )
}

function ScopeTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border/70 bg-card text-muted-foreground hover:text-foreground hover:border-border',
      )}
    >
      {children}
    </button>
  )
}

function BlocksSection() {
  const { data: team } = useProfessionals()
  const { data: blocks, isLoading } = useBlocks()
  const create = useCreateBlock()
  const remove = useDeleteBlock()
  const seed = useSeedHolidays()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const upcoming = useMemo(() => {
    const now = new Date().toISOString()
    return (blocks ?? []).filter((b) => b.endAt >= now).sort((a, b) => a.startAt.localeCompare(b.startAt))
  }, [blocks])

  const year = new Date().getFullYear()

  return (
    <section className="mt-10" aria-label="Bloqueos y feriados">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Bloqueos y feriados</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Días sin atención: feriados legales, vacaciones o pausas puntuales.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const res = await seed.mutateAsync(year)
                toast.success(
                  res.inserted > 0
                    ? `${res.inserted} feriados de ${year} cargados`
                    : `Los feriados de ${year} ya estaban cargados`,
                )
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'No se pudieron cargar los feriados')
              }
            }}
            disabled={seed.isPending}
          >
            {seed.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Feriados de Chile {year}
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-3.5" />
            Nuevo bloqueo
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-24 w-full rounded-xl" />
      ) : upcoming.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarOff className="size-5" />
          </span>
          <p className="mt-4 text-sm font-medium">Sin bloqueos próximos</p>
          <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
            Carga los feriados de Chile o crea vacaciones para que no se ofrezcan esas fechas.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {upcoming.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm"
            >
              <BlockKindBadge kind={b.kind} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{blockLabel(b, team ?? [])}</p>
                <p className="truncate text-[13px] text-muted-foreground">{b.note}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar bloqueo"
                onClick={() => setDeleting(b.id)}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <BlockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        team={(team ?? []).filter((p) => p.isActive)}
        onSubmit={async (data) => {
          await create.mutateAsync(data)
          toast.success('Bloqueo creado')
          setDialogOpen(false)
        }}
        saving={create.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="¿Eliminar bloqueo?"
        description="Esas fechas volverán a estar disponibles para reservas."
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return
          await remove.mutateAsync(deleting)
          toast.success('Bloqueo eliminado')
          setDeleting(null)
        }}
      />
    </section>
  )
}

function BlockKindBadge({ kind }: { kind: string }) {
  if (kind === 'holiday') return <Badge variant="warning">Feriado</Badge>
  if (kind === 'vacation') return <Badge variant="success">Vacaciones</Badge>
  return <Badge variant="secondary">Bloqueo</Badge>
}

function blockLabel(b: { kind: string; startAt: string; endAt: string; professionalId: string | null }, team: { id: string; name: string }[]) {
  const range = formatLocalDateRange(b.startAt, b.endAt)
  const who = b.professionalId ? team.find((p) => p.id === b.professionalId)?.name ?? 'Integrante' : 'Todo el negocio'
  return `${who} · ${range}`
}

function BlockDialog({
  open,
  onOpenChange,
  team,
  onSubmit,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: { id: string; name: string }[]
  onSubmit: (data: {
    kind: 'block' | 'vacation'
    dateFrom: string
    dateTo: string
    professionalId?: string | null
    note?: string
  }) => Promise<void>
  saving: boolean
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [kind, setKind] = useState<'block' | 'vacation'>('vacation')
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [professionalId, setProfessionalId] = useState('business')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo bloqueo</DialogTitle>
          <DialogDescription>Ninguna reserva se ofrecerá en estas fechas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="blk-from">Desde</Label>
              <Input
                id="blk-from"
                type="date"
                value={dateFrom}
                min={today}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  if (dateTo < e.target.value) setDateTo(e.target.value)
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="blk-to">Hasta</Label>
              <Input
                id="blk-to"
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="blk-kind">Tipo</Label>
              <NativeSelect
                id="blk-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'block' | 'vacation')}
              >
                <option value="vacation">Vacaciones</option>
                <option value="block">Bloqueo puntual</option>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="blk-who">Aplica a</Label>
              <NativeSelect
                id="blk-who"
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
              >
                <option value="business">Todo el negocio</option>
                {team.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="blk-note">
              Nota <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="blk-note"
              placeholder="Ej: Vacaciones de invierno"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (dateTo < dateFrom) {
                  setError('La fecha final no puede ser menor a la inicial')
                  return
                }
                setError(null)
                await onSubmit({
                  kind,
                  dateFrom,
                  dateTo,
                  professionalId: professionalId === 'business' ? null : professionalId,
                  note: note || undefined,
                })
              }}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Crear bloqueo
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
