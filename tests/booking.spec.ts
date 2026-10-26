import { beforeAll, describe, expect, it } from 'vitest'
import { env, testDb } from './setup'
import { eq } from 'drizzle-orm'
import { appointments, professionals, schedules, services, tenants } from '../src/db/schema'
import { createBooking } from '../src/core/booking/service'
import { getAvailability } from '../src/core/availability/service'
import { getTenantBySlug } from '../src/db/repos/tenants'
import { newId, nowIso } from '../src/lib/ids'
import { toIso, zonedParts, zonedToUtc } from '../src/lib/tz'

/**
 * Tests de la reserva atómica contra D1 real (workerd local).
 * Cubre: creación, doble reserva concurrente, solape parcial, buffer,
 * aislamiento entre tenants y liberación al cancelar.
 */

const TZ = 'America/Santiago'

interface Seed {
  slug: string
  tenantId: string
  serviceId: string
  professionalId: string
}

async function seedTenant(slug: string, bufferMinutes = 0): Promise<Seed> {
  const db = testDb()
  const tenantId = newId()
  const serviceId = newId()
  const professionalId = newId()
  const now = nowIso()

  await db.batch([
    db.insert(tenants).values({
      id: tenantId,
      slug,
      name: slug,
      timezone: TZ,
      bufferMinutes,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(services).values({
      id: serviceId,
      tenantId,
      name: 'Consulta',
      durationMinutes: 30,
      priceClp: 15000,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(professionals).values({
      id: professionalId,
      tenantId,
      name: 'Profesional Test',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }),
    // Atiende todos los días de 8:00 a 20:00
    ...[0, 1, 2, 3, 4, 5, 6].map((weekday) =>
      db.insert(schedules).values({
        id: newId(),
        tenantId,
        professionalId: null,
        weekday,
        startMinute: 480,
        endMinute: 1200,
      }),
    ),
  ])

  await env.DB.prepare(
    'INSERT INTO professional_services (professional_id, service_id, tenant_id) VALUES (?, ?, ?)',
  )
    .bind(professionalId, serviceId, tenantId)
    .run()

  return { slug, tenantId, serviceId, professionalId }
}

/** Mañana a las 10:00 en Santiago, como ISO UTC. */
function tomorrowAt10(): { dateStr: string; startIso: string } {
  const now = new Date(Date.now() + 24 * 3600_000)
  const dateStr = zonedParts(now, TZ).dateStr
  const startIso = toIso(zonedToUtc(dateStr, 600, TZ))
  return { dateStr, startIso }
}

function bookingInput(seed: Seed, startIso: string, tag: string) {
  return {
    tenant: {
      id: seed.tenantId,
      slug: seed.slug,
      name: seed.slug,
      description: null,
      timezone: TZ,
      logoUrl: null,
      brandColor: '#4f46e5',
      cancellationPolicyHours: 24,
      cancellationPolicyMode: 'hours' as const,
      bufferMinutes: 0,
      bookingLeadHours: 2,
      bookingWindowDays: 60,
      onboardingStep: 4,
      plan: 'free',
      trialEndsAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    serviceId: seed.serviceId,
    professionalId: seed.professionalId,
    startIso,
    customer: { name: `Cliente ${tag}`, phone: `+569${Math.floor(Math.random() * 1e9)}`, email: null },
    source: 'public' as const,
  }
}

async function tenantBySlug(slug: string) {
  const t = await getTenantBySlug(testDb(), slug)
  if (!t) throw new Error(`tenant ${slug} no existe`)
  return t
}

describe('createBooking — happy path', () => {
  let seed: Seed
  beforeAll(async () => {
    seed = await seedTenant('test-happy')
  })

  it('crea una reserva pendiente con precio congelado y crea al cliente', async () => {
    const { startIso } = tomorrowAt10()
    const result = await createBooking(testDb(), env.DB, bookingInput(seed, startIso, 'uno'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.appointment!.status).toBe('pending')
    expect(result.appointment!.priceClp).toBe(15000)
    expect(result.appointment!.manageToken).toBeTruthy()
    expect(result.appointment!.startAt).toBe(startIso)
  })

  it('rechaza un horario que no es slot ofertado (ej. 10:07)', async () => {
    const { startIso } = tomorrowAt10()
    const odd = startIso.replace(':00:00Z', ':07:00Z')
    const result = await createBooking(testDb(), env.DB, bookingInput(seed, odd, 'dos'))
    expect(result.ok).toBe(false)
    expect(result.code).toBe('slot_unavailable')
  })

  it('rechaza un servicio inexistente o inactivo', async () => {
    const { startIso } = tomorrowAt10()
    const bad = { ...bookingInput(seed, startIso, 'tres'), serviceId: newId() }
    const result = await createBooking(testDb(), env.DB, bad)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('service_unavailable')
  })
})

describe('createBooking — anti doble reserva', () => {
  let seed: Seed
  beforeAll(async () => {
    seed = await seedTenant('test-conflicto')
  })

  it('dos reservas simultáneas del mismo horario: exactamente una gana', async () => {
    const { startIso } = tomorrowAt10()
    const [a, b] = await Promise.all([
      createBooking(testDb(), env.DB, bookingInput(seed, startIso, 'a')),
      createBooking(testDb(), env.DB, bookingInput(seed, startIso, 'b')),
    ])
    const winners = [a, b].filter((r) => r.ok)
    const losers = [a, b].filter((r) => !r.ok)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    // Según el interleave, el perdedor cae en la validación de slot o en el INSERT atómico
    expect(['slot_unavailable', 'conflict']).toContain(losers[0]!.code)
  })

  it('ocho reservas concurrentes del mismo horario: solo una gana', async () => {
    const { startIso } = tomorrowAt10()
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        createBooking(testDb(), env.DB, bookingInput(seed, startIso, `c${i}`)),
      ),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(1)
  })

  it('solape parcial (cita 10:00-10:30 existente, pedir 10:15) se rechaza', async () => {
    const { dateStr } = tomorrowAt10()
    const at1000 = toIso(zonedToUtc(dateStr, 600, TZ))
    const at1015 = toIso(zonedToUtc(dateStr, 615, TZ))

    const first = await createBooking(testDb(), env.DB, bookingInput(seed, at1000, 'd'))
    expect(first.ok).toBe(true)

    const second = await createBooking(testDb(), env.DB, bookingInput(seed, at1015, 'e'))
    expect(second.ok).toBe(false)
  })

  it('la disponibilidad ya no ofrece horarios ocupados', async () => {
    const { dateStr } = tomorrowAt10()
    const at1100 = toIso(zonedToUtc(dateStr, 660, TZ))
    await createBooking(testDb(), env.DB, bookingInput(seed, at1100, 'f'))

    const tenant = await tenantBySlug(seed.slug)
    const slots = await getAvailability(testDb(), tenant, seed.serviceId, dateStr, dateStr, seed.professionalId)
    const starts = slots.map((s) => s.startIso)
    expect(starts).not.toContain(at1100)
    expect(starts).toContain(toIso(zonedToUtc(dateStr, 690, TZ))) // 11:30 sí
  })

  it('cancelar libera el horario para una nueva reserva', async () => {
    const { dateStr } = tomorrowAt10()
    const at1400 = toIso(zonedToUtc(dateStr, 840, TZ))
    const r = await createBooking(testDb(), env.DB, bookingInput(seed, at1400, 'g'))
    expect(r.ok).toBe(true)

    await testDb()
      .update(appointments)
      .set({ status: 'cancelled', cancelledAt: nowIso() })
      .where(eq(appointments.id, r.appointment!.id))

    const again = await createBooking(testDb(), env.DB, bookingInput(seed, at1400, 'h'))
    expect(again.ok).toBe(true)
  })
})

describe('createBooking — buffer y aislamiento multi-tenant', () => {
  it('el buffer del negocio bloquea slots pegados a una cita', async () => {
    const seed = await seedTenant('test-buffer', 10)
    const { dateStr } = tomorrowAt10()
    const at0900 = toIso(zonedToUtc(dateStr, 540, TZ))

    const r = await createBooking(testDb(), env.DB, bookingInput(seed, at0900, 'buf'))
    expect(r.ok).toBe(true)

    const tenant = await tenantBySlug(seed.slug)
    const slots = await getAvailability(testDb(), tenant, seed.serviceId, dateStr, dateStr, seed.professionalId)
    const starts = slots.map((s) => s.startIso)
    // Cita 9:00-9:30 + buffer 10 → expandida 8:50-9:40: ni 9:15 ni 9:30 se ofrecen
    expect(starts).not.toContain(toIso(zonedToUtc(dateStr, 555, TZ))) // 9:15
    expect(starts).not.toContain(toIso(zonedToUtc(dateStr, 570, TZ))) // 9:30
    expect(starts).toContain(toIso(zonedToUtc(dateStr, 585, TZ))) // 9:45
  })

  it('dos tenants independientes pueden usar el mismo horario sin interferir', async () => {
    const seedA = await seedTenant('test-tenant-a')
    const seedB = await seedTenant('test-tenant-b')
    const { startIso } = tomorrowAt10()

    const [ra, rb] = await Promise.all([
      createBooking(testDb(), env.DB, bookingInput(seedA, startIso, 'ta')),
      createBooking(testDb(), env.DB, bookingInput(seedB, startIso, 'tb')),
    ])
    expect(ra.ok).toBe(true)
    expect(rb.ok).toBe(true)

    // Las citas de A no son visibles para B (filtro por tenant)
    const db = testDb()
    const rowsA = await db.select().from(appointments).where(eq(appointments.tenantId, seedA.tenantId))
    const rowsB = await db.select().from(appointments).where(eq(appointments.tenantId, seedB.tenantId))
    expect(rowsA).toHaveLength(1)
    expect(rowsB).toHaveLength(1)
    expect(rowsA[0]!.id).not.toBe(rowsB[0]!.id)
  })
})
