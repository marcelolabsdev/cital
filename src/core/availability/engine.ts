/**
 * Motor de disponibilidad: FUNCIÓN PURA sin acceso a base de datos.
 * Recibe los datos de dominio ya cargados por el llamador y calcula los
 * horarios reservables. Toda la lógica de negocio vive acá para poder
 * testearla sin infraestructura y reutilizarla al migrar de D1 a Postgres.
 */

import { zonedParts, zonedToUtc } from '../../lib/tz'

export interface ScheduleRule {
  weekday: number // 0 = lunes ... 6 = domingo
  startMinute: number // minutos locales desde medianoche
  endMinute: number
}

export interface BusyRange {
  startAt: string // UTC ISO
  endAt: string // UTC ISO
}

export interface AvailabilityInput {
  timezone: string
  dateFrom: string // 'YYYY-MM-DD' local, inclusive
  dateTo: string // inclusive
  serviceDurationMin: number
  slotStepMin: number // granularidad de oferta (default 15)
  bufferMin: number // minutos de respiro antes y después de cada cita
  minLeadMin: number // anticipación mínima respecto de `now`
  maxLeadDays: number // ventana máxima de reserva hacia adelante
  now: Date
  schedules: ScheduleRule[]
  busy: BusyRange[] // citas activas + bloqueos, en UTC, ya fusionados por ámbito
}

export interface Slot {
  startIso: string // UTC
  endIso: string // UTC
  localDate: string // 'YYYY-MM-DD'
  localMinute: number // inicio en minutos locales
}

interface UtcRange {
  start: number
  end: number
}

export function computeSlots(input: AvailabilityInput): Slot[] {
  const {
    timezone,
    serviceDurationMin,
    slotStepMin,
    bufferMin,
    minLeadMin,
    maxLeadDays,
    now,
    schedules,
    busy,
  } = input

  const byWeekday = new Map<number, ScheduleRule[]>()
  for (const rule of schedules) {
    const list = byWeekday.get(rule.weekday) ?? []
    list.push(rule)
    byWeekday.set(rule.weekday, list)
  }

  const busyUtc: UtcRange[] = busy
    .map((b) => ({ start: Date.parse(b.startAt), end: Date.parse(b.endAt) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start)

  // Respiro alrededor de cada ocupación (buffer antes y después)
  const expanded = busyUtc.map((b) => ({
    start: b.start - bufferMin * 60_000,
    end: b.end + bufferMin * 60_000,
  }))

  const nowTs = now.getTime()
  const earliestStart = nowTs + minLeadMin * 60_000
  const latestStart = nowTs + maxLeadDays * 86_400_000

  const slots: Slot[] = []
  const seen = new Set<string>()

  for (const localDate of eachLocalDate(input.dateFrom, input.dateTo, timezone, now, maxLeadDays)) {
    const parts = zonedToUtc(localDate, 0, timezone)
    const weekday = zonedParts(parts, timezone).weekday
    const rules = byWeekday.get(weekday) ?? []

    for (const rule of rules) {
      const dayStart = zonedToUtc(localDate, rule.startMinute, timezone).getTime()
      const dayEnd = zonedToUtc(localDate, rule.endMinute, timezone).getTime()

      const free = subtractBusy(dayStart, dayEnd, expanded)
      for (const seg of free) {
        const stepMs = slotStepMin * 60_000
        const durMs = serviceDurationMin * 60_000
        // Slots alineados a la grilla del intervalo del día (9:00, 9:15, …),
        // nunca al borde de una ocupación (evita horarios "raros" como 9:40)
        const firstSlot = dayStart + Math.ceil((seg.start - dayStart) / stepMs) * stepMs
        for (let s = firstSlot; s + durMs <= seg.end; s += stepMs) {
          if (s < earliestStart || s > latestStart) continue
          const key = `${localDate}T${s}`
          if (seen.has(key)) continue
          seen.add(key)
          slots.push({
            startIso: toIso(s),
            endIso: toIso(s + durMs),
            localDate,
            localMinute: minuteOfDayLocal(s, timezone, localDate),
          })
        }
      }
    }
  }

  return slots.sort((a, b) => a.startIso.localeCompare(b.startIso))
}

/** Días locales en [from, to] recortados a la ventana de reserva permitida. */
function eachLocalDate(
  from: string,
  to: string,
  timezone: string,
  now: Date,
  maxLeadDays: number,
): string[] {
  const todayStr = zonedParts(now, timezone).dateStr
  const maxStr = zonedParts(new Date(now.getTime() + maxLeadDays * 86_400_000), timezone).dateStr
  const start = from > todayStr ? from : todayStr
  const end = to < maxStr ? to : maxStr
  const dates: string[] = []
  let cursor = start
  while (cursor <= end && dates.length < 400) {
    dates.push(cursor)
    cursor = addOneDay(cursor)
  }
  return dates
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(y!, (m! - 1), d! + 1))
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

/** Resta los rangos ocupados (ordenados) de una ventana, devolviendo segmentos libres. */
export function subtractBusy(start: number, end: number, busy: UtcRange[]): UtcRange[] {
  const free: UtcRange[] = []
  let cursor = start
  for (const b of busy) {
    if (b.end <= cursor) continue
    if (b.start >= end) break
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, end) })
    cursor = Math.max(cursor, b.end)
    if (cursor >= end) return free
  }
  if (cursor < end) free.push({ start: cursor, end })
  return free
}

function minuteOfDayLocal(ts: number, timezone: string, localDate: string): number {
  const parts = zonedParts(new Date(ts), timezone)
  if (parts.dateStr !== localDate) return 0 // cruzó medianoche (no debería ocurrir con reglas sanas)
  return parts.minuteOfDay
}

function toIso(ts: number): string {
  return new Date(ts).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
