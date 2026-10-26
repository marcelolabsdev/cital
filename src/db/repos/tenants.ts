import { eq, ne, and } from 'drizzle-orm'
import type { Db } from '../client'
import { tenants } from '../schema'

export interface TenantRow {
  id: string
  slug: string
  name: string
  description: string | null
  timezone: string
  logoUrl: string | null
  brandColor: string
  cancellationPolicyHours: number
  cancellationPolicyMode: 'hours' | 'no_refund'
  bufferMinutes: number
  bookingLeadHours: number
  bookingWindowDays: number
  onboardingStep: number
  plan: string
  trialEndsAt: string | null
  createdAt: string
  updatedAt: string
}

export type TenantInsert = typeof tenants.$inferInsert
export type TenantUpdate = Partial<Omit<TenantInsert, 'id' | 'updatedAt'>>

export async function insertTenant(db: Db, values: TenantInsert): Promise<void> {
  await db.insert(tenants).values(values)
}

export async function getTenantById(db: Db, id: string): Promise<TenantRow | null> {
  const rows = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
  return (rows[0] as TenantRow) ?? null
}

export async function getTenantBySlug(db: Db, slug: string): Promise<TenantRow | null> {
  const rows = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
  return (rows[0] as TenantRow) ?? null
}

export async function updateTenant(db: Db, id: string, patch: TenantUpdate): Promise<void> {
  await db
    .update(tenants)
    .set({ ...patch, updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') })
    .where(eq(tenants.id, id))
}

/** ¿Slug ya tomado por otro tenant? */
export async function slugTakenByOther(db: Db, slug: string, excludeTenantId: string): Promise<boolean> {
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), ne(tenants.id, excludeTenantId)))
    .limit(1)
  return rows.length > 0
}

export async function slugExists(db: Db, slug: string): Promise<boolean> {
  const rows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1)
  return rows.length > 0
}
