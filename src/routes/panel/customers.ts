import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, like, or } from 'drizzle-orm'
import type { HonoEnv } from '../../env'
import { notFound } from '../../middleware/errors'
import { parseBody } from '../../middleware/validate'
import { createDb } from '../../db/client'
import { appointments, customers, services } from '../../db/schema'
import { newId, nowIso } from '../../lib/ids'

/** Clientes: búsqueda, ficha con historial, notas y exportación CSV. */
export const customerRoutes = new Hono<HonoEnv>()

customerRoutes.get('/', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const q = c.req.query('q')?.trim()

  const base = db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      notes: customers.notes,
      createdAt: customers.createdAt,
    })
    .from(customers)

  const rows = q
    ? await base
        .where(
          and(
            eq(customers.tenantId, tenantId),
            or(like(customers.name, `%${q}%`), like(customers.phone, `%${q}%`), like(customers.email, `%${q}%`)),
          ),
        )
        .orderBy(customers.name)
        .limit(200)
    : await base.where(eq(customers.tenantId, tenantId)).orderBy(customers.name).limit(200)

  // Conteo de citas por cliente (una consulta liviana)
  const counts = await db
    .select({ customerId: appointments.customerId })
    .from(appointments)
    .where(eq(appointments.tenantId, tenantId))
  const countMap = new Map<string, number>()
  for (const r of counts) countMap.set(r.customerId, (countMap.get(r.customerId) ?? 0) + 1)

  return c.json({
    customers: rows.map((r) => ({ ...r, appointmentsCount: countMap.get(r.id) ?? 0 })),
  })
})

/** Exportación CSV de clientes (con BOM para Excel). Va antes de /:id para no colisionar. */
customerRoutes.get('/export.csv', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
    .orderBy(customers.name)

  const esc = (v: string | null) => {
    const s = v ?? ''
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = ['Nombre,Telefono,Email,Notas,Registrado']
  for (const r of rows) {
    lines.push([esc(r.name), esc(r.phone), esc(r.email), esc(r.notes), r.createdAt].join(','))
  }
  const csv = '\uFEFF' + lines.join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clientes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
})

customerRoutes.get('/:id', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)))
    .limit(1)
  const customer = rows[0]
  if (!customer) throw notFound('Cliente no encontrado')

  const history = await db
    .select({
      id: appointments.id,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      status: appointments.status,
      priceClp: appointments.priceClp,
      source: appointments.source,
      serviceName: services.name,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.customerId, id)))
    .orderBy(desc(appointments.startAt))
    .limit(100)

  return c.json({ customer, history })
})

const notesSchema = z
  .object({
    notes: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
    name: z.string().trim().min(2).max(80).optional(),
  })
  .strict()

customerRoutes.patch('/:id', async (c) => {
  const body = await parseBody(c, notesSchema)
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)))
    .limit(1)
  if (rows.length === 0) throw notFound('Cliente no encontrado')

  await db
    .update(customers)
    .set({ notes: body.notes, ...(body.name ? { name: body.name } : {}), updatedAt: nowIso() })
    .where(eq(customers.id, id))
  return c.json({ ok: true })
})
