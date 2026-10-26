/**
 * Notificaciones de citas: confirmación al reservar y recordatorio programado.
 * El envío usa ctx.waitUntil para no bloquear la respuesta HTTP.
 */

import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { appointments, customers, professionals, services, tenants } from '../../db/schema'
import type { Mailer } from '../../lib/email/mailer'
import { bookingConfirmationEmail, bookingReminderEmail, type BookingEmailData } from '../../lib/email/templates'
import { nowIso } from '../../lib/ids'

const appointmentColumns = {
  appointmentId: appointments.id,
  startAt: appointments.startAt,
  status: appointments.status,
  priceClp: appointments.priceClp,
  manageToken: appointments.manageToken,
  serviceName: services.name,
  professionalName: professionals.name,
  professionalEmail: professionals.email,
  customerName: customers.name,
  customerEmail: customers.email,
  tenantName: tenants.name,
  brandColor: tenants.brandColor,
  cancellationPolicyHours: tenants.cancellationPolicyHours,
  cancellationPolicyMode: tenants.cancellationPolicyMode,
}

type FullAppointmentRow = {
  [K in keyof typeof appointmentColumns]: (typeof appointmentColumns)[K]['_']['data']
}

function policyText(mode: string, hours: number): string {
  return mode === 'no_refund'
    ? 'Reserva sujeta a política de sin reembolso.'
    : `Puedes cancelar hasta ${hours} h antes.`
}

function emailData(d: FullAppointmentRow, appUrl: string): BookingEmailData {
  return {
    tenantName: d.tenantName,
    brandColor: d.brandColor,
    customerName: d.customerName,
    serviceName: d.serviceName,
    professionalName: d.professionalName,
    startAtLocal: formatSantiago(d.startAt),
    priceClp: d.priceClp,
    manageUrl: `${appUrl}/reserva/${d.manageToken}`,
    cancellationPolicyText: policyText(d.cancellationPolicyMode, d.cancellationPolicyHours),
  }
}

function formatSantiago(startIso: string): string {
  const fmt = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Santiago',
    hour12: false,
  })
  return fmt.format(new Date(startIso)).replace(/^\w/, (c) => c.toUpperCase())
}

/** Email de confirmación tras crear una reserva (con enlace de gestión). */
export async function sendBookingConfirmation(
  db: Db,
  mailer: Mailer,
  tenantId: string,
  appointmentId: string,
  appUrl: string,
): Promise<boolean> {
  const rows = await db
    .select(appointmentColumns)
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)))
    .limit(1)

  const detail = rows[0] as FullAppointmentRow | undefined
  if (!detail?.customerEmail) return false

  const tpl = bookingConfirmationEmail(emailData(detail, appUrl))
  try {
    await mailer.send({
      to: detail.customerEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: detail.professionalEmail ?? undefined,
    })
    return true
  } catch (err) {
    console.error('[cital] fallo enviando confirmación:', err)
    return false
  }
}

/**
 * Recordatorios: citas que empiezan entre 20 y 28 horas desde ahora con
 * recordatorio pendiente. Idempotente vía reminder_sent_at (se marca aunque
 * el email falle, para no reintentar en cada corrida del cron).
 */
export async function sendDueReminders(db: Db, mailer: Mailer, appUrl: string): Promise<number> {
  const now = Date.now()
  const fromIso = new Date(now + 20 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const toLimitIso = new Date(now + 28 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')

  const rows = (await db
    .select(appointmentColumns)
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
    .where(and(gte(appointments.startAt, fromIso), lte(appointments.startAt, toLimitIso), isNull(appointments.reminderSentAt)))
    .limit(50)) as FullAppointmentRow[]

  let sent = 0
  for (const r of rows) {
    if (r.status === 'cancelled' || r.status === 'no_show') {
      await markReminded(db, r.appointmentId)
      continue
    }
    if (!r.customerEmail) {
      await markReminded(db, r.appointmentId)
      continue
    }
    const tpl = bookingReminderEmail(emailData(r, appUrl))
    try {
      await mailer.send({
        to: r.customerEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        replyTo: r.professionalEmail ?? undefined,
      })
      sent += 1
    } catch (err) {
      console.error(`[cital] recordatorio falló para cita ${r.appointmentId}:`, err)
    }
    await markReminded(db, r.appointmentId)
  }
  return sent
}

async function markReminded(db: Db, appointmentId: string): Promise<void> {
  await db
    .update(appointments)
    .set({ reminderSentAt: nowIso(), updatedAt: nowIso() })
    .where(eq(appointments.id, appointmentId))
}
