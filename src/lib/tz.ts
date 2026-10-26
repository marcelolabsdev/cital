/**
 * Conversión de zonas horarias basada en Intl.DateTimeFormat: funciona igual en
 * Cloudflare Workers y en Node, y respeta el horario de verano histórico de Chile.
 *
 * Convención de cital: guardar en UTC (texto ISO-8601) y mostrar en la zona del
 * negocio. Los horarios semanales se guardan en minutos locales del negocio.
 */

export interface ZonedParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number // 0-23
  minute: number // 0-59
  second: number // 0-59
  weekday: number // 0 = lunes ... 6 = domingo
  dateStr: string // 'YYYY-MM-DD'
  minuteOfDay: number // 0-1439
}

const WEEKDAYS: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
}

const partsCache = new Map<string, Intl.DateTimeFormat>()

function getDtf(timeZone: string): Intl.DateTimeFormat {
  let dtf = partsCache.get(timeZone)
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsCache.set(timeZone, dtf)
  }
  return dtf
}

/** Descompone un instante UTC en sus partes de pared en la zona indicada. */
export function zonedParts(dateUtc: Date, timeZone: string): ZonedParts {
  const parts = getDtf(timeZone).formatToParts(dateUtc)
  const by: Record<string, string> = {}
  for (const p of parts) by[p.type] = p.value
  const year = Number(by['year'])
  const month = Number(by['month'])
  const day = Number(by['day'])
  // Nota: en hour12:false某些 entornos entregan "24" para medianoche.
  const hour = Number(by['hour']) % 24
  const minute = Number(by['minute'])
  const second = Number(by['second'])
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: WEEKDAYS[by['weekday'] ?? 'Mon'] ?? 0,
    dateStr: `${pad(year)}-${pad(month)}-${pad(day)}`,
    minuteOfDay: hour * 60 + minute,
  }
}

/** Offset (ms) de la zona respecto de UTC en un instante dado. */
export function zoneOffsetMs(dateUtc: Date, timeZone: string): number {
  const p = zonedParts(dateUtc, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(dateUtc.getTime() / 1000) * 1000
}

/**
 * Convierte una pared local ("YYYY-MM-DD" + minutos del día) a un instante UTC.
 * Itera dos veces para estabilizar en bordes de cambio de horario de verano.
 */
export function zonedToUtc(dateStr: string, minuteOfDay: number, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const asUtc = Date.UTC(y!, (m! - 1), d!, 0, minuteOfDay, 0)
  let ts = asUtc
  for (let i = 0; i < 2; i++) {
    const offset = zoneOffsetMs(new Date(ts), timeZone)
    ts = asUtc - offset
  }
  return new Date(ts)
}

/** Formatea un instante UTC como texto ISO compatible con la base de datos. */
export function toIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
