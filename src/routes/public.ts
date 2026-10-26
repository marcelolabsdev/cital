import { Hono } from 'hono'
import { z } from 'zod'
import type { HonoEnv } from '../env'
import { AppError, notFound } from '../middleware/errors'
import { parseBody } from '../middleware/validate'
import { createDb } from '../db/client'
import { getTenantById, getTenantBySlug } from '../db/repos/tenants'
import { clientIp, rateLimit } from '../lib/rate-limit'
import { getAvailability, getAvailableDays, getPublicContext } from '../core/availability/service'
import { createBooking } from '../core/booking/service'
import { cancelActiveByToken, getByManageToken } from '../db/repos/appointments'
import { verifyTurnstile } from '../lib/turnstile'
import { nowIso } from '../lib/ids'
import { createMailer } from '../lib/email/mailer'
import { sendBookingConfirmation } from '../core/notifications/service'

/**
 * Endpoints públicos (sin sesión). Todos con rate limiting por IP.
 * La información del negocio se cachea en KV unos segundos para absorber
 * tráfico; los slots SIEMPRE se calculan frescos contra D1.
 */
export const publicRoutes = new Hono<HonoEnv>()

const slugParam = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9-]+$/, 'Slug inválido')

async function limitOrThrow(c: { env: { CACHE: KVNamespace }; req: { raw: { headers: Headers } } }, bucket: string, limit = 120) {
  const rl = await rateLimit(c.env.CACHE, `${bucket}:${clientIp(c.req.raw.headers)}`, limit, 60)
  if (!rl.allowed) {
    throw new AppError(429, 'rate_limited', 'Demasiadas consultas seguidas. Espera un momento')
  }
}

function requireSlugParam(value: string | undefined): string {
  const parsed = slugParam.safeParse(value ?? '')
  if (!parsed.success) throw notFound('Negocio no encontrado')
  return parsed.data
}

/** Verifica disponibilidad de un enlace público (onboarding/ajustes). Debe ir antes de /:slug. */
publicRoutes.get('/slug-check', async (c) => {
  await limitOrThrow(c, 'slug', 60)
  const slug = slugParam.safeParse(c.req.query('slug') ?? '')
  if (!slug.success) return c.json({ available: false, reason: 'inválido' })

  const db = createDb(c.env.DB)
  const tenant = await getTenantBySlug(db, slug.data)
  return c.json({ available: tenant === null })
})

/** Info pública del negocio: marca, servicios y equipo (cacheada 60s). */
publicRoutes.get('/:slug', async (c) => {
  await limitOrThrow(c, 'pub-info', 60)
  const slug = requireSlugParam(c.req.param('slug'))
  const cacheKey = `pub:${slug}`

  const cached = await c.env.CACHE.get(cacheKey, 'json')
  if (cached) return c.json(cached)

  const ctx = await getPublicContext(createDb(c.env.DB), slug)
  if (!ctx) throw notFound('Negocio no encontrado')

  const body = {
    tenant: {
      name: ctx.tenant.name,
      description: ctx.tenant.description,
      logoUrl: ctx.tenant.logoUrl,
      brandColor: ctx.tenant.brandColor,
      timezone: ctx.tenant.timezone,
      cancellationPolicyHours: ctx.tenant.cancellationPolicyHours,
      cancellationPolicyMode: ctx.tenant.cancellationPolicyMode,
    },
    services: ctx.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceClp: s.priceClp,
      color: s.color,
    })),
    professionals: ctx.professionals.map((p) => {
      // Servicios que ofrece este profesional
      const serviceIds = ctx.services.filter((s) => s.professionalIds.includes(p.id)).map((s) => s.id)
      return { ...p, serviceIds }
    }),
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? null,
  }
  // caché corta (KV exige TTL mínimo 60s): cambios de marca tardan hasta un minuto en verse
  await c.env.CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: 60 })
  return c.json(body)
})

