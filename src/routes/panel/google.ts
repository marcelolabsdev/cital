/**
 * Conexión de calendario externo por profesional (vía Composio).
 * GET    /connect → crea una auth-link session en Composio y devuelve
 *                   { authUrl } de la Connect Link alojada (con branding).
 * DELETE /connection/:professionalId → desconecta (borra en Composio + local).
 * El callback público vive en routes/google.ts (sin sesión).
 */

import { Hono } from 'hono'
import type { HonoEnv } from '../../env'
import { notFound, serviceUnavailable } from '../../middleware/errors'
import { createDb } from '../../db/client'
import { getProfessional } from '../../db/repos/professionals'
import {
  getConnectionForProfessional,
  removeConnection,
} from '../../db/repos/calendarConnections'
import { newToken } from '../../lib/ids'
import {
  appOrigin,
  composioKey,
  createAuthLink,
  deleteConnectedAccount,
  ensureGoogleAuthConfigId,
} from '../../core/gcalendar/composio'

export const googlePanelRoutes = new Hono<HonoEnv>()

const STATE_TTL = 900 // 15 minutos para completar el consentimiento

/** Crea la auth-link session. Devuelve JSON con { authUrl } para el frontend. */
googlePanelRoutes.get('/connect', async (c) => {
  if (!composioKey(c.env)) {
    throw serviceUnavailable('No hay COMPOSIO_API_KEY configurado')
  }

  const professionalId = c.req.query('professionalId') ?? ''
  if (!professionalId) throw notFound('Falta el profesional a conectar')

  const db = createDb(c.env.DB)
  const { tenantId } = c.get('auth')
  const professional = await getProfessional(db, tenantId, professionalId)
  if (!professional) throw notFound('Profesional no encontrado')

  try {
    const authConfigId = await ensureGoogleAuthConfigId(c.env)
    const state = newToken()
    const callbackUrl = `${appOrigin(c.env)}/api/google/callback`
    const link = await createAuthLink(c.env, authConfigId, professionalId, callbackUrl)

    // Antiforgery + mapeo del resultado: el callback consume una sola vez
    await c.env.CACHE.put(
      `gcal:state:${state}`,
      JSON.stringify({ tenantId, professionalId, accountId: link.connectedAccountId }),
      { expirationTtl: STATE_TTL },
    )
    await c.env.CACHE.put(
      `gcal:conn:${link.connectedAccountId}`,
      JSON.stringify({ tenantId, professionalId, accountId: link.connectedAccountId }),
      { expirationTtl: STATE_TTL + 1800 },
    )

    return c.json({ authUrl: link.redirectUrl })
  } catch (err) {
    console.error('[cital:gcal] connect falló:', err)
    const msg = err instanceof Error ? err.message : ''
    throw serviceUnavailable(
      msg.includes('NINGUN_AUTH_CONFIG')
        ? 'Composio: habilita el toolkit Google Calendar en tu dashboard'
        : 'No se pudo iniciar la conexión con Google Calendar',
    )
  }
})

googlePanelRoutes.delete('/connection/:professionalId', async (c) => {
  const db = createDb(c.env.DB)
  const { tenantId } = c.get('auth')
  const id = c.req.param('professionalId')
  const professional = await getProfessional(db, tenantId, id)
  if (!professional) throw notFound('Profesional no encontrado')

  // Borra también en Composio (best-effort: si falla igual borramos local)
  const connection = await getConnectionForProfessional(db, tenantId, id)
  if (connection && composioKey(c.env)) {
    await deleteConnectedAccount(c.env, connection.connectedAccountId)
  }

  await removeConnection(db, tenantId, id)
  return c.json({ ok: true })
})
