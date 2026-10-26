/**
 * Creación de reservas con protección anti doble-reserva.
 *
 * La validación de horario se hace recomputando la disponibilidad real del
 * profesional para esa fecha (horario semanal, bloqueos, feriados, buffer,
 * anticipación mínima) y exigiendo que el horario solicitado sea un slot
 * ofertado. La condición de carrera la cierra un INSERT atómico con
 * NOT EXISTS: una sola sentencia, sin ventana de conflicto en D1.
 */

import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { customers, professionalServices, professionals, services } from '../../db/schema'
import type { TenantRow } from '../../db/repos/tenants'
import { getAvailability } from '../availability/service'
import { zonedParts, zonedToUtc, toIso } from '../../lib/tz'
import { newId, newToken, nowIso } from '../../lib/ids'

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export interface BookingCustomerInput {
  name: string
  phone: string | null
  email: string | null
}

export interface BookingInput {
  tenant: TenantRow
  serviceId: string
  professionalId: string
  startIso: string // UTC ISO
  customer: BookingCustomerInput
  source: 'public' | 'panel'
  notes?: string | null
  /** El panel puede crear en estado distinto de pending */
  initialStatus?: BookingStatus
  /** Reprogramación: conserva el token del enlace de gestión original */
  keepManageToken?: string
  /**
   * Al reprogramar: id de la cita original que se cancela. Su token pasa a la
   * nueva cita; el swap ocurre en el mismo batch atómico del INSERT.
   */
  releaseAppointmentId?: string
}

export interface BookingResult {
  ok: boolean
  code?: 'service_unavailable' | 'professional_mismatch' | 'slot_unavailable' | 'conflict'
  message?: string
  appointment?: {
    id: string
    startAt: string
    endAt: string
    status: BookingStatus
    manageToken: string
    customerId: string
    priceClp: number
  }
}

export async function createBooking(
  db: Db,
  d1: D1Database,
  input: BookingInput,
): Promise<BookingResult> {
  const { tenant, serviceId, professionalId, startIso } = input

  // 1) Servicio activo del tenant
  const svcRows = await db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenant.id), eq(services.id, serviceId), eq(services.isActive, true)))
    .limit(1)
  const service = svcRows[0]
  if (!service) return { ok: false, code: 'service_unavailable', message: 'El servicio no está disponible' }

  // 2) Profesional activo que ofrece el servicio
  const proRows = await db
    .select()
    .from(professionals)
    .where(and(eq(professionals.tenantId, tenant.id), eq(professionals.id, professionalId), eq(professionals.isActive, true)))
    .limit(1)
  const professional = proRows[0]
  if (!professional) return { ok: false, code: 'professional_mismatch', message: 'El profesional no atiende este servicio' }

  const offer = await db
    .select({ serviceId: professionalServices.serviceId })
    .from(professionalServices)
    .where(
      and(
        eq(professionalServices.tenantId, tenant.id),
        eq(professionalServices.professionalId, professionalId),
        eq(professionalServices.serviceId, serviceId),
      ),
    )
    .limit(1)
  if (offer.length === 0) {
    return { ok: false, code: 'professional_mismatch', message: 'El profesional no atiende este servicio' }
  }

  // 3) Fecha local del inicio solicitado
  const startMs = Date.parse(startIso)
  if (!Number.isFinite(startMs)) return { ok: false, code: 'slot_unavailable', message: 'Horario inválido' }
  const local = zonedParts(new Date(startMs), tenant.timezone)
  const localDate = local.dateStr

  // 4) El horario debe ser un slot realmente ofertado
  const slots = await getAvailability(db, tenant, serviceId, localDate, localDate, professionalId)
  if (!slots.some((s) => s.startIso === toIso(new Date(startMs)))) {
    return { ok: false, code: 'slot_unavailable', message: 'Ese horario ya no está disponible' }
  }

  const endIso = toIso(new Date(startMs + service.durationMinutes * 60_000))
  const now = nowIso()
  const appointmentId = newId()
  const manageToken = input.keepManageToken ?? newToken()
  const status = input.initialStatus ?? 'pending'

  // 5) Cliente: buscar por teléfono/email, o crear
  const customerId = await upsertCustomer(db, tenant.id, input.customer)

  // 6) INSERT atómico: si otro proceso reservó un horario que se solapa,
  //    NOT EXISTS deja la sentencia sin filas y changes === 0. Al reprogramar,
  //    el swap de token viaja en el mismo batch (transacción de D1).
  const insertStmt = d1
    .prepare(
      `INSERT INTO appointments
         (id, tenant_id, service_id, professional_id, customer_id, start_at, end_at,
          status, price_clp, notes, source, manage_token, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13
       WHERE NOT EXISTS (
         SELECT 1 FROM appointments
         WHERE tenant_id = ?2 AND professional_id = ?4
           AND status IN ('pending', 'confirmed')
           AND start_at < ?7 AND end_at > ?6
       )`,
    )
    .bind(
      appointmentId,
      tenant.id,
      serviceId,
      professionalId,
      customerId,
      toIso(new Date(startMs)),
      endIso,
      status,
      service.priceClp,
      input.notes ?? null,
      input.source,
      manageToken,
      now,
    )

  let result: D1Result
  if (input.keepManageToken && input.releaseAppointmentId) {
    // Libera el token de la cita original y la cancela; si el INSERT choca, todo vuelve atrás
    const swapStmt = d1
      .prepare(
        `UPDATE appointments
           SET status = 'cancelled',
               cancel_reason = ?2,
               cancelled_at = ?3,
               manage_token = ?4,
               updated_at = ?3
         WHERE id = ?1 AND tenant_id = ?5 AND status IN ('pending', 'confirmed')`,
      )
      .bind(input.releaseAppointmentId, 'Reprogramada', now, newToken(), tenant.id)
    const batchResult = await d1.batch([swapStmt, insertStmt])
    result = batchResult[1]!
  } else {
    result = await insertStmt.run()
  }

  if ((result.meta.changes ?? 0) === 0) {
    return { ok: false, code: 'conflict', message: 'Alguien acaba de reservar este horario' }
  }

  return {
    ok: true,
    appointment: {
      id: appointmentId,
      startAt: toIso(new Date(startMs)),
      endAt: endIso,
      status,
      manageToken,
      customerId,
      priceClp: service.priceClp,
    },
  }
}

/** Busca cliente por teléfono (o email) del tenant; crea o actualiza su nombre. */
async function upsertCustomer(
  db: Db,
  tenantId: string,
  customer: BookingCustomerInput,
): Promise<string> {
  const phone = customer.phone?.trim() || null
  const email = customer.email?.trim().toLowerCase() || null

  const existing = await db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
  const match = existing.find(
    (c) => (phone && c.phone === phone) || (email && c.email === email),
  )

  const now = nowIso()
  if (match) {
    // Refresca el nombre si trae uno más completo
    if (customer.name && customer.name !== match.name) {
      await db
        .update(customers)
        .set({ name: customer.name, phone: phone ?? match.phone, email: email ?? match.email, updatedAt: now })
        .where(eq(customers.id, match.id))
    }
    return match.id
  }

  const id = newId()
  await db.insert(customers).values({
    id,
    tenantId,
    name: customer.name,
    phone,
    email,
    createdAt: now,
    updatedAt: now,
  })
  return id
}
