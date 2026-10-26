/**
 * Orquestador de disponibilidad: carga los datos de un tenant desde D1,
 * arma las entradas del motor puro y fusiona resultados de varios
 * profesionales (modo "cualquiera").
 */

import type { Db } from '../../db/client'
import { and, eq, gte, inArray, lte, ne, or, isNull } from 'drizzle-orm'
import { appointments, professionalServices, professionals, schedules, services, timeBlocks } from '../../db/schema'
import type { TenantRow } from '../../db/repos/tenants'
import { getTenantBySlug } from '../../db/repos/tenants'
import { computeSlots, type BusyRange, type ScheduleRule, type Slot } from './engine'
import { toIso, zonedParts, zonedToUtc } from '../../lib/tz'

const SLOT_STEP_MIN = 15

export interface PublicSlot {
  startIso: string
  endIso: string
  localDate: string
  localMinute: number
  professionalId: string
}

export interface ProfessionalPublic {
  id: string
  name: string
  color: string | null
  bio: string | null
}

export interface AvailabilityContext {
  tenant: TenantRow
  service: { id: string; name: string; durationMinutes: number; priceClp: number; color: string | null; description: string | null }
  professionals: ProfessionalPublic[]
}

/** Info pública del negocio + profesionales activos que ofrecen cada servicio (mapa). */
export async function getPublicContext(
  db: Db,
  slug: string,
): Promise<
  | {
      tenant: TenantRow
      services: (AvailabilityContext['service'] & { professionalIds: string[] })[]
      professionals: ProfessionalPublic[]
    }
  | null
> {
  const tenant = await getTenantBySlug(db, slug)
  if (!tenant) return null

  const svcRows = await db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)))
    .orderBy(services.sortOrder, services.name)

  const proRows = (await db
    .select()
    .from(professionals)
    .where(and(eq(professionals.tenantId, tenant.id), eq(professionals.isActive, true)))
    .orderBy(professionals.name)) as ProfessionalPublic[]

  const links = await db
    .select()
    .from(professionalServices)
    .where(eq(professionalServices.tenantId, tenant.id))

  return {
    tenant,
    services: svcRows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceClp: s.priceClp,
      color: s.color,
      professionalIds: links
        .filter((l) => l.serviceId === s.id && proRows.some((p) => p.id === l.professionalId))
        .map((l) => l.professionalId),
    })),
    professionals: proRows.map((p) => ({ id: p.id, name: p.name, color: p.color, bio: p.bio })),
  }
}

/**
 * Slots disponibles de un servicio para un rango de fechas locales.
 * `professionalId === null` → cualquiera (unión eligiendo el profesional).
 */
export async function getAvailability(
  db: Db,
  tenant: TenantRow,
  serviceId: string,
  dateFrom: string,
  dateTo: string,
  professionalId: string | null,
): Promise<PublicSlot[]> {
  const svc = await db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenant.id), eq(services.id, serviceId), eq(services.isActive, true)))
    .limit(1)
  if (svc.length === 0) return []
  const service = svc[0]!

  // Profesionales que ofrecen el servicio
  const offerRows = await db
    .select({ professionalId: professionalServices.professionalId })
    .from(professionalServices)
    .where(
      and(eq(professionalServices.tenantId, tenant.id), eq(professionalServices.serviceId, serviceId)),
    )
  const offering = new Set(offerRows.map((r) => r.professionalId))

  const activePros = (await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(and(eq(professionals.tenantId, tenant.id), eq(professionals.isActive, true)))) as {
    id: string
  }[]

  let targets = activePros.filter((p) => offering.has(p.id)).map((p) => p.id)
  if (professionalId) {
    targets = targets.filter((id) => id === professionalId)
  }
  if (targets.length === 0) return []

  // Ventana UTC con margen de un día por zona horaria
  const rangeStartUtc = zonedToUtc(dateFrom, 0, tenant.timezone)
  const rangeEndUtc = zonedToUtc(dateTo, 1440, tenant.timezone)
  const rangeStart = toIso(rangeStartUtc)
  const rangeEnd = toIso(rangeEndUtc)

  const allSchedules = await db
    .select()
    .from(schedules)
    .where(eq(schedules.tenantId, tenant.id))

  const blocks = (await db
    .select({
      professionalId: timeBlocks.professionalId,
      startAt: timeBlocks.startAt,
      endAt: timeBlocks.endAt,
    })
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.tenantId, tenant.id),
        or(isNull(timeBlocks.professionalId), inArray(timeBlocks.professionalId, targets)),
        lte(timeBlocks.startAt, rangeEnd),
        gte(timeBlocks.endAt, rangeStart),
      ),
    )) as { professionalId: string | null; startAt: string; endAt: string }[]

  const appts = await db
    .select({ professionalId: appointments.professionalId, startAt: appointments.startAt, endAt: appointments.endAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenant.id),
        inArray(appointments.professionalId, targets),
        inArray(appointments.status, ['pending', 'confirmed']),
        lte(appointments.startAt, rangeEnd),
        gte(appointments.endAt, rangeStart),
      ),
    )

  const businessRules = allSchedules
    .filter((s) => s.professionalId === null)
    .map((s) => ({ weekday: s.weekday, startMinute: s.startMinute, endMinute: s.endMinute }))

  const now = new Date()
  const byStart = new Map<string, PublicSlot>()

  for (const profId of targets) {
    const ownRules = allSchedules
      .filter((s) => s.professionalId === profId)
      .map((s) => ({ weekday: s.weekday, startMinute: s.startMinute, endMinute: s.endMinute }))
    const rules: ScheduleRule[] = ownRules.length > 0 ? ownRules : businessRules
    if (rules.length === 0) continue

    const busy: BusyRange[] = [
      ...blocks
        .filter((b) => b.professionalId === null || b.professionalId === profId)
        .map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
      ...appts
        .filter((a) => a.professionalId === profId)
        .map((a) => ({ startAt: a.startAt, endAt: a.endAt })),
    ]

    const slots = computeSlots({
      timezone: tenant.timezone,
      dateFrom,
      dateTo,
      serviceDurationMin: service.durationMinutes,
      slotStepMin: SLOT_STEP_MIN,
      bufferMin: tenant.bufferMinutes,
      minLeadMin: tenant.bookingLeadHours * 60,
      maxLeadDays: tenant.bookingWindowDays,
      now,
      schedules: rules,
      busy,
    })

    for (const s of slots) {
      const existing = byStart.get(s.startIso)
      if (!existing) {
        byStart.set(s.startIso, { ...s, professionalId: profId })
      }
      // "cualquiera": nos quedamos con el primero; el INSERT atómico garantiza consistencia
    }
  }

  return [...byStart.values()].sort((a, b) => a.startIso.localeCompare(b.startIso))
}

/** Días del mes con al menos un slot disponible (para deshabilitar fechas vacías). */
export async function getAvailableDays(
  db: Db,
  tenant: TenantRow,
  serviceId: string,
  month: string, // 'YYYY-MM'
  professionalId: string | null,
): Promise<string[]> {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  const dateFrom = `${month}-01`
  const dateTo = `${month}-${String(lastDay).padStart(2, '0')}`
  const slots = await getAvailability(db, tenant, serviceId, dateFrom, dateTo, professionalId)
  return [...new Set(slots.map((s) => s.localDate))].sort()
}
