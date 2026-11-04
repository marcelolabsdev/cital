import { Hono } from 'hono'
import { z } from 'zod'
import type { HonoEnv } from '../../env'
import { badRequest, conflict, notFound } from '../../middleware/errors'
import { parseBody } from '../../middleware/validate'
import { createDb } from '../../db/client'
import {
  allServicesExist,
  deleteProfessional,
  getProfessional,
  insertProfessional,
  listProfessionals,
  replaceProfessionalServices,
  updateProfessional,
} from '../../db/repos/professionals'
import {
  getConnectionForProfessional,
  listConnections,
} from '../../db/repos/calendarConnections'
import { newId, nowIso } from '../../lib/ids'
import type { ProfessionalRow } from '../../db/repos/professionals'

export const professionalRoutes = new Hono<HonoEnv>()

/** Proyecta un profesional para el frontend: estado de calendario sí, ids internos no. */
function toClient(p: ProfessionalRow, conn: { accountEmail: string | null } | null) {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    bio: p.bio,
    color: p.color,
    photo: p.photo,
    isActive: p.isActive,
    googleConnected: !!conn,
    googleEmail: conn?.accountEmail ?? null,
    serviceIds: [] as string[],
  }
}

const professionalBody = z
  .object({
    name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
    email: z.string().trim().toLowerCase().email('Email inválido').optional().nullable(),
    phone: z.string().trim().max(20).optional().nullable(),
    bio: z.string().trim().max(300, 'Máximo 300 caracteres').optional().nullable(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe ser hexadecimal')
      .optional()
      .nullable(),
    photo: z
      .string()
      .startsWith('data:image/', 'La foto debe ser una imagen')
      .max(150_000, 'La foto es demasiado grande')
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
    serviceIds: z.array(z.string()).max(200).optional(),
  })
  .strict()

professionalRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const tenantId = c.get('auth').tenantId
  const [rows, connections] = await Promise.all([
    listProfessionals(db, tenantId),
    listConnections(db, tenantId),
  ])
  const byProfessional = new Map(
    connections.map((conn) => [conn.professionalId, conn]),
  )
  return c.json({
    professionals: rows.map((p) => ({
      ...toClient(p as unknown as ProfessionalRow, byProfessional.get(p.id) ?? null),
      serviceIds: p.serviceIds,
    })),
  })
})

professionalRoutes.post('/', async (c) => {
  const body = await parseBody(c, professionalBody)
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)

  const serviceIds = body.serviceIds ?? []
  if (!(await allServicesExist(db, tenantId, serviceIds))) {
    throw badRequest('Uno o más servicios no pertenecen a tu negocio')
  }

  const now = nowIso()
  const id = newId()
  await insertProfessional(
    db,
    {
      id,
      tenantId,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      bio: body.bio ?? null,
      color: body.color ?? null,
      photo: body.photo ?? null,
      isActive: body.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    },
    serviceIds,
  )
  const created = (await getProfessional(db, tenantId, id)) as ProfessionalRow | null
  const conn = created ? await getConnectionForProfessional(db, tenantId, id) : null
  return c.json({ professional: created ? { ...toClient(created, conn), serviceIds } : null }, 201)
})

professionalRoutes.patch('/:id', async (c) => {
  const body = await parseBody(c, professionalBody.partial())
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const existing = await getProfessional(db, tenantId, id)
  if (!existing) throw notFound('Profesional no encontrado')

  if (body.serviceIds !== undefined) {
    if (!(await allServicesExist(db, tenantId, body.serviceIds))) {
      throw badRequest('Uno o más servicios no pertenecen a tu negocio')
    }
    await replaceProfessionalServices(db, tenantId, id, body.serviceIds)
  }

  const { serviceIds: _ignored, ...patch } = body
  if (Object.keys(patch).length > 0) {
    await updateProfessional(db, tenantId, id, patch)
  }
  const updated = (await getProfessional(db, tenantId, id)) as ProfessionalRow | null
  const conn = updated ? await getConnectionForProfessional(db, tenantId, id) : null
  return c.json({
    professional: updated ? { ...toClient(updated, conn), serviceIds: body.serviceIds ?? [] } : null,
  })
})

professionalRoutes.delete('/:id', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const existing = await getProfessional(db, tenantId, id)
  if (!existing) throw notFound('Profesional no encontrado')

  const inUse = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM appointments WHERE tenant_id = ? AND professional_id = ? LIMIT 1',
  )
    .bind(tenantId, id)
    .first<{ n: number }>()
  if ((inUse?.n ?? 0) > 0) {
    throw conflict(
      'Este profesional tiene citas asociadas. Desactívalo para que no reciba reservas',
    )
  }

  await deleteProfessional(db, tenantId, id)
  return c.json({ ok: true })
})
