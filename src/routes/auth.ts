import { Hono } from 'hono'
import { z } from 'zod'
import { deleteCookie, setCookie } from 'hono/cookie'
import type { HonoEnv } from '../env'
import { AppError, conflict } from '../middleware/errors'
import { parseBody } from '../middleware/validate'
import { hashPassword, verifyPassword } from '../core/auth/password'
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  readSessionToken,
  sessionCookieOptions,
  validateSession,
} from '../core/auth/session'
import { createDb } from '../db/client'
import { getTenantById } from '../db/repos/tenants'
import { getUserByEmail } from '../db/repos/users'
import { sessions, tenants, users } from '../db/schema'
import { newId, newToken, nowIso, sha256Hex } from '../lib/ids'
import { slugify, suggestSlug } from '../lib/slug'
import { clientIp, rateLimit } from '../lib/rate-limit'

export const authRoutes = new Hono<HonoEnv>()

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const registerSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'El nombre del negocio debe tener al menos 2 caracteres')
    .max(80, 'El nombre del negocio no puede superar 80 caracteres'),
  name: z.string().trim().min(2, 'Tu nombre debe tener al menos 2 caracteres').max(80),
  email: z.string().trim().toLowerCase().email('Ingresa un email válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
})

authRoutes.post('/register', async (c) => {
  const limit = await rateLimit(c.env.CACHE, `register:${clientIp(c.req.raw.headers)}`, 5, 600)
  if (!limit.allowed) {
    throw new AppError(429, 'rate_limited', 'Demasiados intentos. Intenta de nuevo en unos minutos')
  }

  const body = await parseBody(c, registerSchema)
  const db = createDb(c.env.DB)

  const existing = await getUserByEmail(db, body.email)
  if (existing) throw conflict('Ya existe una cuenta con ese email. Inicia sesión')

  // Slug público único a partir del nombre del negocio
  const baseSlug = slugify(body.businessName)
  const taken = new Set<string>()
  if (baseSlug) {
    const similar = await c.env.DB.prepare(
      "SELECT slug FROM tenants WHERE slug = ? OR slug LIKE ? || '-'",
    )
      .bind(baseSlug, `${baseSlug}-%`)
      .all<{ slug: string }>()
    for (const row of similar.results ?? []) taken.add(row.slug)
  }
  const slug = suggestSlug(baseSlug, taken)

  const now = nowIso()
  const tenantId = newId()
  const userId = newId()
  const token = newToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const passwordHash = await hashPassword(body.password)

  // Transacción: negocio + usuario + sesión, todo o nada
  await db.batch([
    db.insert(tenants).values({
      id: tenantId,
      slug,
      name: body.businessName.trim(),
      timezone: 'America/Santiago',
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(users).values({
      id: userId,
      tenantId,
      email: body.email,
      passwordHash,
      name: body.name.trim(),
      role: 'owner',
      createdAt: now,
    }),
    db.insert(sessions).values({
      id: newId(),
      userId,
      tokenHash: await sha256Hex(token),
      expiresAt: expiresAt.toISOString(),
      createdAt: now,
    }),
  ])

  const isHttps = new URL(c.req.url).protocol === 'https:'
  setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(expiresAt, isHttps))

  return c.json(
    {
      user: { id: userId, name: body.name.trim(), email: body.email },
      tenant: { id: tenantId, slug, name: body.businessName.trim() },
    },
    201,
  )
})

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresa un email válido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

authRoutes.post('/login', async (c) => {
  const limit = await rateLimit(c.env.CACHE, `login:${clientIp(c.req.raw.headers)}`, 10, 300)
  if (!limit.allowed) {
    throw new AppError(429, 'rate_limited', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo')
  }

  const body = await parseBody(c, loginSchema)
  const db = createDb(c.env.DB)
  const user = await getUserByEmail(db, body.email)
  if (!user) throw new AppError(401, 'invalid_credentials', 'Email o contraseña incorrectos')

  const valid = await verifyPassword(body.password, user.passwordHash)
  if (!valid) throw new AppError(401, 'invalid_credentials', 'Email o contraseña incorrectos')

  const { token, expiresAt } = await createSession(db, user.id)
  const isHttps = new URL(c.req.url).protocol === 'https:'
  setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(expiresAt, isHttps))

  return c.json({
    user: { id: user.id, name: user.name, email: user.email },
    tenant: { id: user.tenantId },
  })
})

authRoutes.post('/logout', async (c) => {
  const token = readSessionToken(c)
  if (token) {
    await deleteSession(createDb(c.env.DB), token)
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

authRoutes.get('/me', async (c) => {
  const token = readSessionToken(c)
  if (!token) throw new AppError(401, 'unauthorized', 'Debes iniciar sesión')
  const session = await validateSession(createDb(c.env.DB), token)
  if (!session) throw new AppError(401, 'unauthorized', 'Tu sesión expiró')

  const tenant = await getTenantById(createDb(c.env.DB), session.tenantId)
  if (!tenant) throw new AppError(401, 'unauthorized', 'Cuenta no disponible')

  return c.json({
    user: { id: session.userId, name: session.userName, email: session.userEmail },
    tenant,
  })
})
