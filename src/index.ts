import { Hono } from 'hono'
import type { Env, HonoEnv } from './env'
import { errorHandler } from './middleware/errors'
import { authRoutes } from './routes/auth'
import { panelRoutes } from './routes/panel'
import { publicRoutes } from './routes/public'
import { createDb } from './db/client'
import { createMailer } from './lib/email/mailer'
import { sendDueReminders } from './core/notifications/service'

const app = new Hono<HonoEnv>()

app.onError(errorHandler)

app.route('/api/auth', authRoutes)
app.route('/api/panel', panelRoutes)
app.route('/api/public', publicRoutes)

app.notFound((c) =>
  c.json({ error: { code: 'not_found', message: 'Ruta no encontrada' } }, 404),
)

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  /** Cron cada 10 min: recordatorios de citas a ~24 h (idempotente). */
  scheduled: async (_event, env, ctx) => {
    const mailer = createMailer(env)
    const db = createDb(env.DB)
    const appUrl = env.PUBLIC_APP_URL ?? 'https://cital.app'
    ctx.waitUntil(
      sendDueReminders(db, mailer, appUrl)
        .then((sent) => {
          if (sent > 0) console.log(`[cital:cron] ${sent} recordatorios enviados`)
        })
        .catch((err) => console.error('[cital:cron] error:', err)),
    )
  },
} satisfies ExportedHandler<Env>
