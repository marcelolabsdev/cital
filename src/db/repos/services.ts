import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '../client'
import { services } from '../schema'

export interface ServiceRow {
  id: string
  tenantId: string
  name: string
  description: string | null
  durationMinutes: number
  priceClp: number
  color: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ServiceInsert = typeof services.$inferInsert
export type ServiceUpdate = Partial<Omit<ServiceInsert, 'id' | 'tenantId' | 'updatedAt'>>

export async function listServices(db: Db, tenantId: string): Promise<ServiceRow[]> {
  return (await db
    .select()
    .from(services)
    .where(eq(services.tenantId, tenantId))
    .orderBy(asc(services.sortOrder), asc(services.name))) as ServiceRow[]
}

export async function insertService(db: Db, values: ServiceInsert): Promise<void> {
  await db.insert(services).values(values)
}

export async function getService(db: Db, tenantId: string, id: string): Promise<ServiceRow | null> {
  const rows = await db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenantId), eq(services.id, id)))
    .limit(1)
  return (rows[0] as ServiceRow) ?? null
}

export async function updateService(
  db: Db,
  tenantId: string,
  id: string,
  patch: ServiceUpdate,
): Promise<void> {
  await db
    .update(services)
    .set({ ...patch, updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') })
    .where(and(eq(services.tenantId, tenantId), eq(services.id, id)))
}

export async function deleteService(db: Db, tenantId: string, id: string): Promise<void> {
  await db.delete(services).where(and(eq(services.tenantId, tenantId), eq(services.id, id)))
}

export async function countServices(db: Db, tenantId: string): Promise<number> {
  const rows = await db.select({ id: services.id }).from(services).where(eq(services.tenantId, tenantId))
  return rows.length
}
