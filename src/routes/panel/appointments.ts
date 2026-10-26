import { Hono } from 'hono'
import { z } from 'zod'
import type { HonoEnv } from '../../env'
import { badRequest, notFound } from '../../middleware/errors'
import { parseBody } from '../../middleware/validate'
import { createDb } from '../../db/client'
import {
  listAppointmentsInRange,
  updateAppointmentStatus,
} from '../../db/repos/appointments'
import { getTenantById } from '../../db/repos/tenants'
import { createBooking } from '../../core/booking/service'
import { toIso, zonedToUtc, zonedParts } from '../../lib/tz'

/** Citas del panel: listar rango, crear manual, mover y cambiar estado. */
export const panelAppointmentRoutes = new Hono<HonoEnv>()

panelAppointmentRoutes.get('/', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const tenant = await getTenantById(db, tenantId)
  if (!tenant) throw notFound('Negocio no encontrado')

  const from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(c.req.query('from'))
  const to = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(c.req.query('to'))
  if (!from.success || !to.success) throw badRequest('Parámetros from y to (YYYY-MM-DD) requeridos')

  // Rango completo en UTC con margen por zona horaria
  const startIso = toIso(zonedToUtc(from.data, 0, tenant.timezone))
  const endIso = toIso(zonedToUtc(to.data, 1440, tenant.timezone))
  const rows = await listAppointmentsInRange(db, tenantId, startIso, endIso)
  return c.json({ appointments: rows })
})

const createSchema = z
  .object({
    serviceId: z.string().uuid(),
    professionalId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    minuteOfDay: z.number().int().min(0).max(1439),
    customerName: z.string().trim().min(2, 'Ingresa el nombre del cliente').max(80),
    customerPhone: z.string().trim().max(20).optional().or(z.literal('')),
    notes: z.string().trim().max(300).optional(),
    status: z.enum(['pending', 'confirmed']).default('confirmed'),
  })
  .strict()

/** Creación manual desde el calendario del panel. */
panelAppointmentRoutes.post('/', async (c) => {
  const body = await parseBody(c, createSchema)
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const tenant = await getTenantById(db, tenantId)
  if (!tenant) throw notFound('Negocio no encontrado')

  const startIso = toIso(zonedToUtc(body.date, body.minuteOfDay, tenant.timezone))
  const result = await createBooking(db, c.env.DB, {
    tenant,
    serviceId: body.serviceId,
    professionalId: body.professionalId,
    startIso,
    customer: { name: body.customerName, phone: body.customerPhone || null, email: null },
    source: 'panel',
    notes: body.notes ?? null,
    initialStatus: body.status,
  })
  if (!result.ok) {
    const status = result.code === 'conflict' ? 409 : 400
    throw badRequest(result.message ?? 'No se pudo crear la cita')
  }
  return c.json({ appointmentId: result.appointment!.id }, 201)
})

const moveSchema = z
  .object({
    professionalId: z.string().uuid().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    minuteOfDay: z.number().int().min(0).max(1439).optional(),
  })
  .strict()
  .refine((v) => v.professionalId !== undefined || (v.date !== undefined && v.minuteOfDay !== undefined), {
    message: 'Indica profesional y/o nueva fecha+hora',
  })

/**
 * Mover una cita (drag & drop). Valida horario dentro del horario semanal y
 * anti-solape con el INSERT atómico: recrea la cita si cambió de horario.
 */
panelAppointmentRoutes.patch('/:id/move', async (c) => {
  const body = await parseBody(c, moveSchema)
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const tenant = await getTenantById(db, tenantId)
  if (!tenant) throw notFound('Negocio no encontrado')

  const id = c.req.param('id')
  const rows = await listAppointmentsInRange(db, tenantId, '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z')
  const appt = rows.find((r) => r.id === id)
  if (!appt) throw notFound('Cita no encontrada')
  if (appt.status === 'cancelled' || appt.status === 'completed') {
    throw badRequest('Las citas canceladas o completadas no se pueden mover')
  }

  const newProfessionalId = body.professionalId ?? appt.professionalId
  const startMs =
    body.date && body.minuteOfDay !== undefined
      ? zonedToUtc(body.date, body.minuteOfDay, tenant.timezone).getTime()
      : Date.parse(appt.startAt)

  // Si no cambia nada, no-op
  if (newProfessionalId === appt.professionalId && Math.abs(startMs - Date.parse(appt.startAt)) < 1000) {
    return c.json({ ok: true, moved: false })
  }

  // Recrear con validación de disponibilidad; el swap de token y la
  // cancelación de la original viajan en el mismo batch atómico del INSERT
  const created = await createBooking(db, c.env.DB, {
    tenant,
    serviceId: appt.serviceId,
    professionalId: newProfessionalId,
    startIso: toIso(new Date(startMs)),
    customer: { name: appt.customerName, phone: appt.customerPhone, email: appt.customerEmail },
    source: 'panel',
    notes: appt.notes,
    initialStatus: appt.status === 'pending' ? 'pending' : 'confirmed',
    keepManageToken: appt.manageToken,
    releaseAppointmentId: id,
  })
  if (!created.ok) {
    throw badRequest(created.message ?? 'El nuevo horario no está disponible')
  }
  return c.json({ ok: true, moved: true, newId: created.appointment!.id })
})

const statusSchema = z
  .object({
    status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']),
    reason: z.string().trim().max(200).optional(),
  })
  .strict()

panelAppointmentRoutes.patch('/:id/status', async (c) => {
  const body = await parseBody(c, statusSchema)
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  const rows = await listAppointmentsInRange(db, tenantId, '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z')
  if (!rows.some((r) => r.id === id)) throw notFound('Cita no encontrada')

  await updateAppointmentStatus(db, tenantId, id, body.status, body.reason)
  return c.json({ ok: true })
})
