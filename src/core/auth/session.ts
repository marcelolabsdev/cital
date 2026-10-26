import { and, eq, gt } from 'drizzle-orm'
import type { CookieOptions } from 'hono/utils/cookie'
import { getCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { newId, newToken, nowIso, sha256Hex } from '../../lib/ids'
import type { Db } from '../../db/client'
import { sessions, tenants, users } from '../../db/schema'
import type { HonoEnv } from '../../env'

export const SESSION_COOKIE = 'cital_session'
const SESSION_TTL_DAYS = 30

export interface SessionUser {
  userId: string
  tenantId: string
  userName: string
  userEmail: string
  tenantName: string
  tenantSlug: string
}

/** Crea una sesión y devuelve el token en claro (solo viaja en la cookie). */
export async function createSession(db: Db, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({
    id: newId(),
    userId,
    tokenHash: await sha256Hex(token),
    expiresAt: expiresAt.toISOString(),
    createdAt: nowIso(),
  })
  return { token, expiresAt }
}

export async function validateSession(db: Db, token: string): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(token)
  const rows = await db
    .select({
      userId: users.id,
      tenantId: tenants.id,
      userName: users.name,
      userEmail: users.email,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, nowIso())))
    .limit(1)
  return rows[0] ?? null
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)))
}

export function readSessionToken(c: Context<HonoEnv>): string | undefined {
  return getCookie(c, SESSION_COOKIE)
}

export function sessionCookieOptions(expires: Date, isHttps: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
    expires,
  }
}
