/**
 * Callback público tras completar la Connect Link de Composio.
 * Composio redirige acá con el id de la cuenta conectada (nombres posibles:
 * connectionId / connected_account_id / connectedAccountId). El mapeo a
 * tenant+profesional vive en KV (guardado al crear la auth link) y se consume
 * una sola vez. Termina redirigiendo /panel/equipo?google=<resultado>.
 * Resultados: connected | denied | invalid | misconfigured | error
 */

import { Hono } from 'hono'
import type { HonoEnv } from '../env'
import { createDb } from '../db/client'
import { upsertConnection } from '../db/repos/calendarConnections'
import {
  appOrigin,
  composioKey,
  getConnectedAccountStatus,
} from '../core/gcalendar/composio'
import { newId, nowIso } from '../lib/ids'

export const googleCallbackRoutes = new Hono<HonoEnv>()

function back(env: { PUBLIC_APP_URL?: string }, outcome: string): Response {
  const cital = appOrigin(env)
  return Response.redirect(`${cital}/panel/equipo?google=${outcome}`, 302)
}

/** Igual al guardado en /connect: { tenantId, professionalId, accountId } */
interface LinkInfo {
  tenantId: string
  professionalId: string
  accountId: string
}

const FAILED_STATUSES = new Set(['INITIATION_FAILED', 'FAILED', 'ERROR', 'CANCELLED'])

googleCallbackRoutes.get('/callback', async (c) => {
  const q = new URL(c.req.url).searchParams
  const accountIdParam =
    q.get('connectionId') ?? q.get('connected_account_id') ?? q.get('connectedAccountId')
  const stateParam = q.get('state')
  const statusParam = q.get('status')

  // Cartografía doble: por accountId (se crea al iniciar el link) o por state
  let info: LinkInfo | null = null
  let usedKey: string | null = null
  if (accountIdParam) {
    const raw = await c.env.CACHE.get(`gcal:conn:${accountIdParam}`)
    if (raw) {
      info = JSON.parse(raw) as LinkInfo
      usedKey = `gcal:conn:${accountIdParam}`
    }
  }
  if (!info && stateParam) {
    const raw = await c.env.CACHE.get(`gcal:state:${stateParam}`)
    if (raw) {
      info = JSON.parse(raw) as LinkInfo
      usedKey = `gcal:state:${stateParam}`
    }
  }
  if (!info) return back(c.env, 'invalid')
  if (usedKey) await c.env.CACHE.delete(usedKey)

  if (!composioKey(c.env)) return back(c.env, 'misconfigured')

  if (statusParam && FAILED_STATUSES.has(statusParam.toUpperCase())) {
    return back(c.env, 'denied')
  }

  try {
    // Verificación best-effort del estado y email en Composio
    const st = await getConnectedAccountStatus(c.env, info.accountId)
    if (st && !['ACTIVE', 'INITIATED', 'INITIALIZING'].includes(st.status)) {
      return back(c.env, 'denied')
    }

    await upsertConnection(createDb(c.env.DB), {
      id: newId(),
      tenantId: info.tenantId,
      professionalId: info.professionalId,
      provider: 'composio',
      connectedAccountId: info.accountId,
      accountEmail: st?.email ?? null,
      connectedAt: nowIso(),
    })
    return back(c.env, 'connected')
  } catch (err) {
    console.error('[cital:gcal] callback falló:', err)
    return back(c.env, 'error')
  }
})