/** Slots disponibles de un servicio para una fecha local. */
publicRoutes.get('/:slug/availability', async (c) => {
  await limitOrThrow(c, 'pub-slots', 120)

  const slug = requireSlugParam(c.req.param('slug'))
  const serviceId = z.string().uuid().safeParse(c.req.query('serviceId') ?? '')
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .safeParse(c.req.query('date') ?? '')
  if (!serviceId.success || !date.success) {
    throw new AppError(400, 'bad_request', 'Parámetros serviceId y date son obligatorios')
  }
  const professionalId = z.string().uuid().nullish().parse(c.req.query('professionalId') || null)

  const db = createDb(c.env.DB)
  const tenant = await getTenantBySlug(db, slug)
  if (!tenant) throw notFound('Negocio no encontrado')

  const slots = await getAvailability(
    db,
    tenant,
    serviceId.data,
    date.data,
    date.data,
    professionalId ?? null,
  )
  return c.json({
    date: date.data,
    slots: slots.map((s) => ({
      startIso: s.startIso,
      endIso: s.endIso,
      localMinute: s.localMinute,
      professionalId: s.professionalId,
    })),
  })
})

/** Días con disponibilidad de un servicio en un mes (para el calendario público). */
publicRoutes.get('/:slug/days', async (c) => {
  await limitOrThrow(c, 'pub-days', 120)

  const slug = requireSlugParam(c.req.param('slug'))
  const serviceId = z.string().uuid().safeParse(c.req.query('serviceId') ?? '')
  const month = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido')
    .safeParse(c.req.query('month') ?? '')
  if (!serviceId.success || !month.success) {
    throw new AppError(400, 'bad_request', 'Parámetros serviceId y month son obligatorios')
  }
  const professionalId = z.string().uuid().nullish().parse(c.req.query('professionalId') || null)

  const db = createDb(c.env.DB)
  const tenant = await getTenantBySlug(db, slug)
  if (!tenant) throw notFound('Negocio no encontrado')

  const days = await getAvailableDays(db, tenant, serviceId.data, month.data, professionalId ?? null)
  return c.json({ month: month.data, days })
})

// ---------- Reservas ----------

const bookingSchema = z
  .object({
    serviceId: z.string().uuid('Servicio inválido'),
    professionalId: z.string().uuid('Profesional inválido'),
    startIso: z.string().datetime({ offset: false }).or(z.string().regex(/Z$/)),
    customer: z.object({
      name: z.string().trim().min(2, 'Ingresa tu nombre').max(80),
      phone: z
        .string()
        .trim()
        .min(8, 'Ingresa un teléfono de contacto')
        .max(20)
        .regex(/^[+\d\s()-]+$/, 'Teléfono inválido'),
      email: z.string().trim().toLowerCase().email('Email inválido').optional().or(z.literal('')),
    }),
    turnstileToken: z.string().optional(),
  })
  .strict()

/** Crea una reserva desde la página pública. */
publicRoutes.post('/:slug/bookings', async (c) => {
  const rl = await rateLimit(c.env.CACHE, `book:${clientIp(c.req.raw.headers)}`, 5, 600)
  if (!rl.allowed) throw new AppError(429, 'rate_limited', 'Demasiadas reservas seguidas. Espera unos minutos')

  const slug = requireSlugParam(c.req.param('slug'))
  const body = await parseBody(c, bookingSchema)

  const ok = await verifyTurnstile(
    c.env.TURNSTILE_SECRET_KEY,
    body.turnstileToken,
    clientIp(c.req.raw.headers),
  )
  if (!ok) throw new AppError(400, 'captcha', 'No pudimos verificar que eres humano. Reintenta')

  const db = createDb(c.env.DB)
  const tenant = await getTenantBySlug(db, slug)
  if (!tenant) throw notFound('Negocio no encontrado')

  const result = await createBooking(db, c.env.DB, {
    tenant,
    serviceId: body.serviceId,
    professionalId: body.professionalId,
    startIso: body.startIso,
    customer: { name: body.customer.name, phone: body.customer.phone, email: body.customer.email || null },
    source: 'public',
  })

  if (!result.ok) {
    const status = result.code === 'conflict' ? 409 : 400
    throw new AppError(status, result.code ?? 'error', result.message ?? 'No se pudo crear la reserva')
  }

  // Email de confirmación fuera de la respuesta (no bloquea al cliente)
  if (result.appointment && body.customer.email) {
    const mailer = createMailer(c.env)
    c.executionCtx.waitUntil(
      sendBookingConfirmation(
        db,
        mailer,
        tenant.id,
        result.appointment.id,
        c.env.PUBLIC_APP_URL ?? new URL(c.req.url).origin,
      ).catch(() => undefined),
    )
  }

  return c.json(
    {
      appointment: {
        id: result.appointment!.id,
        startAt: result.appointment!.startAt,
        endAt: result.appointment!.endAt,
        status: result.appointment!.status,
        priceClp: result.appointment!.priceClp,
        manageToken: result.appointment!.manageToken,
      },
    },
    201,
  )
})

