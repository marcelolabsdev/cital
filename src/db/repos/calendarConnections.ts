import { and, eq } from 'drizzle-orm'
import type { Db } from '../client'
import { calendarConnections } from '../schema'
import { newId } from '../../lib/ids'

export interface CalendarConnectionRow {
  id: string
  tenantId: string
  professionalId: string
  provider: string
  connectedAccountId: string
  accountEmail: string | null
  connectedAt: string
}

export type CalendarConnectionInsert = typeof calendarConnections.$inferInsert

/** Guarda (o reemplaza) la conexión de calendario de un profesional. */
export async function upsertConnection(
  db: Db,
  conn: CalendarConnectionInsert,
): Promise<void> {
  await db.batch([
    db
      .delete(calendarConnections)
      .where(
        and(
          eq(calendarConnections.tenantId, conn.tenantId),
          eq(calendarConnections.professionalId, conn.professionalId),
        ),
      ),
    db.insert(calendarConnections).values(conn),
  ])
}

export async function getConnectionForProfessional(
  db: Db,
  tenantId: string,
  professionalId: string,
): Promise<CalendarConnectionRow | null> {
  const rows = await db
    .select()
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.tenantId, tenantId),
        eq(calendarConnections.professionalId, professionalId),
      ),
    )
    .limit(1)
  return (rows[0] as CalendarConnectionRow) ?? null
}

export async function listConnections(
  db: Db,
  tenantId: string,
): Promise<CalendarConnectionRow[]> {
  return (await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.tenantId, tenantId))) as CalendarConnectionRow[]
}

export async function removeConnection(
  db: Db,
  tenantId: string,
  professionalId: string,
): Promise<void> {
  await db
    .delete(calendarConnections)
    .where(
      and(
        eq(calendarConnections.tenantId, tenantId),
        eq(calendarConnections.professionalId, professionalId),
      ),
    )
}
