/** Formateadores locales de Chile: moneda CLP, fechas en español y teléfono +56. */

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

export function formatClp(value: number): string {
  return clpFormatter.format(value)
}

const dateLongFormatter = new Intl.DateTimeFormat('es-CL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const dateShortFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
})
const weekdayFormatter = new Intl.DateTimeFormat('es-CL', { weekday: 'short' })
const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: false,
})

export function formatDateLong(date: Date): string {
  return dateLongFormatter.format(date).replace(/^\w/, (c) => c.toUpperCase())
}

export function formatDateShort(date: Date): string {
  return dateShortFormatter.format(date)
}

export function formatWeekday(date: Date): string {
  // "lun." → "Lun"
  const s = weekdayFormatter.format(date)
  return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '')
}

export function formatTime(date: Date): string {
  return timeFormatter.format(date).replace(':00', ':00').replace('24:', '00:')
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const dateMediumFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** Rango local de un bloqueo: "12 de octubre de 2026" o "24 al 27 de diciembre de 2026". */
export function formatLocalDateRange(startIsoUtc: string, endIsoUtc: string): string {
  const start = new Date(startIsoUtc)
  const end = new Date(new Date(endIsoUtc).getTime() - 1) // endAt es exclusivo
  const startStr = dateMediumFormatter.format(start)
  const endStr = dateMediumFormatter.format(end)
  if (startStr === endStr) return startStr
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  if (sameMonth) {
    return `${start.getDate()} al ${endStr}`
  }
  return `${startStr} al ${endStr}`
}

/** Normaliza teléfono chileno: acepta 9XXXXXXXX / +56 9 XXXX XXXX y devuelve +569XXXXXXXX. */
export function normalizePhoneChile(input: string): string {
  const digits = input.replace(/[^\d+]/g, '')
  let n = digits.replace(/^\+?56/, '')
  if (n.length === 8) n = '9' + n // fijo sin código área poco común; se asume móvil
  return `+56${n}`
}

/** Enlace wa.me listo para integración futura de WhatsApp API (hoy: chat directo). */
export function waLink(phone: string, text?: string): string {
  const normalized = normalizePhoneChile(phone).replace(/\D/g, '')
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}
