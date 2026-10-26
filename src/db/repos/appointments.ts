import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { Db } from '../client'
import { appointments, customers, professionals, services, tenants } from '../schema'

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

export interface AppointmentDetail {
  id: string
  tenantId: string
  tenantSlug: string
  serviceId: string
  professionalId: string
  customerId: string
  startAt: string
  endAt: string
  status: AppointmentStatus
  priceClp: number
  notes: string | null
  source: string
  manageToken: string
  cancelReason: string | null
  cancelledAt: string | null
  createdAt: string
  // joins
  serviceName: string
  serviceDurationMinutes: number
  professionalName: string
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
}

/** Detalle de una reserva por su token de gestión (cancelar/reprogramar sin login). */
export async function getByManageToken(db: Db, token: string): Promise<AppointmentDetail | null> {
  const rows = await db
    .select({
      id: appointments.id,
      tenantId: appointments.tenantId,
      tenantSlug: tenants.slug,
      serviceId: appointments.serviceId,
      professionalId: appointments.professionalId,
      customerId: appointments.customerId,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      status: appointments.status,
      priceClp: appointments.priceClp,
      notes: appointments.notes,
      source: appointments.source,
      manageToken: appointments.manageToken,
      cancelReason: appointments.cancelReason,
      cancelledAt: appointments.cancelledAt,
      createdAt: appointments.createdAt,
      serviceName: services.name,
      serviceDurationMinutes: services.durationMinutes,
      professionalName: professionals.name,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
    .from(appointments)
    .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(eq(appointments.manageToken, token))
    .orderBy(desc(appointments.createdAt))
    .limit(1)
  return (rows[0] as AppointmentDetail) ?? null
}

export interface AppointmentRow extends Omit<AppointmentDetail, 'serviceName' | 'serviceDurationMinutes' | 'professionalName' | 'customerName' | 'customerPhone' | 'customerEmail'> {}

export async function updateAppointmentStatus(
  db: Db,
  tenantId: string,
  id: string,
  status: AppointmentStatus,
  cancelReason?: string,
): Promise<void> {
  await db
    .update(appointments)
    .set({
      status,
      cancelReason: cancelReason ?? null,
      cancelledAt: status === 'cancelled' ? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
      updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    })
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id)))
}

/** Cancela la cita activa identificada por token (para reprogramación). */
export async function cancelActiveByToken(
  db: Db,
  token: string,
  reason: string,
): Promise<boolean> {
  const result = await db
    .update(appointments)
    .set({
      status: 'cancelled',
      cancelReason: reason,
      cancelledAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    })
    .where(and(eq(appointments.manageToken, token), inArray(appointments.status, ['pending', 'confirmed'])))
  return true
}

/** Citas activas de un tenant en rango UTC (para calendario y motor). */
export async function listAppointmentsInRange(
  db: Db,
  tenantId: string,
  fromIso: string,
  toIso: string,
): Promise<AppointmentDetail[]> {
  return (await db
    .select({
      id: appointments.id,
      tenantId: appointments.tenantId,
      serviceId: appointments.serviceId,
      professionalId: appointments.professionalId,
      customerId: appointments.customerId,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      status: appointments.status,
      priceClp: appointments.priceClp,
      notes: appointments.notes,
      source: appointments.source,
      manageToken: appointments.manageToken,
      cancelReason: appointments.cancelReason,
      cancelledAt: appointments.cancelledAt,
      createdAt: appointments.createdAt,
      serviceName: services.name,
      serviceDurationMinutes: services.durationMinutes,
      professionalName: professionals.name,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        lte(appointments.startAt, toIso),
        gte(appointments.endAt, fromIso),
      ),
    )
    .orderBy(appointments.startAt)) as AppointmentDetail[]
}
