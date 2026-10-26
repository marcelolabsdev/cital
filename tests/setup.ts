import { beforeAll } from 'vitest'
import { applyD1Migrations, env as providedEnv } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../src/db/schema'
// Migraciones como texto (transform ?raw de Vite)
import migration0001 from '../src/db/migrations/0001_init.sql?raw'
import migration0002 from '../src/db/migrations/0002_cancellation_policy.sql?raw'

/** Bindings tipados según wrangler.jsonc (ProvidedEnv no los conoce). */
export const env = providedEnv as unknown as {
  DB: D1Database
  CACHE: KVNamespace
  SESSION_SECRET: string
}

/** Divide un .sql en queries individuales, descartando comentarios. */
function toQueries(sql: string): string[] {
  return sql
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((q) => q.length > 0)
}

const migrations = [
  { name: '0001_init.sql', queries: toQueries(migration0001) },
  { name: '0002_cancellation_policy.sql', queries: toQueries(migration0002) },
]

beforeAll(async () => {
  await applyD1Migrations(env.DB, migrations)
})

/** DB tipada para sembrar datos de prueba. */
export function testDb() {
  return drizzle(env.DB, { schema })
}

