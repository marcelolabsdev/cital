import { describe, expect, it } from 'vitest'
import { computeSlots, subtractBusy } from '../src/core/availability/engine'

/**
 * Tests del motor de disponibilidad (función pura, sin base de datos).
 * Zona horaria de referencia: America/Santiago (UTC-3 todo el año).
 */

const TZ = 'America/Santiago'
const DATE = '2026-11-04' // miércoles

function baseInput(overrides: Partial<Parameters<typeof computeSlots>[0]> = {}) {
  return {
    timezone: TZ,
    dateFrom: DATE,
    dateTo: DATE,
    serviceDurationMin: 30,
    slotStepMin: 15,
    bufferMin: 0,
    minLeadMin: 0,
    maxLeadDays: 60,
    now: new Date('2026-10-25T12:00:00Z'),
    schedules: [{ weekday: 2, startMinute: 540, endMinute: 1080 }], // miércoles 9:00-18:00
    busy: [],
    ...overrides,
  }
}

describe('computeSlots — horarios base', () => {
  it('genera slots cada 15 min desde las 9:00 y no ofrece uno que no alcanza a terminar', () => {
    const slots = computeSlots(baseInput())
    expect(slots).toHaveLength(35) // 9:00 .. 17:30 (el último que termina a las 18:00)
    expect(slots[0]!.startIso).toBe('2026-11-04T12:00:00Z') // 9:00 Santiago = 12:00 UTC
    expect(slots.at(-1)!.startIso).toBe('2026-11-04T20:30:00Z') // 17:30
    expect(slots.at(-1)!.endIso).toBe('2026-11-04T21:00:00Z')
  })

  it('día sin horario definido no tiene slots', () => {
    const slots = computeSlots(baseInput({ schedules: [{ weekday: 5, startMinute: 540, endMinute: 1080 }] }))
    expect(slots).toHaveLength(0)
  })

  it('varios rangos en el día (mañana y tarde) generan slots en ambos', () => {
    const slots = computeSlots(
      baseInput({
        schedules: [
          { weekday: 2, startMinute: 540, endMinute: 720 }, // 9:00-12:00
          { weekday: 2, startMinute: 900, endMinute: 1080 }, // 15:00-18:00
        ],
      }),
    )
    const hours = slots.map((s) => s.localMinute)
    expect(hours[0]).toBe(540) // 9:00
    expect(hours).not.toContain(735) // 12:15 (fuera del rango AM)
    expect(hours).toContain(900) // 15:00
    expect(hours.at(-1)).toBe(1050) // 17:30
  })

  it('convierte la hora local de Santiago a UTC correctamente (UTC-3)', () => {
    const slots = computeSlots(baseInput())
    expect(slots[0]!.localMinute).toBe(540)
    expect(slots[0]!.startIso.endsWith('T12:00:00Z')).toBe(true)
    expect(slots[0]!.localDate).toBe(DATE)
  })
})

describe('computeSlots — bloqueos y citas', () => {
  it('un bloqueo de todo el día elimina los slots', () => {
    const slots = computeSlots(
      baseInput({
        busy: [{ startAt: '2026-11-04T00:00:00Z', endAt: '2026-11-05T00:00:00Z' }],
      }),
    )
    expect(slots).toHaveLength(0)
  })

  it('un bloqueo parcial deja slots antes y después', () => {
    const slots = computeSlots(
      baseInput({
        busy: [{ startAt: '2026-11-04T15:00:00Z', endAt: '2026-11-04T16:00:00Z' }], // 12:00-13:00 local
      }),
    )
    const hours = slots.map((s) => s.localMinute)
    expect(hours).toContain(675) // 11:15 (termina 11:45, antes del bloqueo)
    expect(hours).not.toContain(720) // 12:00 dentro del bloqueo
    expect(hours).not.toContain(765) // 12:45 dentro del bloqueo
    expect(hours).toContain(780) // 13:00 justo tras el bloqueo
  })

  it('una cita ocupada amplificada por buffer elimina los slots pegados a ella', () => {
    const slots = computeSlots(
      baseInput({
        bufferMin: 15,
        busy: [{ startAt: '2026-11-04T13:00:00Z', endAt: '2026-11-04T13:30:00Z' }], // cita 10:00-10:30 local
      }),
    )
    const hours = slots.map((s) => s.localMinute)
    // Cita expandida 9:45-10:45: 9:45 cae dentro, 10:30 cae dentro
    expect(hours).not.toContain(585) // 9:45
    expect(hours).not.toContain(630) // 10:30
    expect(hours).toContain(645) // 10:45
    expect(hours).not.toContain(570) // 9:30 (su fin 10:00 invade la zona expandida desde 9:45)
  })

  it('sin buffer, el slot justo después de una cita está disponible', () => {
    const slots = computeSlots(
      baseInput({
        busy: [{ startAt: '2026-11-04T13:00:00Z', endAt: '2026-11-04T13:30:00Z' }],
      }),
    )
    const hours = slots.map((s) => s.localMinute)
    expect(hours).not.toContain(600) // 10:00 (la cita misma)
    expect(hours).toContain(630) // 10:30 ok
  })
})

describe('computeSlots — reglas temporales', () => {
  it('respeta la anticipación mínima (lead time)', () => {
    // now = 2026-11-04 11:00 local (14:00Z); lead 2h → primer slot >= 13:00 local
    const slots = computeSlots(
      baseInput({
        now: new Date('2026-11-04T14:00:00Z'),
        minLeadMin: 120,
      }),
    )
    const first = slots[0]!.localMinute
    expect(first).toBeGreaterThanOrEqual(13 * 60)
  })

  it('no ofrece fechas fuera de la ventana máxima de reserva', () => {
    const slots = computeSlots(baseInput({ maxLeadDays: 3 }))
    expect(slots).toHaveLength(0) // DATE está a 10 días de now
  })

  it('ignora fechas pasadas aunque estén en el rango pedido', () => {
    const slots = computeSlots(
      baseInput({ dateFrom: '2026-10-01', dateTo: '2026-10-24' }), // todo antes de now
    )
    expect(slots).toHaveLength(0)
  })

  it('recorta un rango que parte en el pasado: solo ofrece días futuros', () => {
    const slots = computeSlots(baseInput({ dateFrom: '2026-10-01', dateTo: '2026-10-31' }))
    // 28-oct es el único miércoles posterior a now (25-oct)
    expect(slots.every((s) => s.localDate === '2026-10-28')).toBe(true)
    expect(slots.length).toBeGreaterThan(0)
  })
})

describe('subtractBusy (unidades de tiempo libre)', () => {
  it('ventana sin ocupaciones queda completa', () => {
    const free = subtractBusy(0, 100, [])
    expect(free).toEqual([{ start: 0, end: 100 }])
  })

  it('una ocupación en el medio parte la ventana', () => {
    const free = subtractBusy(0, 100, [{ start: 40, end: 60 }])
    expect(free).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ])
  })

  it('ocupaciones solapadas se consolidan', () => {
    const free = subtractBusy(0, 100, [
      { start: 40, end: 60 },
      { start: 50, end: 80 },
    ])
    expect(free).toEqual([
      { start: 0, end: 40 },
      { start: 80, end: 100 },
    ])
  })
})
