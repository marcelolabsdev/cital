/**
 * Cliente Composio REST v3.1 (https://backend.composio.dev/api/v3.1), sin SDK.
 * Maneja: auth link session (Connect Link alojada, con branding en el dashboard),
 * estado de la connected account, borrado y ejecución de herramientas (G3).
 */

const API = 'https://backend.composio.dev/api/v3.1'
const TOOLKIT = 'googlecalendar'

/**
 * Origen canónico del flujo OAuth (patrón Calendly): el callback SIEMPRE pasa
 * por una URL registrada, aunque abras la app por IP u otro puerto.
 * Producción = PUBLIC_APP_URL; desarrollo = http://localhost:5174 fijo.
 */
export function appOrigin(env: { PUBLIC_APP_URL?: string }): string {
  if (env.PUBLIC_APP_URL) return env.PUBLIC_APP_URL.replace(/\/+$/, '')
  return 'http://localhost:5174'
}

export function composioKey(env: { COMPOSIO_API_KEY?: string }): string | null {
  return env.COMPOSIO_API_KEY ? env.COMPOSIO_API_KEY : null
}

async function call(
  env: { COMPOSIO_API_KEY?: string },
  path: string,
  init: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown },
): Promise<Record<string, unknown>> {
  const key = composioKey(env)
  if (!key) throw new Error('Composio no está configurado (COMPOSIO_API_KEY)')
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[cital:composio] ${init.method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
    throw new Error(`Composio ${res.status}`)
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

/**
 * Id del auth config de Google Calendar del proyecto. Si el toolkit no está
 * habilitado en el dashboard, lo informa con acción clara para el usuario.
 */
export async function ensureGoogleAuthConfigId(env: {
  COMPOSIO_API_KEY?: string
}): Promise<string> {
  const list = (await call(env, '/auth_configs', { method: 'GET' })) as {
    items?: Array<Record<string, unknown>>
  }
  for (const item of list.items ?? []) {
    const toolkitSlug =
      (item.toolkit_slug as string) ??
      ((item.toolkit as Record<string, unknown> | undefined)?.slug as string) ??
      ''
    if (toolkitSlug.toLowerCase() === TOOLKIT) return item.id as string
  }
  throw new Error(
    `NINGUN_AUTH_CONFIG: habilita el toolkit ${TOOLKIT} en el dashboard de Composio`,
  )
}

export interface AuthLink {
  redirectUrl: string
  connectedAccountId: string
}

/** Crea la sesión de auth: el usuario completa en la Connect Link de Composio. */
export async function createAuthLink(
  env: { COMPOSIO_API_KEY?: string },
  authConfigId: string,
  userId: string,
  callbackUrl: string,
): Promise<AuthLink> {
  const res = (await call(env, '/connected_accounts/link', {
    method: 'POST',
    body: {
      auth_config_id: authConfigId,
      user_id: userId,
      callback_url: callbackUrl,
    },
  })) as { redirect_url?: string; connected_account_id?: string }
  if (!res.redirect_url || !res.connected_account_id) {
    throw new Error('Composio no devolvió auth link completo')
  }
  return { redirectUrl: res.redirect_url, connectedAccountId: res.connected_account_id }
}

/** Estado actual de una connected account (ej. 'ACTIVE'). */
export async function getConnectedAccountStatus(
  env: { COMPOSIO_API_KEY?: string },
  connectedAccountId: string,
): Promise<{ status: string; email: string | null } | null> {
  try {
    const res = (await call(env, `/connected_accounts/${connectedAccountId}`, {
      method: 'GET',
    })) as {
      status?: string
      connectionData?: { val?: Record<string, unknown> }
      connection_data?: { val?: Record<string, unknown> }
    }
    const val = res.connectionData?.val ?? res.connection_data?.val
    const email = (val?.email as string) ?? null
    return { status: (res.status as string) ?? 'INITIALIZING', email }
  } catch {
    return null
  }
}

/** Elimina la account en Composio (al desconectar). Best-effort. */
export async function deleteConnectedAccount(
  env: { COMPOSIO_API_KEY?: string },
  connectedAccountId: string,
): Promise<void> {
  try {
    await call(env, `/connected_accounts/${connectedAccountId}`, { method: 'DELETE' })
  } catch (err) {
    console.error('[cital:composio] no se pudo borrar la account:', err)
  }
}

/** Ejecuta una herramienta con la account conectada (fase G3: eventos). */
export async function executeTool(
  env: { COMPOSIO_API_KEY?: string },
  toolSlug: string,
  connectedAccountId: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = (await call(env, `/tools/execute/${toolSlug}`, {
    method: 'POST',
    body: { connected_account_id: connectedAccountId, arguments: args },
  })) as { successful?: boolean; error?: string | null }
  if (!res.successful) {
    throw new Error(`Tool ${toolSlug} falló: ${res.error ?? 'sin detalle'}`)
  }
  return ((res as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>
}
