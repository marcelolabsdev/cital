import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { formatClp, formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DEFAULT_ENTITY_COLOR } from '@/lib/brand'
import {
  useAvailableDays,
  useCreateBooking,
  usePublicInfo,
  useSlots,
  type BookingResultDto,
  type PublicSlot,
} from './hooks'
import { TurnstileWidget } from './Turnstile'
import { SlotGrid } from './DateTimeShared'

const STEP_LABELS = ['Servicio', 'Profesional', 'Horario', 'Tus datos']
const WEEKDAYS_MIN = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: info, isLoading, isError } = usePublicInfo(slug ?? '')

  const [step, setStep] = useState(1)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [professionalId, setProfessionalId] = useState<string | null>(null) // null = cualquiera
  const [date, setDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<PublicSlot | null>(null)
  const [done, setDone] = useState<{ appointment: BookingResultDto['appointment']; slot: PublicSlot } | null>(null)

  const brand = info?.tenant.brandColor ?? DEFAULT_ENTITY_COLOR

  useEffect(() => {
    if (info) document.title = `${info.tenant.name} · Reserva tu hora`
  }, [info])

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-4 px-5 py-8">
        <div className="h-14 animate-pulse rounded-2xl bg-muted" />
        <div className="h-6 w-1/2 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (isError || !info) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <CalendarDays className="size-6 text-muted-foreground" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight">Página de reservas no encontrada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Revisa que el enlace sea correcto. Si eres el dueño, ingresa al panel para ver tu
          enlace público.
        </p>
        <Link to="/" className="text-sm font-medium text-primary hover:underline">
          Ir a cital
        </Link>
      </div>
    )
  }

  const service = info.services.find((s) => s.id === serviceId) ?? null
  const professional =
    professionalId ? info.professionals.find((p) => p.id === professionalId) ?? null : null

  const canContinue =
    (step === 1 && !!serviceId) ||
    (step === 2 && !!service) ||
    (step === 3 && !!slot) ||
    step === 4

  return (
    <div
      className="relative min-h-svh"
      style={{ '--brand': brand, '--slot-accent': brand } as React.CSSProperties}
    >
      {/* Banda de marca */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[var(--brand)]/[0.14] via-[var(--brand)]/[0.05] to-transparent"
      />

      <div className="relative mx-auto max-w-lg px-5 pb-32 pt-8">
        <BusinessHeader info={info} />
        <ProgressBar step={step} />

        {done ? (
          <Confirmation
            slug={slug ?? ''}
            appointment={done.appointment}
            slot={done.slot}
            serviceName={service?.name ?? ''}
            professionalName={professional?.name ?? null}
          />
        ) : (
          <div key={step} className="mt-7">
            {step === 1 && (
              <ServiceStep
                info={info}
                selected={serviceId}
                onSelect={(id) => {
                  setServiceId(id)
                  setProfessionalId(null)
                  setDate(null)
                  setSlot(null)
                }}
              />
            )}
            {step === 2 && service && (
              <ProfessionalStep
                info={info}
                serviceId={service.id}
                selected={professionalId}
                onSelect={setProfessionalId}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && service && (
              <DateTimeStep
                slug={slug ?? ''}
                serviceId={service.id}
                professionalId={professionalId}
                date={date}
                slot={slot}
                onPickDate={(d) => {
                  setDate(d)
                  setSlot(null)
                }}
                onPickSlot={setSlot}
                onBack={() => setStep(2)}
              />
            )}
            {step === 4 && service && slot && (
              <CustomerStep
                slug={slug ?? ''}
                info={info}
                service={service}
                slot={slot}
                professionalName={professional?.name ?? null}
                onBack={() => setStep(3)}
                onDone={(appt) => setDone({ appointment: appt, slot })}
              />
            )}
          </div>
        )}
      </div>

      {/* Barra de acción fija (pasos 1-3): siempre a mano, estilo app */}
      {!done && step < 4 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-md">
          <div
            className="mx-auto max-w-lg px-5 py-3"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-2.5">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  aria-label="Volver al paso anterior"
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm transition-colors hover:bg-accent active:scale-[0.98]"
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={!canContinue}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-40"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {step === 2 ? 'Ver horarios' : 'Continuar'}
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Cabecera del negocio ----------

function BusinessHeader({ info }: { info: NonNullable<ReturnType<typeof usePublicInfo>['data']> }) {
  const brand = info.tenant.brandColor ?? DEFAULT_ENTITY_COLOR
  return (
    <header className="flex flex-col items-center text-center">
      {info.tenant.logoUrl ? (
        <img
          src={info.tenant.logoUrl}
          alt={info.tenant.name}
          className="size-20 rounded-3xl object-cover shadow-lg ring-4 ring-background"
        />
      ) : (
        <span
          className="flex size-20 items-center justify-center rounded-3xl text-3xl font-bold text-white shadow-lg ring-4 ring-background"
          style={{ backgroundColor: brand }}
          aria-hidden="true"
        >
          {info.tenant.name.charAt(0).toUpperCase()}
        </span>
      )}
      <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-balance">
        {info.tenant.name}
      </h1>
      {info.tenant.description && (
        <p className="mt-1 max-w-xs text-sm text-pretty text-muted-foreground">
          {info.tenant.description}
        </p>
      )}
    </header>
  )
}

/** Barra de progreso fina, un segmento por paso. */
function ProgressBar({ step }: { step: number }) {
  return (
    <div
      className="mt-6 flex gap-1.5"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={4}
      aria-label={`Paso ${step} de 4: ${STEP_LABELS[step - 1]}`}
    >
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={cn(
            'h-1 flex-1 rounded-full transition-colors duration-300',
            n < step && 'bg-[var(--brand)]/50',
            n === step && 'bg-[var(--brand)]',
            n > step && 'bg-border',
          )}
        />
      ))}
    </div>
  )
}

// ---------- Paso 1: servicio ----------

function ServiceStep({
  info,
  selected,
  onSelect,
}: {
  info: NonNullable<ReturnType<typeof usePublicInfo>['data']>
  selected: string | null
  onSelect: (id: string) => void
}) {
  // Solo servicios con al menos un profesional que los atienda
  const services = info.services.filter((s) =>
    info.professionals.some((p) => p.serviceIds.includes(s.id)),
  )

  return (
    <section aria-label="Elige un servicio">
      <h2 className="mb-1 text-lg font-semibold tracking-tight">¿Qué quieres reservar?</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">
        {services.length} {services.length === 1 ? 'servicio disponible' : 'servicios disponibles'}
      </p>
      {services.length === 0 ? (
        <EmptyState
          title="Sin servicios disponibles"
          text="Este negocio aún no configura servicios para reservar online."
        />
      ) : (
        <div className="grid gap-2.5">
          {services.map((s) => {
            const active = selected === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center gap-3.5 rounded-2xl border bg-card p-4 text-left shadow-card transition-all',
                  'hover:border-[var(--brand)]/50 active:scale-[0.99]',
                  active
                    ? 'border-[var(--brand)] bg-[var(--brand)]/[0.04]'
                    : 'border-border/70',
                )}
              >
                <span
                  className="size-11 shrink-0 rounded-xl"
                  style={{ backgroundColor: `${s.color ?? DEFAULT_ENTITY_COLOR}1f` }}
                  aria-hidden="true"
                >
                  <span
                    className="flex size-full items-center justify-center rounded-xl"
                    style={{ color: s.color ?? DEFAULT_ENTITY_COLOR }}
                  >
                    <Sparkles className="size-5" />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  {s.description && (
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                      {s.description}
                    </span>
                  )}
                  <span className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Clock className="size-3.5" />
                    {formatDuration(s.durationMinutes)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[15px] font-semibold tabular-nums">
                    {formatClp(s.priceClp)}
                  </span>
                  {active ? (
                    <span
                      className="flex size-5 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: 'var(--brand)' }}
                      aria-hidden="true"
                    >
                      <Check className="size-3" strokeWidth={3.5} />
                    </span>
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------- Paso 2: profesional (avatares) ----------

function ProfessionalStep({
  info,
  serviceId,
  selected,
  onSelect,
  onBack,
}: {
  info: NonNullable<ReturnType<typeof usePublicInfo>['data']>
  serviceId: string
  selected: string | null
  onSelect: (id: string | null) => void
  onBack: () => void
}) {
  const pros = info.professionals.filter((p) => p.serviceIds.includes(serviceId))
  return (
    <section aria-label="Elige profesional">
      <BackBar onBack={onBack} title="Elige un servicio" />
      <h2 className="mb-1 text-lg font-semibold tracking-tight">¿Con quién?</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Toca un avatar para reservar con esa persona
      </p>
      <div
        className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="radiogroup"
        aria-label="Profesional"
      >
        <AvatarChip
          label="Cualquiera"
          sub="Primera hora libre"
          selected={selected === null}
          onClick={() => onSelect(null)}
          icon={<Users className="size-6" />}
        />
        {pros.map((p) => (
          <AvatarChip
            key={p.id}
            label={p.name}
            sub={p.bio ?? undefined}
            selected={selected === p.id}
            onClick={() => onSelect(p.id)}
            initial={p.name.charAt(0).toUpperCase()}
            color={p.color ?? DEFAULT_ENTITY_COLOR}
          />
        ))}
      </div>
    </section>
  )
}

function AvatarChip({
  label,
  sub,
  selected,
  onClick,
  icon,
  initial,
  color = DEFAULT_ENTITY_COLOR,
}: {
  label: string
  sub?: string
  selected: boolean
  onClick: () => void
  icon?: React.ReactNode
  initial?: string
  color?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-[6.5rem] shrink-0 flex-col items-center gap-2 rounded-2xl border bg-card p-3 transition-all',
        'hover:border-[var(--brand)]/50 active:scale-[0.97]',
        selected ? 'border-[var(--brand)] shadow-card' : 'border-border/70 shadow-sm',
      )}
    >
      <span className="relative">
        <span
          className={cn(
            'flex size-14 items-center justify-center rounded-full text-lg font-semibold transition-shadow',
            selected && 'ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-card',
          )}
          style={icon ? { backgroundColor: 'oklch(0.955 0.007 110)', color: 'inherit' } : { backgroundColor: `${color}22`, color }}
          aria-hidden="true"
        >
          {icon ?? initial}
        </span>
        {selected && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full text-white ring-2 ring-card"
            style={{ backgroundColor: 'var(--brand)' }}
            aria-hidden="true"
          >
            <Check className="size-3" strokeWidth={3.5} />
          </span>
        )}
      </span>
      <span className="w-full text-center">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        {sub && <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>}
      </span>
    </button>
  )
}

// ---------- Paso 3: fecha (calendario) y hora (tiras con flechas) ----------

function DateTimeStep({
  slug,
  serviceId,
  professionalId,
  date,
  slot,
  onPickDate,
  onPickSlot,
  onBack,
}: {
  slug: string
  serviceId: string
  professionalId: string | null
  date: string | null
  slot: PublicSlot | null
  onPickDate: (d: string) => void
  onPickSlot: (s: PublicSlot) => void
  onBack: () => void
}) {
  const today = new Date()
  const [monthCursor, setMonthCursor] = useState(() => {
    const base = date ?? today.toISOString().slice(0, 10)
    return base.slice(0, 7)
  })
  const { data: daysData, isLoading: daysLoading } = useAvailableDays(
    slug,
    serviceId,
    monthCursor,
    professionalId,
  )
  const { data: slotsData, isLoading: slotsLoading } = useSlots(slug, serviceId, date ?? '', professionalId)

  const monthLabel = (() => {
    const [y, m] = monthCursor.split('-').map(Number)
    const name = MONTHS_ES[(m ?? 1) - 1]!
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`
  })()

  const canPrev = monthCursor > today.toISOString().slice(0, 7)
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1).toISOString().slice(0, 7)
  const canNext = monthCursor < maxMonth

  const grid = useMemo(() => {
    const [y, m] = monthCursor.split('-').map(Number)
    const first = new Date(y!, (m! - 1), 1)
    const lead = (first.getDay() + 6) % 7 // lunes = 0
    const total = new Date(y!, m!, 0).getDate()
    const cells: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= total; d++) {
      cells.push(`${monthCursor}-${String(d).padStart(2, '0')}`)
    }
    return cells
  }, [monthCursor])

  const availableDays = new Set(daysData?.days ?? [])
  const todayStr = today.toISOString().slice(0, 10)

  const dateLabel = useMemo(() => {
    if (!date) return null
    const [, m, d] = date.split('-').map(Number)
    return `${d} de ${MONTHS_ES[(m ?? 1) - 1]}`
  }, [date])

  function shiftMonth(delta: number) {
    const [y, m] = monthCursor.split('-').map(Number)
    const next = new Date(y!, (m! - 1) + delta, 1)
    setMonthCursor(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <section aria-label="Elige fecha y hora">
      <BackBar onBack={onBack} title="Elige profesional" />
      <h2 className="mb-4 text-lg font-semibold tracking-tight">¿Cuándo?</h2>

      {/* Calendario del mes */}
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            disabled={!canPrev}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="text-sm font-semibold">{monthLabel}</p>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={!canNext}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
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
          {grid.map((cell, i) => {
            if (!cell) return <span key={`empty-${i}`} />
            const dayNum = Number(cell.slice(8))
            const selectable = cell >= todayStr && availableDays.has(cell)
            const active = date === cell
            return (
              <button
                key={cell}
                type="button"
                disabled={!selectable}
                onClick={() => onPickDate(cell)}
                aria-pressed={active}
                aria-label={selectable ? `Elegir ${cell}` : `${cell} sin horarios`}
                className={cn(
                  'flex h-9 w-full items-center justify-center rounded-lg text-sm transition-colors',
                  selectable ? 'text-foreground hover:bg-accent' : 'text-muted-foreground/40',
                  active && 'font-semibold text-white hover:brightness-95',
                )}
                style={active ? { backgroundColor: 'var(--brand)' } : undefined}
              >
                {dayNum}
              </button>
            )
          })}
        </div>
        {daysLoading && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Buscando días con hora…</p>
        )}
      </div>

      {/* Horas agrupadas en tiras con flechas */}
      {date && (
        <div className="mt-5" aria-label="Horarios disponibles">
          <h3 className="mb-3 text-sm font-semibold">
            Horas para el {dateLabel}
          </h3>
          <SlotGrid
            slots={slotsData?.slots ?? []}
            selectedIso={slot?.startIso}
            loading={slotsLoading}
            onSelect={onPickSlot}
          />
        </div>
      )}
    </section>
  )
}

// ---------- Paso 4: datos del cliente ----------

interface CustomerDraft {
  name: string
  phone: string
  email: string
}

function CustomerStep({
  slug,
  info,
  service,
  slot,
  professionalName,
  onBack,
  onDone,
}: {
  slug: string
  info: NonNullable<ReturnType<typeof usePublicInfo>['data']>
  service: NonNullable<ReturnType<typeof usePublicInfo>['data']>['services'][number]
  slot: PublicSlot
  professionalName: string | null
  onBack: () => void
  onDone: (appt: BookingResultDto['appointment']) => void
}) {
  const create = useCreateBooking(slug)
  const [form, setForm] = useState<CustomerDraft>({ name: '', phone: '', email: '' })
  const [errors, setErrors] = useState<Partial<CustomerDraft>>({})
  const [turnstileToken, setTurnstileToken] = useState('')

  function validate(): boolean {
    const e: Partial<CustomerDraft> = {}
    if (form.name.trim().length < 2) e.name = 'Ingresa tu nombre'
    const digits = form.phone.replace(/[^\d]/g, '')
    if (digits.length < 8) e.phone = 'Ingresa un teléfono válido (ej: +56 9 1234 5678)'
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Email inválido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit() {
    if (!validate()) return
    try {
      const res = await create.mutateAsync({
        serviceId: service.id,
        professionalId: slot.professionalId,
        startIso: slot.startIso,
        customer: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined },
        turnstileToken: turnstileToken || undefined,
      })
      onDone(res.appointment)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la reserva')
    }
  }

  return (
    <section aria-label="Tus datos">
      <BackBar onBack={onBack} title="Elegir otro horario" />
      <h2 className="mb-4 text-lg font-semibold tracking-tight">Último paso</h2>

      {/* Resumen */}
      <div className="mb-5 rounded-2xl border border-[var(--brand)]/25 bg-[var(--brand)]/[0.05] p-4">
        <p className="font-medium">{service.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserRound className="size-3.5" />
            {professionalName ?? 'Cualquier profesional'}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDateShortEs(slot.startIso.slice(0, 10))}, {minuteToHm(slot.localMinute)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatDuration(service.durationMinutes)}
          </span>
        </p>
        <p className="mt-2 text-sm font-semibold">{formatClp(service.priceClp)}</p>
      </div>

      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        noValidate
      >
        <div className="grid gap-1.5">
          <label htmlFor="bk-name" className="text-sm font-medium">
            Tu nombre
          </label>
          <input
            id="bk-name"
            autoComplete="name"
            className="h-12 rounded-xl border border-input bg-card px-3.5 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50"
            aria-invalid={!!errors.name}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {errors.name && <p className="text-[13px] text-destructive">{errors.name}</p>}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="bk-phone" className="text-sm font-medium">
            Teléfono
          </label>
          <input
            id="bk-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+56 9 1234 5678"
            className="h-12 rounded-xl border border-input bg-card px-3.5 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50"
            aria-invalid={!!errors.phone}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          {errors.phone && <p className="text-[13px] text-destructive">{errors.phone}</p>}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="bk-email" className="text-sm font-medium">
            Email <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="bk-email"
            type="email"
            autoComplete="email"
            className="h-12 rounded-xl border border-input bg-card px-3.5 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50"
            aria-invalid={!!errors.email}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          {errors.email && <p className="text-[13px] text-destructive">{errors.email}</p>}
        </div>

        <TurnstileWidget siteKey={info.turnstileSiteKey} onToken={setTurnstileToken} />

        <button
          type="submit"
          disabled={create.isPending}
          className="mt-1 flex h-13 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          Confirmar reserva
        </button>
        <p className="text-center text-xs text-muted-foreground">
          {info.tenant.cancellationPolicyMode === 'no_refund'
            ? 'Al reservar aceptas la política de cancelación: sin reembolso.'
            : `Al reservar aceptas la política de cancelación (${info.tenant.cancellationPolicyHours} h de anticipación).`}
        </p>
      </form>
    </section>
  )
}

// ---------- Piezas compartidas del flujo ----------

function BackBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {title}
    </button>
  )
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted">
        <CalendarDays className="size-5 text-muted-foreground" />
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">{text}</p>
    </div>
  )
}

function Confirmation({
  slug,
  appointment,
  slot,
  serviceName,
  professionalName,
}: {
  slug: string
  appointment: BookingResultDto['appointment']
  slot: PublicSlot
  serviceName: string
  professionalName: string | null
}) {
  const manageUrl = `${window.location.origin}/reserva/${appointment.manageToken}`
  return (
    <section
      className="mt-8 text-center"
      aria-label="Reserva confirmada"
    >
      <span
        className="mx-auto flex size-16 items-center justify-center rounded-full text-white shadow-lg"
        style={{ backgroundColor: 'var(--brand)' }}
      >
        <Check className="size-8" strokeWidth={3} />
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">¡Hora agendada!</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Te esperamos. Guarda este enlace para gestionar tu reserva.
      </p>

      <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5 text-left shadow-card">
        <p className="font-medium">{serviceName}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {formatDateLongEs(appointment.startAt)} · {minuteToHm(slot.localMinute)} hrs
          {professionalName ? ` · ${professionalName}` : ''}
        </p>
        <p className="mt-2 text-sm font-semibold">{formatClp(appointment.priceClp)}</p>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        <a href={`/reserva/${appointment.manageToken}`}>
          <button
            type="button"
            className="h-12 w-full rounded-xl text-[15px] font-semibold text-white shadow-md transition-transform active:scale-[0.98]"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            Ver o cambiar mi reserva
          </button>
        </a>
        <CopyLink url={manageUrl} />
        <a
          href={`/r/${slug}`}
          className="mt-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Reservar otra hora
        </a>
      </div>
    </section>
  )
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        toast.success('Enlace copiado')
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
    >
      {copied ? <Check className="size-4" /> : <CalendarDays className="size-4" />}
      {copied ? 'Copiado' : 'Copiar enlace de gestión'}
    </button>
  )
}

function minuteToHm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function formatDateShortEs(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${d} de ${MONTHS_ES[(m ?? 1) - 1]}`
}

function formatDateLongEs(isoUtc: string): string {
  const [y, m, d] = isoUtc.slice(0, 10).split('-').map(Number)
  // La API entrega la fecha ya en local del negocio (los slots se generan así)
  return `${d} de ${MONTHS_ES[(m ?? 1) - 1]} de ${y}`
}
