import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

/**
 * Puerto de datos. Hoy: Drizzle sobre D1. Para migrar a Postgres (Insforge/
 * Supabase) basta con crear otra fábrica (drizzle-orm/node-postgres) y mantener
 * los repositorios: la lógica de negocio nunca toca el driver directamente.
 */
export type Db = ReturnType<typeof createDb>

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}
