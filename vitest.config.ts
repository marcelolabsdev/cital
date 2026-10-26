import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./tests/setup.ts'],
    poolOptions: {
      workers: {
        main: './src/index.ts',
        singleWorker: true,
        miniflare: {
          compatibilityFlags: ['export_commonjs_default'],
          d1Databases: ['DB'],
          kvNamespaces: ['CACHE'],
          bindings: { SESSION_SECRET: 'test-session-secret' },
        },
        migrationsPath: './src/db/migrations',
      },
    },
  },
})
