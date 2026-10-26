/** Slugs de URL pública: minúsculas, sin acentos, solo letras/números/guiones. */

const RESERVED = new Set([
  'api', 'panel', 'r', 'admin', 'app', 'www', 'auth', 'public', 'cital',
  'login', 'registro', 'ajustes', 'soporte', 'ayuda', 'blog', 'about',
])

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug) && !RESERVED.has(slug)
}

/** Sugiere un slug disponible agregando -2, -3, ... a partir de los tomados. */
export function suggestSlug(base: string, taken: Set<string>): string {
  const clean = slugify(base) || 'mi-negocio'
  if (!taken.has(clean) && isValidSlug(clean)) return clean
  for (let i = 2; i < 100; i++) {
    const candidate = `${clean}-${i}`.slice(0, 48)
    if (!taken.has(candidate)) return candidate
  }
  return `${clean}-${Date.now().toString(36)}`
}
