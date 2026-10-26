import { and, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '../client'
import { timeBlocks } from '../schema'

export interface TimeBlockRow {
  id: string
  tenantId: string
  professionalId: string | null
  kind: 'block' | 'holiday' | 'vacation'
  startAt: string // UTC ISO
  endAt: string // UTC ISO
  note: string | null
  createdAt: string
}

export type TimeBlockInsert = typeof timeBlocks.$inferInsert

export async function insertTimeBlock(db: Db, values: TimeBlockInsert): Promise<void> {
  await db.insert(timeBlocks).values(values)
}

export async function insertTimeBlocks(db: Db, values: TimeBlockInsert[]): Promise<void> {
  if (values.length === 0) return
  // D1/SQLite limita las variables por sentencia (~100): lotes de 10 filas
  const chunks: TimeBlockInsert[][] = []
  for (let i = 0; i < values.length; i += 10) chunks.push(values.slice(i, i + 10))
  const stmts = chunks.map((chunk) => db.insert(timeBlocks).values(chunk))
  await db.batch([stmts[0]!, ...stmts.slice(1)])
}

export async function getTimeBlock(
  db: Db,
  tenantId: string,
  id: string,
): Promise<TimeBlockRow | null> {
  const rows = await db
    .select()
    .from(timeBlocks)
    .where(and(eq(timeBlocks.tenantId, tenantId), eq(timeBlocks.id, id)))
    .limit(1)
  return (rows[0] as TimeBlockRow) ?? null
}

export async function deleteTimeBlock(db: Db, tenantId: string, id: string): Promise<void> {
  await db.delete(timeBlocks).where(and(eq(timeBlocks.tenantId, tenantId), eq(timeBlocks.id, id)))
}

/** Bloqueos (del negocio y de profesionales) que tocan el rango [fromIso, toIso] UTC. */
export async function listTimeBlocksInRange(
  db: Db,
  tenantId: string,
  fromIso: string,
  toIso: string,
): Promise<TimeBlockRow[]> {
  return (await db
    .select()
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.tenantId, tenantId),
        lte(timeBlocks.startAt, toIso),
        gte(timeBlocks.endAt, fromIso),
      ),
    )) as TimeBlockRow[]
}
