# cital

SaaS de agendamiento y reservas online para pymes de servicios (barberías, clínicas, estéticas, psicólogos, canchas…). Cada negocio tiene su panel de administración y una página pública de reservas donde sus clientes agendan sin crear cuenta.

- **Multi-tenant desde el día 1**: todas las tablas llevan `tenant_id` y cada consulta filtra por él.
- **100 % Cloudflare Workers**: Hono + D1 (SQLite) + KV + Cron Triggers, con assets estáticos servidos por el mismo Worker.
- **Español de Chile**: fechas es-CL, precios CLP, teléfonos +56, feriados legales de Chile, zona horaria America/Santiago.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Hono + TypeScript sobre Cloudflare Workers |
| Base de datos | Cloudflare D1 con Drizzle ORM (migraciones SQL portátiles a Postgres) |
| Frontend | React 18 + Vite + Tailwind CSS 4 + shadcn/ui + Framer Motion |
| Sesiones | Cookie httpOnly + tabla `sessions` (hash del token en D1) |
| Emails | Resend (producción) / Log en consola (desarrollo) |
| Anti-spam | Cloudflare Turnstile + rate limiting por IP en KV |
| Tests | Vitest + @cloudflare/vitest-pool-workers (D1 real en local) |

## Estructura

```
src/                    Backend (Worker)
  core/
    availability/       Motor de disponibilidad (función pura) + servicio
    booking/            Reserva atómica (anti doble-reserva)
    auth/               Contraseñas (PBKDF2) y sesiones
    notifications/      Confirmaciones y recordatorios
    gcalendar/          Cliente Composio (conexión Google Calendar)
  db/
    schema.ts           Esquema Drizzle
    migrations/         SQL de migraciones (wrangler d1 migrations)
    repos/              Acceso a datos, tenant_id forzado en cada query
  routes/               auth · panel/* · public/*
  lib/                  tz · slug · feriados-chile · rate-limit · turnstile · email
web/                    Frontend (React + Vite)
  src/features/
    auth/ onboarding/   Acceso y configuración inicial
    panel/              Dashboard · Calendario · Clientes · Servicios · Equipo · Horarios · Ajustes
    booking/            Página pública /r/:slug (4 pasos) y gestión /reserva/:token
tests/                  availability.spec.ts · booking.spec.ts
```

## Requisitos

- Node.js 20+
- Una cuenta de Cloudflare (gratis) y `wrangler` autenticado: `npx wrangler login`

## Puesta en marcha local (5 minutos)

```bash
# 1. Instalar dependencias (workspace raíz + web/)
npm install

# 2. Crear la base de datos D1 en tu cuenta (solo una vez; para local no es necesario)
npm run db:create
#    → copia el database_id que imprime y pégalo en wrangler.jsonc

# 3. Aplicar migraciones a la base local
npm run db:migrate:local

# 4. Variables locales (.dev.vars no se versiona: usa la plantilla)
cp .dev.vars.example .dev.vars
#    → rellena SESSION_SECRET y COMPOSIO_API_KEY (opcional en dev)
#    SESSION_SECRET=...   EMAIL_PROVIDER=log   COMPOSIO_API_KEY=...

# 5. Levantar todo (Worker en :8787 + Vite en :5174)
npm run dev
```

Abre `http://localhost:5174`, crea tu cuenta y sigue el onboarding. La página pública de reservas queda en `/r/<tu-slug>`.

> El puerto 5174 está fijado en `web/vite.config.ts` para no chocar con otras apps.

> 🤖 **Si vienes a retomar el proyecto (o sos un agente):** lee **[`AGENTS.md`](./AGENTS.md)** — tiene el estado real, lo que quedó a medias, el plan técnico de la G3 (push a Google Calendar) y las trampas conocidas del repo.

## Comandos útiles

```bash
npm run dev                    # wrangler dev + vite en paralelo
npm run build                  # build de producción del frontend
npm run test                   # suite completa (27 tests, D1 real en local)
npm run typecheck              # TypeScript del backend
npm run db:migrate:local       # migraciones → base local
npm run db:migrate:remote      # migraciones → base de producción
npm run deploy                 # build + deploy a Cloudflare Workers
npx wrangler d1 execute cital --local --command "SELECT ..."   # consultas SQL locales
npx wrangler dev --test-scheduled   # expone /__scheduled para probar el cron
```

## Deploy a producción

