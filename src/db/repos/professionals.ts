import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../client'
import { professionalServices, professionals, services } from '../schema'

export interface ProfessionalRow {
  id: string
  tenantId: string
  name: string
  email: string | null
  phone: string | null
  bio: string | null
  color: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProfessionalWithServices extends ProfessionalRow {
  serviceIds: string[]
}

export type ProfessionalInsert = typeof professionals.$inferInsert
export type ProfessionalUpdate = Partial<Omit<ProfessionalInsert, 'id' | 'tenantId' | 'updatedAt'>>

export async function listProfessionals(
  db: Db,
  tenantId: string,
): Promise<ProfessionalWithServices[]> {
  const rows = (await db
    .select()
    .from(professionals)
    .where(eq(professionals.tenantId, tenantId))
    .orderBy(asc(professionals.name))) as ProfessionalRow[]
  if (rows.length === 0) return []

  const links = await db
    .select()
    .from(professionalServices)
    .where(eq(professionalServices.tenantId, tenantId))
  return rows.map((p) => ({
    ...p,
    serviceIds: links.filter((l) => l.professionalId === p.id).map((l) => l.serviceId),
  }))
}

export async function getProfessional(
  db: Db,
  tenantId: string,
  id: string,
): Promise<ProfessionalRow | null> {
  const rows = await db
    .select()
    .from(professionals)
    .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, id)))
    .limit(1)
  return (rows[0] as ProfessionalRow) ?? null
}

export async function insertProfessional(
  db: Db,
  values: ProfessionalInsert,
  serviceIds: string[],
): Promise<void> {
  await db.insert(professionals).values(values)
  if (serviceIds.length > 0) {
    await db.insert(professionalServices).values(
      serviceIds.map((serviceId) => ({
        professionalId: values.id,
        serviceId,
        tenantId: values.tenantId,
      })),
    )
  }
}

/** Reemplaza los servicios que ofrece un profesional (borra + inserta en batch). */
export async function replaceProfessionalServices(
  db: Db,
  tenantId: string,
  professionalId: string,
  serviceIds: string[],
): Promise<void> {
  await db.batch([
    db
      .delete(professionalServices)
      .where(
        and(
          eq(professionalServices.tenantId, tenantId),
          eq(professionalServices.professionalId, professionalId),
        ),
      ),
    ...(serviceIds.length > 0
      ? [
          db.insert(professionalServices).values(
            serviceIds.map((serviceId) => ({ professionalId, serviceId, tenantId })),
          ),
        ]
      : []),
  ])
}

export async function updateProfessional(
  db: Db,
  tenantId: string,
  id: string,
  patch: ProfessionalUpdate,
): Promise<void> {
  await db
    .update(professionals)
    .set({ ...patch, updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') })
    .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, id)))
}

export async function deleteProfessional(db: Db, tenantId: string, id: string): Promise<void> {
  await db.batch([
    db
      .delete(professionalServices)
      .where(
        and(
          eq(professionalServices.tenantId, tenantId),
          eq(professionalServices.professionalId, id),
        ),
      ),
    db
      .delete(professionals)
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.id, id))),
  ])
}

/** Valida que todos los ids pertenezcan al tenant. */
export async function allServicesExist(
  db: Db,
  tenantId: string,
  serviceIds: string[],
): Promise<boolean> {
  if (serviceIds.length === 0) return true
  const rows = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.tenantId, tenantId), inArray(services.id, serviceIds)))
  return rows.length === new Set(serviceIds).size
}
