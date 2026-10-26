/** Generación de identificadores y tokens seguros (WebCrypto, sin dependencias). */

export function newId(): string {
  return crypto.randomUUID()
}

/** Token aleatorio de 256 bits en base64url. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bytesToB64Url(bytes)
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function bytesToB64Url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Ahora, en UTC, como texto ISO-8601 (YYYY-MM-DDTHH:MM:SSZ). */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}
