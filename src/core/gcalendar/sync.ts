/**
 * Sincronización best-effort de citas hacia Google Calendar vía Composio.
 *
 * Reglas de oro (AGENTS.md §6):
 *  - Google NUNCA bloquea la cita: todos los errores se loguean y se tragan.
 *  - Un profesional sin conexión → skip silencioso.
 *  - Se envian horas locales de pared en la zona del negocio (formato
 *    YYYY-MM-DDTHH:MM:SS + timezone IANA), como pide el tool.
 */

import { and, eq } from 'drizzle-orm'
import { appointments } from '../../db/schema'
import type { Db } from '../../db/client'
import { getConnectionForProfessional } from '../../db/repos/calendarConnections'
import { getByTenantAndId } from '../../db/repos/appointments'
import { executeTool } from './composio'
import { zonedParts } from '../../lib/tz'

const TOOL_CREATE = 'GOOGLECALENDAR_CREATE_EVENT'
const TOOL_DELETE = 'GOOGLECALENDAR_DELETE_EVENT'

/** Conexión mínima necesaria para hablar con Google. */
export interface SyncConnection {
  connectedAccountId: string
  accountEmail: string | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Instante UTC → pared local "YYYY-MM-DDTHH:MM:SS" en la zona del negocio. */
export function toLocalStamp(isoUtc: string, timezone: string): string {
  const p = zonedParts(new Date(isoUtc), timezone)
  return `${p.dateStr}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
}

/**
 * Crea el evento y devuelve su id (o null si falló / no hay conexión).
 * create_meeting_room=false evita links de Meet; send_updates='none' evita emails.
 */
export async function pushEvent(
  env: { COMPOSIO_API_KEY?: string },
  conn: SyncConnection,
  userId: string,
  timezone: string,
  data: { title: string; description?: string | null; startAt: string; endAt: string },
): Promise<string | null> {
  if (!env.COMPOSIO_API_KEY) return null
  try {
    const out = await executeTool(env, TOOL_CREATE, conn.connectedAccountId, {
      calendar_id: 'primary',
      summary: data.title,
      ...(data.description ? { description: data.description } : {}),
      start_datetime: toLocalStamp(data.startAt, timezone),
      end_datetime: toLocalStamp(data.endAt, timezone),
      timezone,
      create_meeting_room: false,
      send_updates: 'none',
    }, userId)
    // El output real del tool puede venir en data o en response_data según versión
    const raw = (out.response_data ?? out) as Record<string, unknown>
    return (raw.event_id ?? raw.eventId ?? raw.id) as string | null
  } catch (err) {
    console.error('[cital:gcal] pushEvent falló:', err)
    return null
  }
}

/** Borrado tolerante: si el evento ya no existe (404) igual estamos donde queríamos. */
export async function deleteEvent(
  env: { COMPOSIO_API_KEY?: string },
  conn: SyncConnection,
  userId: string,
  eventId: string,
): Promise<void> {
  if (!env.COMPOSIO_API_KEY) return
  try {
    await executeTool(env, TOOL_DELETE, conn.connectedAccountId, {
      event_id: eventId,
      calendar_id: 'primary',
      send_updates: 'none',
    }, userId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (!/4(04|10)/.test(msg)) console.error('[cital:gcal] deleteEvent falló:', err)
  }
}

/**
 * Opera sobre la cita: carga sus datos, resuelve la conexión del profesional
 * y ejecuta CREATE (guardando google_event_id) o DELETE según `op`.
 * Nunca lanza; devuelve true si pudo sincronizar.
 */
export async function syncAppointment(
  env: { COMPOSIO_API_KEY?: string },
  db: Db,
  timezone: string,
  appointmentId: string,
  tenantId: string,
  op: 'create' | 'delete',
): Promise<boolean> {
  try {
    const appt = await getByTenantAndId(db, tenantId, appointmentId)
    if (!appt) return false
    // CREATE: solo para citas vigentes. DELETE: no importa el estado — la cita
    // puede haber quedado cancelada (move/reprogramación) y su evento va igual.
    if (op === 'create' && (appt.status === 'cancelled' || appt.status === 'no_show')) return false
    if (!appt.googleEventId) return false

    const conn = await getConnectionForProfessional(db, tenantId, appt.professionalId)
    if (!conn) return false

    if (op === 'create') {
      const title = `${appt.serviceName} — ${appt.customerName}`
      const eventId = await pushEvent(env, conn, appt.professionalId, timezone, {
        title,
        description: appt.notes || undefined,
        startAt: appt.startAt,
        endAt: appt.endAt,
      })
      if (!eventId) return false
      await db
        .update(appointments)
        .set({ googleEventId: eventId })
        .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)))
      return true
    }
    // op === 'delete'
    await deleteEvent(env, conn, appt.professionalId, appt.googleEventId!)
    return true
  } catch (err) {
    console.error('[cital:gcal] sync falló:', err)
    return false
  }
}