const tokenParam = z.string().min(20).max(80)

/** Detalle de una reserva por token de gestión (sin login). */
publicRoutes.get('/booking/:token', async (c) => {
  await limitOrThrow(c, 'manage', 30)
  const token = tokenParam.parse(c.req.param('token'))
  const detail = await getByManageToken(createDb(c.env.DB), token)
  if (!detail) throw notFound('Reserva no encontrada')
  return c.json({ appointment: detail })
})

/** Cancela una reserva por token. */
publicRoutes.post('/booking/:token/cancel', async (c) => {
  const rl = await rateLimit(c.env.CACHE, `cancel:${clientIp(c.req.raw.headers)}`, 10, 600)
  if (!rl.allowed) throw new AppError(429, 'rate_limited', 'Demasiadas operaciones. Espera unos minutos')

  const token = tokenParam.parse(c.req.param('token'))
  const body = await parseBody(c, z.object({ reason: z.string().trim().max(200).optional() }).strict())

  const db = createDb(c.env.DB)
  const detail = await getByManageToken(db, token)
  if (!detail) throw notFound('Reserva no encontrada')
  if (detail.status === 'cancelled') return c.json({ ok: true, already: true })
  if (detail.status === 'completed') {
    throw new AppError(400, 'invalid', 'Esta reserva ya fue completada y no se puede cancelar')
  }

  await cancelActiveByToken(db, token, body.reason ?? 'Cancelada por el cliente')
  return c.json({ ok: true })
})

const rescheduleSchema = z
  .object({
    professionalId: z.string().uuid('Profesional inválido'),
    startIso: z.string().min(10),
  })
  .strict()

/** Reprograma: crea la nueva cita y cancela la anterior, conservando el token. */
publicRoutes.post('/booking/:token/reschedule', async (c) => {
  const rl = await rateLimit(c.env.CACHE, `resched:${clientIp(c.req.raw.headers)}`, 10, 600)
  if (!rl.allowed) throw new AppError(429, 'rate_limited', 'Demasiadas operaciones. Espera unos minutos')

  const token = tokenParam.parse(c.req.param('token'))
  const body = await parseBody(c, rescheduleSchema)

  const db = createDb(c.env.DB)
  const current = await getByManageToken(db, token)
  if (!current) throw notFound('Reserva no encontrada')
  if (current.status !== 'pending' && current.status !== 'confirmed') {
    throw new AppError(400, 'invalid', 'Solo reservas activas se pueden reprogramar')
  }

  const tenant = await getTenantById(db, current.tenantId)
  if (!tenant) throw notFound('Negocio no encontrado')

  const result = await createBooking(db, c.env.DB, {
    tenant,
    serviceId: current.serviceId,
    professionalId: body.professionalId,
    startIso: body.startIso,
    customer: {
      name: current.customerName,
      phone: current.customerPhone,
      email: current.customerEmail,
    },
    source: 'public',
    keepManageToken: token,
    releaseAppointmentId: current.id,
  })
  if (!result.ok) {
    const status = result.code === 'conflict' ? 409 : 400
    throw new AppError(status, result.code ?? 'error', result.message ?? 'No se pudo reprogramar')
  }

  return c.json(
    {
      appointment: {
        id: result.appointment!.id,
        startAt: result.appointment!.startAt,
        endAt: result.appointment!.endAt,
        status: result.appointment!.status,
        manageToken: token,
      },
    },
    201,
  )
})

