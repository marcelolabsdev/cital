/**
 * Verificación de Cloudflare Turnstile para endpoints públicos.
 * Si no hay secret configurado (desarrollo local), se omite la verificación.
 */

export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  if (!secret) return true
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}
