/**
 * Envío de email transaccional. Interfaz única con dos implementaciones:
 * - LogMailer: imprime el correo en consola (desarrollo, sin claves).
 * - ResendMailer: fetch directo a la API de Resend (sin SDK del runtime).
 * La elección se hace por EMAIL_PROVIDER ('log' | 'resend').
 */

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export interface Mailer {
  send(msg: EmailMessage): Promise<void>
}

export function createMailer(env: { EMAIL_PROVIDER?: string; RESEND_API_KEY?: string; PUBLIC_APP_URL?: string }): Mailer {
  if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) {
    return new ResendMailer(env.RESEND_API_KEY)
  }
  return new LogMailer()
}

export class LogMailer implements Mailer {
  async send(msg: EmailMessage): Promise<void> {
    console.log(
      `[cital:email] PARA: ${msg.to}\nASUNTO: ${msg.subject}\n---\n${msg.text}\n---(html ${msg.html.length} bytes)`,
    )
  }
}

export class ResendMailer implements Mailer {
  constructor(private apiKey: string) {}

  async send(msg: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'cital <reservas@envios.cital.app>',
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[cital:email] Resend error ${res.status}: ${body.slice(0, 300)}`)
      throw new Error(`Resend ${res.status}`)
    }
  }
}