```bash
# 1. Base de datos remota (si no la creaste)
npm run db:create
npm run db:migrate:remote

# 2. Secrets (nunca van en el código)
npx wrangler secret put SESSION_SECRET      # openssl rand -hex 32
npx wrangler secret put PUBLIC_APP_URL      # ej: https://cital.tu-dominio.cl

# 2b. Google Calendar (vía Composio) — sin esto la conexión queda deshabilitada
npx wrangler secret put COMPOSIO_API_KEY    # app.composio.dev → Settings → API keys
#    → en el dashboard de Composio, agregar el callback a las Redirect URLs:
#      https://<tu-dominio>/api/google/callback
#    → y aplicar las migraciones 0003/0004 en la D1 remota:
npm run db:migrate:remote

# 3. Email con Resend (opcional; sin esto los emails se registran en consola)
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_PROVIDER      # valor: resend

# 4. Turnstile (opcional; sin esto la verificación se omite)
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put TURNSTILE_SITE_KEY

# 5. Publicar
npm run deploy
```

Tras el deploy, la app queda en `https://cital.<tu-subdominio>.workers.dev`. Para dominio propio, configura la ruta en el dashboard de Cloudflare y actualiza `PUBLIC_APP_URL`.

## Cómo funciona por dentro

### Anti doble-reserva
La creación de una cita valida que el horario sea un slot realmente ofertado (motor de disponibilidad puro) y luego ejecuta **una sola sentencia** `INSERT … SELECT … WHERE NOT EXISTS (solape)` — atómica en D1. Si otro proceso ganó el hueco, `meta.changes === 0` y se responde `409`. Probado con 8 inserciones concurrentes (`tests/booking.spec.ts`).

### Zonas horarias
Todo se guarda en **UTC** (texto ISO-8601) y se muestra en `America/Santiago`. La conversión usa `Intl.DateTimeFormat` (sin dependencias, funciona igual en Workers y Node, respeta el DST histórico chileno). Los horarios semanales se guardan en minutos locales del negocio.

### Multi-tenant
Cada tabla de negocio lleva `tenant_id`; los repositorios lo exigen en cada query y el middleware de sesión inyecta el `tenantId` verificado. Cubierto por tests de aislamiento entre tenants.

### Recordatorios (cron)
Cada 10 minutos, un Cron Trigger busca citas que empiezan entre 20 y 28 horas después, con email y sin recordatorio previo (`reminder_sent_at`), y las marca como enviadas — idempotente.

### Migrar a Postgres (Insforge/Supabase)
La lógica de negocio no toca el driver: vive en `core/` sobre tipos de dominio, y el acceso a datos está aislado en `db/repos/` + `db/client.ts`. Para migrar: nueva fábrica `drizzle-orm/node-postgres`, mismo esquema en `pgTable`, y los SQL de migración ya evitan sintaxis exclusiva de SQLite.

## Estado del proyecto y próximos pasos

**Hecho**: MVP completo (7 fases) · integración **Google Calendar vía Composio** (conectar /
desconectar la cuenta de cada profesional, con Connect Link alojada por Composio) · **push de
citas a Google Calendar** (crear/mover/cancelar sincroniza el evento del profesional) · agenda del
panel con drag & drop · 30 tests verdes.

**En curso / pendiente**:

| # | Ítem | Estado |
|---|---|---|
| G3 | Push de citas → eventos en el Google Calendar del profesional (crear/mover/cancelar) | ✅ implementada |
| G4 | Freebusy de Google bloquea slots en la reserva pública | ⏳ siguiente |
| — | Emails reales (Resend) en producción | ⏳ (código listo, falta el secret) |
| — | Página `/privacidad` | ⏳ |
| — | Login de staff (integrante con usuario propio) | ⏳ |

👉 **Detalle, trampas y plan de la G3: [`AGENTS.md`](./AGENTS.md)**

## Preparado para el futuro (fuera del MVP)

- **Pagos** (Flow/Mercado Pago/Webpay): campo `price_clp` congelado por cita y `plan` en tenants ya existentes.
- **WhatsApp API**: hoy enlace `wa.me` en la ficha del cliente; el Mailer es una interfaz única donde cabe un `WhatsAppMailer`.
- **Planes y suscripciones**: `plan` / `trial_ends_at` en la tabla `tenants`.

## Verificación del MVP

| Área | Estado |
|---|---|
| Registro/login/logout/sesión | ✅ probado (curl + navegador) |
| Servicios, equipo, horarios, bloqueos, feriados | ✅ probado (curl + navegador) |
| Motor de disponibilidad | ✅ 30 tests (buffer, lead time, bloqueos, DST, solapes) |
| Anti doble-reserva | ✅ 2 y 8 reservas concurrentes → exactamente 1 gana |
| Página pública 4 pasos + gestión por token | ✅ probado end-to-end en navegador |
| Calendario día/semana/mes + drag & drop | ✅ probado |
| Clientes: ficha, historial, notas, búsqueda, CSV | ✅ probado |
| Dashboard: hoy, ingresos, cancelaciones, top servicios | ✅ probado |
| Email confirmación + cron recordatorios | ✅ LogMailer probado; Resend listo con secret |
| Google Calendar por profesional (conexión vía Composio) | ✅ Connect Link + callback + desconexión |
| Agenda: cita manual fuera de horario, mover y cancelar | ✅ probado (panel laxo, público estricto) |
