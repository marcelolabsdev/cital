import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../client'
import { schedules } from '../schema'

export interface ScheduleInterval {
  id: string
  professionalId: string | null
  weekday: number // 0 = lunes
  startMinute: number
  endMinute: number
}

export interface IntervalInput {
  weekday: number
  startMinute: number
  endMinute: number
}

function scope(tenantId: string, professionalId: string | null) {
  return professionalId === null
    ? and(eq(schedules.tenantId, tenantId), isNull(schedules.professionalId))
    : and(eq(schedules.tenantId, tenantId), eq(schedules.professionalId, professionalId))
}

export async function listSchedules(
  db: Db,
  tenantId: string,
  professionalId: string | null,
): Promise<ScheduleInterval[]> {
  return (await db
    .select()
    .from(schedules)
    .where(scope(tenantId, professionalId))) as ScheduleInterval[]
}

/**
 * Reemplaza el horario semanal completo de un ámbito (negocio o profesional).
 * Valida intervalos y solapes antes de escribir; batch = transacción.
 */
export async function replaceSchedules(
  db: Db,
  tenantId: string,
  professionalId: string | null,
  intervals: IntervalInput[],
): Promise<void> {
  validateIntervals(intervals)
  await db.batch([
    db.delete(schedules).where(scope(tenantId, professionalId)),
    ...(intervals.length > 0
      ? [
          db.insert(schedules).values(
            intervals.map((i) => ({
              id: crypto.randomUUID(),
              tenantId,
              professionalId,
              weekday: i.weekday,
              startMinute: i.startMinute,
              endMinute: i.endMinute,
            })),
          ),
        ]
      : []),
  ])
}

export function validateIntervals(intervals: IntervalInput[]): void {
  for (const i of intervals) {
    if (i.weekday < 0 || i.weekday > 6) throw new Error('Día de la semana inválido')
    if (i.startMinute < 0 || i.startMinute >= 1440) throw new Error('Hora de inicio inválida')
    if (i.endMinute <= 0 || i.endMinute > 1440) throw new Error('Hora de término inválida')
    if (i.endMinute <= i.startMinute) {
      throw new Error('La hora de término debe ser mayor a la de inicio')
    }
  }
  // Solapes dentro del mismo día
  const byDay = new Map<number, IntervalInput[]>()
  for (const i of intervals) {
    const list = byDay.get(i.weekday) ?? []
    list.push(i)
    byDay.set(i.weekday, list)
  }
  for (const [, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute)
    for (let k = 1; k < sorted.length; k++) {
      const prev = sorted[k - 1]!
      const cur = sorted[k]!
      if (cur.startMinute < prev.endMinute) {
        throw new Error('Hay horarios que se solapan el mismo día')
      }
    }
  }
}
