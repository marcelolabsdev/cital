import { Hono } from 'hono'
import { z } from 'zod'
import type { HonoEnv } from '../../env'
import { conflict, notFound } from '../../middleware/errors'
import { parseBody } from '../../middleware/validate'
import { createDb } from '../../db/client'
import {
  deleteService,
  getService,
  insertService,
  listServices,
  updateService,
} from '../../db/repos/services'
import { newId, nowIso } from '../../lib/ids'

export const serviceRoutes = new Hono<HonoEnv>()

const serviceBody = z
  .object({
    name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
    description: z.string().trim().max(300, 'Máximo 300 caracteres').optional().nullable(),
    durationMinutes: z
      .number()
      .int('La duración debe ser un número entero')
      .min(5, 'La duración mínima es 5 minutos')
      .max(480, 'La duración máxima es 480 minutos'),
    priceClp: z.number().int().min(0, 'El precio no puede ser negativo').max(100_000_000),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe ser hexadecimal')
      .optional()
      .nullable(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict()

serviceRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  return c.json({ services: await listServices(db, c.get('auth').tenantId) })
})

serviceRoutes.post('/', async (c) => {
  const body = await parseBody(c, serviceBody)
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const now = nowIso()
  const id = newId()
  await insertService(db, {
    id,
    tenantId,
    name: body.name,
    description: body.description ?? null,
    durationMinutes: body.durationMinutes,
    priceClp: body.priceClp,
    color: body.color ?? null,
    isActive: body.isActive ?? true,
    sortOrder: body.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  })
  return c.json({ service: await getService(db, tenantId, id) }, 201)
})

serviceRoutes.patch('/:id', async (c) => {
  const body = await parseBody(c, serviceBody.partial())
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const existing = await getService(db, tenantId, id)
  if (!existing) throw notFound('Servicio no encontrado')
  await updateService(db, tenantId, id, body)
  return c.json({ service: await getService(db, tenantId, id) })
})

serviceRoutes.delete('/:id', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const existing = await getService(db, tenantId, id)
  if (!existing) throw notFound('Servicio no encontrado')

  const inUse = await c.env.DB.prepare(
    "SELECT COUNT(*) as n FROM appointments WHERE tenant_id = ? AND service_id = ? LIMIT 1",
  )
    .bind(tenantId, id)
    .first<{ n: number }>()
  if ((inUse?.n ?? 0) > 0) {
    throw conflict('Este servicio tiene citas asociadas. Desactívalo para no ofrecerlo más')
  }

  await deleteService(db, tenantId, id)
  return c.json({ ok: true })
})
