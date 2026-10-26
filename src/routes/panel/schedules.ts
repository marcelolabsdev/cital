import { Hono } from 'hono'
import { z } from 'zod'
import type { HonoEnv } from '../../env'
import { AppError, badRequest } from '../../middleware/errors'
import { parseBody } from '../../middleware/validate'
import { createDb } from '../../db/client'
import { listSchedules, replaceSchedules } from '../../db/repos/schedules'
import { getProfessional } from '../../db/repos/professionals'

/** Horario semanal: del negocio (professionalId nulo) o de un profesional. */
export const scheduleRoutes = new Hono<HonoEnv>()

const interval = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .strict()

const scheduleBody = z
  .object({
    professionalId: z.string().optional().nullable(),
    intervals: z.array(interval).max(70, 'Demasiados intervalos'),
  })
  .strict()

scheduleRoutes.get('/', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const profParam = c.req.query('professionalId')

  let professionalId: string | null = null
  if (profParam && profParam !== 'business') {
    const prof = await getProfessional(db, tenantId, profParam)
    if (!prof) throw badRequest('Profesional no encontrado')
    professionalId = prof.id
  }
  return c.json({ intervals: await listSchedules(db, tenantId, professionalId) })
})

scheduleRoutes.put('/', async (c) => {
  const body = await parseBody(c, scheduleBody)
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)

  let professionalId: string | null = null
  if (body.professionalId) {
    const prof = await getProfessional(db, tenantId, body.professionalId)
    if (!prof) throw badRequest('Profesional no encontrado')
    professionalId = prof.id
  }

  try {
    await replaceSchedules(db, tenantId, professionalId, body.intervals)
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : 'Horario inválido')
  }
  return c.json({ intervals: await listSchedules(db, tenantId, professionalId) })
})
