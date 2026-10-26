import { Hono } from 'hono'
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { HonoEnv } from '../../env'
import { notFound } from '../../middleware/errors'
import { createDb } from '../../db/client'
import { appointments, customers, professionals, services } from '../../db/schema'
import { getTenantById } from '../../db/repos/tenants'
import { toIso, zonedParts, zonedToUtc } from '../../lib/tz'

/** Métricas del inicio: citas de hoy, ingresos estimados, cancelaciones, top servicios. */
export const dashboardRoutes = new Hono<HonoEnv>()

dashboardRoutes.get('/', async (c) => {
  const { tenantId } = c.get('auth')
  const db = createDb(c.env.DB)
  const tenant = await getTenantById(db, tenantId)
  if (!tenant) throw notFound('Negocio no encontrado')

  const now = new Date()
  const todayStr = zonedParts(now, tenant.timezone).dateStr
  const dayStartIso = toIso(zonedToUtc(todayStr, 0, tenant.timezone))
  const dayEndIso = toIso(zonedToUtc(todayStr, 1440, tenant.timezone))

  // Mes en curso local completo (para ingresos y tasa de cancelación)
  const monthStart = `${todayStr.slice(0, 7)}-01`
  const [yearNum, monthNum] = monthStart.split('-').map(Number)
  const lastDay = new Date(Date.UTC(yearNum!, monthNum!, 0)).getUTCDate()
  const monthEnd = `${monthStart.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
  const monthStartIso = toIso(zonedToUtc(monthStart, 0, tenant.timezone))
  const monthEndIso = toIso(zonedToUtc(monthEnd, 1440, tenant.timezone))

  const monthAppts = await db
    .select({
      id: appointments.id,
      status: appointments.status,
      priceClp: appointments.priceClp,
      serviceId: appointments.serviceId,
      serviceName: services.name,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        gte(appointments.startAt, monthStartIso),
        lte(appointments.startAt, monthEndIso),
      ),
    )

  const active = monthAppts.filter((a) => a.status === 'pending' || a.status === 'confirmed')
  const completed = monthAppts.filter((a) => a.status === 'completed')
  const cancelled = monthAppts.filter((a) => a.status === 'cancelled')
  const noShow = monthAppts.filter((a) => a.status === 'no_show')

  const estimatedRevenueClp = [...completed, ...active].reduce((sum, a) => sum + a.priceClp, 0)
  const totalFinished = cancelled.length + noShow.length + completed.length
  const cancellationRate =
    totalFinished > 0 ? Math.round(((cancelled.length + noShow.length) / totalFinished) * 100) : 0

  // Top servicios del mes (por citas activas + completadas)
  const serviceCount = new Map<string, { name: string; count: number }>()
  for (const a of [...active, ...completed]) {
    const cur = serviceCount.get(a.serviceId) ?? { name: a.serviceName, count: 0 }
    cur.count += 1
    serviceCount.set(a.serviceId, cur)
  }
  const topServices = [...serviceCount.values()].sort((a, b) => b.count - a.count).slice(0, 5)

  // Citas de hoy con detalle
  const todayRows = await db
    .select({
      id: appointments.id,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      status: appointments.status,
      priceClp: appointments.priceClp,
      serviceName: services.name,
      professionalName: professionals.name,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        gte(appointments.startAt, dayStartIso),
        lte(appointments.startAt, dayEndIso),
        inArray(appointments.status, ['pending', 'confirmed', 'completed']),
      ),
    )
    .orderBy(appointments.startAt)

  return c.json({
    today: {
      date: todayStr,
      appointments: todayRows,
    },
    month: {
      estimatedRevenueClp,
      upcomingCount: active.length,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      cancellationRate,
      topServices,
    },
  })
})
