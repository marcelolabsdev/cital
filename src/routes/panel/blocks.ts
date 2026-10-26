import { Hono } from 'hono'
import { z } from 'zod'
import type { HonoEnv } from '../../env'
import { badRequest, notFound } from '../../middleware/errors'
import { parseBody } from '../../middleware/validate'
import { createDb } from '../../db/client'
import {
  deleteTimeBlock,
  getTimeBlock,
  insertTimeBlocks,
  listTimeBlocksInRange,
} from '../../db/repos/timeBlocks'
import { getProfessional } from '../../db/repos/professionals'
import { getTenantById } from '../../db/repos/tenants'
import { newId, nowIso } from '../../lib/ids'
import { toIso, zonedToUtc } from '../../lib/tz'
import { chileanHolidays } from '../../lib/feriados-chile'

/** Bloqueos puntuales, vacaciones y feriados. */
export const blockRoutes = new Hono<HonoEnv>()

const blockBody = z
  .object({
    kind: z.enum(['block', 'holiday', 'vacation']).default('block'),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha desde inválida (YYYY-MM-DD)'),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha hasta inválida (YYYY-MM-DD)'),
    professionalId: z.string().optional().nullable(),
    note: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  })
  .strict()
  .refine((v) => v.dateTo >= v.dateFrom, { message: 'La fecha final no puede ser menor a la inicial' })

blockRoutes.get('/', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const tenant = await getTenantById(db, tenantId)
  if (!tenant) throw notFound('Negocio no encontrado')

  const from = c.req.query('from') ?? tenantToday(tenant.timezone, -30)
  const to = c.req.query('to') ?? tenantToday(tenant.timezone, 400)
  const blocks = await listTimeBlocksInRange(db, tenantId, from, to)
  return c.json({ blocks })
})

blockRoutes.post('/', async (c) => {
  const body = await parseBody(c, blockBody)
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const tenant = await getTenantById(db, tenantId)
  if (!tenant) throw notFound('Negocio no encontrado')

  let professionalId: string | null = null
  if (body.professionalId) {
    const prof = await getProfessional(db, tenantId, body.professionalId)
    if (!prof) throw badRequest('Profesional no encontrado')
    professionalId = prof.id
  }

  // Días completos en la zona del negocio, guardados en UTC
  const startAt = toIso(zonedToUtc(body.dateFrom, 0, tenant.timezone))
  const endAt = toIso(zonedToUtc(body.dateTo, 1440, tenant.timezone))

  await insertTimeBlocks(db, [
    {
      id: newId(),
      tenantId,
      professionalId,
      kind: body.kind,
      startAt,
      endAt,
      note: body.note ?? null,
      createdAt: nowIso(),
    },
  ])
  return c.json({ ok: true }, 201)
})

/** Carga los feriados legales de Chile de un año como bloqueos de día completo. */
blockRoutes.post('/holidays', async (c) => {
  const body = await parseBody(c, z.object({ year: z.number().int().min(2024).max(2100) }).strict())
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const tenant = await getTenantById(db, tenantId)
  if (!tenant) throw notFound('Negocio no encontrado')

  const holidays = chileanHolidays(body.year)
  const existing = await listTimeBlocksInRange(
    db,
    tenantId,
    toIso(zonedToUtc(`${body.year}-01-01`, 0, tenant.timezone)),
    toIso(zonedToUtc(`${body.year}-12-31`, 1440, tenant.timezone)),
  )
  const taken = new Set(
    existing
      .filter((b) => b.kind === 'holiday' && b.professionalId === null)
      .map((b) => b.note ?? ''),
  )

  const toInsert = holidays
    .filter((h) => !taken.has(`${h.date} ${h.name}`) && !taken.has(h.date))
    .map((h) => ({
      id: newId(),
      tenantId,
      professionalId: null,
      kind: 'holiday' as const,
      startAt: toIso(zonedToUtc(h.date, 0, tenant.timezone)),
      endAt: toIso(zonedToUtc(h.date, 1440, tenant.timezone)),
      note: `${h.date} ${h.name}`,
      createdAt: nowIso(),
    }))

  await insertTimeBlocks(db, toInsert)
  return c.json({ inserted: toInsert.length, total: holidays.length }, 201)
})

blockRoutes.delete('/:id', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const existing = await getTimeBlock(db, tenantId, id)
  if (!existing) throw notFound('Bloqueo no encontrado')
  await deleteTimeBlock(db, tenantId, id)
  return c.json({ ok: true })
})

function tenantToday(timezone: string, offsetDays: number): string {
  const now = new Date()
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted)
  return parts
}
