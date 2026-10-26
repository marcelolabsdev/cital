import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../env'
import { unauthorized } from './errors'
import { readSessionToken, validateSession } from '../core/auth/session'
import { createDb } from '../db/client'

/** Exige sesión válida e inyecta { userId, tenantId } en el contexto. */
export const requireAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const token = readSessionToken(c)
  if (!token) throw unauthorized()
  const db = createDb(c.env.DB)
  const session = await validateSession(db, token)
  if (!session) throw unauthorized('Tu sesión expiró. Inicia sesión nuevamente')
  c.set('auth', { userId: session.userId, tenantId: session.tenantId })
  await next()
}
