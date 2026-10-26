/**
 * Feriados legales de Chile (territorio continental).
 * Fijos por ley + Semana Santa calculada (algoritmo de Meeus/Jones/Butcher).
 * Desde 2024 la ley 21.655 agregó el 21 de junio (Día Nacional de los Pueblos
 * Indígenas) y eliminó San Pedro y San Pablo (29 de junio).
 */

export interface Holiday {
  date: string // 'YYYY-MM-DD'
  name: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Domingo de Pascua para un año dado (calendario gregoriano). */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

function iso(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function chileanHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [
    { date: `${year}-01-01`, name: 'Año Nuevo' },
    { date: `${year}-05-01`, name: 'Día del Trabajo' },
    { date: `${year}-05-21`, name: 'Día de las Glorias Navales' },
    { date: `${year}-09-18`, name: 'Independencia Nacional' },
    { date: `${year}-09-19`, name: 'Día de las Glorias del Ejército' },
    { date: `${year}-10-12`, name: 'Encuentro de Dos Mundos' },
    { date: `${year}-10-31`, name: 'Día de las Iglesias Evangélicas' },
    { date: `${year}-11-01`, name: 'Día de Todos los Santos' },
    { date: `${year}-12-08`, name: 'Inmaculada Concepción' },
    { date: `${year}-12-25`, name: 'Navidad' },
  ]

  if (year >= 2024) {
    holidays.push({ date: `${year}-06-21`, name: 'Día Nacional de los Pueblos Indígenas' })
  }

  const easter = easterSunday(year)
  holidays.push({ date: iso(addDays(easter, -2)), name: 'Viernes Santo' })
  holidays.push({ date: iso(addDays(easter, -1)), name: 'Sábado Santo' })

  return holidays.sort((a, b) => a.date.localeCompare(b.date))
}
