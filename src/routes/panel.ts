import { Hono } from 'hono'
import { z } from 'zod'
import type { HonoEnv } from '../env'
import { requireAuth } from '../middleware/auth'
import { parseBody } from '../middleware/validate'
import { conflict } from '../middleware/errors'
import { createDb } from '../db/client'
import { getTenantById, slugTakenByOther, updateTenant } from '../db/repos/tenants'
import { isValidSlug } from '../lib/slug'
import { serviceRoutes } from './panel/services'
import { professionalRoutes } from './panel/professionals'
import { scheduleRoutes } from './panel/schedules'
import { blockRoutes } from './panel/blocks'
import { panelAppointmentRoutes } from './panel/appointments'
import { customerRoutes } from './panel/customers'
import { dashboardRoutes } from './panel/dashboard'

export const panelRoutes = new Hono<HonoEnv>()

panelRoutes.use('*', requireAuth)
panelRoutes.route('/services', serviceRoutes)
panelRoutes.route('/professionals', professionalRoutes)
panelRoutes.route('/schedules', scheduleRoutes)
panelRoutes.route('/blocks', blockRoutes)
panelRoutes.route('/appointments', panelAppointmentRoutes)
panelRoutes.route('/customers', customerRoutes)
panelRoutes.route('/dashboard', dashboardRoutes)

const TIMEZONES = new Set(['America/Santiago', 'America/Punta_Arenas', 'America/EasterIsland'])

const onboardingSchema = z
  .object({
    name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80).optional(),
    slug: z
      .string()
      .trim()
      .min(3, 'El enlace debe tener al menos 3 caracteres')
      .max(48, 'El enlace no puede superar 48 caracteres')
      .optional(),
    description: z.string().trim().max(300, 'La descripción no puede superar 300 caracteres').optional(),
    timezone: z.string().optional(),
    onboardingStep: z.number().int().min(1).max(4).optional(),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe ser hexadecimal, por ejemplo #4f46e5')
      .optional(),
    cancellationPolicyMode: z.enum(['hours', 'no_refund']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' })

/** Guarda los datos del negocio durante (y después de) el onboarding. */
panelRoutes.patch('/onboarding', async (c) => {
  const body = await parseBody(c, onboardingSchema)
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)

  if (body.slug !== undefined) {
    const slug = body.slug.toLowerCase()
    if (!isValidSlug(slug)) {
      throw conflict('Ese enlace no está disponible. Usa letras, números y guiones')
    }
    if (await slugTakenByOther(db, slug, tenantId)) {
      throw conflict('Ese enlace ya está tomado por otro negocio')
    }
    body.slug = slug
  }
  if (body.timezone !== undefined && !TIMEZONES.has(body.timezone)) {
    body.timezone = 'America/Santiago'
  }

  await updateTenant(db, tenantId, body)
  const tenant = await getTenantById(db, tenantId)
  return c.json({ tenant })
})
