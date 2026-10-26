/**
 * Rate limiting de ventana fija sobre KV, para endpoints públicos.
 * KV es eventualmente consistente: suficiente para frenar abuso, no para
 * garantizar exactitud exacta al milisegundo.
 */

interface Counter {
  c: number // contador
  e: number // epoch ms de fin de ventana
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export async function rateLimit(
  kv: KVNamespace,
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const key = `rl:${bucket}`
  const now = Date.now()
  const raw = await kv.get(key)
  let counter: Counter | null = null
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Counter
      if (parsed.e > now) counter = parsed
    } catch {
      counter = null
    }
  }

  if (!counter) {
    counter = { c: 0, e: now + windowSec * 1000 }
  }

  if (counter.c >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((counter.e - now) / 1000),
    }
  }

  counter.c += 1
  // KV exige TTL mínimo de 60s; la ventana lógica la gobierna `e`, así que
  // el entry puede expirar un poco después sin afectar el conteo real.
  await kv.put(key, JSON.stringify(counter), {
    expirationTtl: Math.max(60, Math.ceil((counter.e - now) / 1000)),
  })
  return { allowed: true, remaining: limit - counter.c, retryAfterSec: 0 }
}

export function clientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
}
