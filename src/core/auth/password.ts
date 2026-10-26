/**
 * Hash de contraseñas con PBKDF2-SHA256 (WebCrypto, 100.000 iteraciones).
 * Formato almacenado: pbkdf2$100000$<salt b64>$<hash b64>
 */

const ITERATIONS = 100_000
const KEY_BITS = 256
const ENCODER = new TextEncoder()

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', ENCODER.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt)
  const toB64 = (bytes: Uint8Array) => {
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  }
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 1) return false
  const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
  let salt: Uint8Array
  let expected: Uint8Array
  try {
    salt = fromB64(parts[2]!)
    expected = fromB64(parts[3]!)
  } catch {
    return false
  }
  const bits = await crypto.subtle.importKey('raw', ENCODER.encode(password), 'PBKDF2', false, ['deriveBits'])
  const digest = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
      bits,
      expected.length * 8,
    ),
  )
  if (digest.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < digest.length; i++) diff |= digest[i]! ^ expected[i]!
  return diff === 0
}
