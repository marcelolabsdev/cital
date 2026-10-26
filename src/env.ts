import type { Context } from 'hono'

/** Bindings del Worker: D1, KV, assets y secrets (los secretos viven en .dev.vars / wrangler secrets). */
export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  ASSETS: Fetcher
  SESSION_SECRET: string
  EMAIL_PROVIDER?: string
  RESEND_API_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_SITE_KEY?: string
  PUBLIC_APP_URL?: string
}

export interface AuthInfo {
  userId: string
  tenantId: string
}

export type HonoEnv = {
  Bindings: Env
  Variables: { auth: AuthInfo }
}

export type AppContext = Context<HonoEnv>
