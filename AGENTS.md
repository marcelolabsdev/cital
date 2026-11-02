# AGENTS.md — Guía de trabajo en cital

> Este archivo es el punto de partida para cualquier agente (o persona) que clone el repo.
> Resume **qué es el proyecto, cómo se levanta, qué está hecho, qué quedó a medias y qué
> trampas hay**. Si vienes de otra sesión, léelo completo antes de tocar código.
>
> Última actualización: **2 de noviembre de 2026** — commit `ab495ee` (rama `main`).

---

## 1. Qué es cital

SaaS de agendamiento multi-tenant para pymes de servicios (barberías, clínicas, estéticas,
psicólogos…). Cada negocio tiene un panel de administración y una **página pública** donde sus
clientes agendan sin crear cuenta.

- **Multi-tenant desde el día 1**: toda tabla de negocio lleva `tenant_id` y cada query filtra por él.
- **100 % Cloudflare**: Hono + D1 (SQLite) + KV + Cron Triggers; los assets los sirve el mismo Worker.
- **Español de Chile**: fechas es-CL, precios CLP, teléfonos +56, feriados legales de Chile,
  zona horaria `America/Santiago`.

| Capa | Tecnología |
|---|---|
| Backend | Hono + TypeScript sobre Cloudflare Workers |
| Datos | D1 + Drizzle ORM (migraciones SQL portables a Postgres) |
| Frontend | React 18 + Vite + Tailwind CSS 4 + shadcn/ui |
| Sesiones | Cookie httpOnly + tabla `sessions` (hash del token en D1) |
| Calendario externo | **Composio** (REST v3.1) → Google Calendar |
| Tests | Vitest + `@cloudflare/vitest-pool-workers` (D1 real local) |

---

## 2. Arranque local (5 minutos)

```bash
npm install                      # instala raíz + workspace web/
cp .dev.vars.example .dev.vars   # ⚠️ .dev.vars NO se versiona (está en .gitignore)
npm run db:migrate:local         # aplica migraciones a la D1 local
npm run dev                      # Worker :8787 + Vite :5174 (en paralelo)
```

Abre `http://localhost:5174`, crea tu cuenta y sigue el onboarding. La página pública queda en
`/r/<tu-slug>`.

**Variables de entorno** (definidas en `src/env.ts`):

| Variable | Dónde | Para qué |
|---|---|---|
| `SESSION_SECRET` | `.dev.vars` / secret | Firma y hash de sesiones. **Obligatoria.** |
| `EMAIL_PROVIDER` | `.dev.vars` / secret | `log` (dev) o `resend` (prod) |
| `RESEND_API_KEY` | secret (prod) | API de Resend para emails reales |
| `TURNSTILE_SECRET_KEY` / `TURNSTILE_SITE_KEY` | secret (prod) | Anti-spam; sin esto se omite |
| `PUBLIC_APP_URL` | secret (prod) | Origen canónico (callback OAuth, links de email) |
| `COMPOSIO_API_KEY` | `.dev.vars` / secret | API key de Composio (Google Calendar). Sin esto, la conexión de calendario queda deshabilitada |

En **producción**: `npx wrangler secret put <NOMBRE>` (nunca en el código).

### Comandos

```bash
npm run dev                 # wrangler dev + vite en paralelo
npm run typecheck           # TypeScript del backend (tsc --noEmit)
npm run test                # suite completa: 27 tests con D1 real local
npm run build               # build de producción del frontend (web/dist)
npm run deploy              # build + wrangler deploy
npm run db:migrate:local    # migraciones → D1 local
npm run db:migrate:remote   # migraciones → D1 de producción
npm run db:create           # crea la D1 en tu cuenta de Cloudflare
```

---

## 3. Mapa del repo

```
src/                              Backend (Worker)
  index.ts                        Montaje de rutas + cron de recordatorios
  env.ts                          Tipos de bindings (Env, HonoEnv)
  core/
    availability/                 Motor de disponibilidad (función pura) + orquestador D1
    booking/service.ts            Reserva atómica anti-doble-reserva (createBooking)
    auth/                         PBKDF2 + sesiones
    notifications/                Recordatorios por cron (cada 10 min)
    gcalendar/composio.ts         Cliente REST v3.1 de Composio (conectar, estado, executeTool)
  db/
    schema.ts                     Esquema Drizzle
    migrations/                   SQL numerado (wrangler d1 migrations apply)
    repos/                        Acceso a datos; **tenant_id forzado en cada query**
  routes/
    auth.ts                       /api/auth/* (registro, login, logout, sesión)
    panel.ts                      /api/panel/* (monta los submódulos; exige sesión)
    panel/*.ts                    services · professionals · schedules · blocks ·
                                  appointments · customers · dashboard · google
    public.ts                     /api/public/* (slug, availability, days, bookings, /booking/:token)
    google.ts                     /api/google/callback (callback público de Composio, sin sesión)
  lib/                            tz · slug · feriados-chile · rate-limit · turnstile · email · ids
web/                              Frontend React
  src/features/
    auth/ onboarding/             Acceso y configuración inicial
    panel/                        dashboard · calendario · clientes · servicios · equipo ·
                                  horarios · ajustes
    booking/                      Página pública /r/:slug (4 pasos) y /reserva/:token
  src/components/ui/              Componentes shadcn (button, dialog, dropdown-menu…)
  src/lib/                        api (fetch + ApiError) · format · brand · utils
tests/                            availability.spec.ts · booking.spec.ts (27 tests)
```

### Rutas API útiles

| Ruta | Qué hace |
|---|---|
| `POST /api/panel/appointments` | Cita manual desde el calendario del panel |
| `PATCH /api/panel/appointments/:id/move` | Mover cita (drag & drop); recrea la cita y cancela la original en el mismo batch |
| `PATCH /api/panel/appointments/:id/status` | Cambiar estado (confirmada, cancelada, completada…) |
| `POST /api/public/:slug/bookings` | Reserva pública (estricta: exige slot ofertado) |
| `POST /api/public/booking/:token/cancel` | Cancela la reserva desde el enlace del cliente |
| `POST /api/public/booking/:token/reschedule` | Reprograma desde el enlace del cliente |
| `GET /api/panel/google/connect?professionalId=` | Crea la auth-link session de Composio → `{ authUrl }` |
| `DELETE /api/panel/google/connection/:professionalId` | Desconecta (borra en Composio y en D1) |
| `GET /api/google/callback` | Callback público de Composio (consume-once en KV) → redirige `/panel/equipo?google=…` |

---

## 4. Convenciones del proyecto

1. **Multi-tenant**: todo query de negocio pasa por `db/repos/*`, que exige `tenantId`.
   Nunca escribas queries inline en rutas.
2. **Fechas**: se guarda **UTC** (ISO-8601 texto) y se muestra en `America/Santiago`.
   Conversión con `src/lib/tz.ts` (`zonedToUtc`, `zonedParts`, `toIso`) — usa esas funciones,
   no `new Date()` a pelo para lógica de agenda.
3. **Textos de UI en español de Chile**; precios en CLP; `Intl.DateTimeFormat('es-CL')`.
4. **Drizzle** para el ORM; las migraciones son SQL manual numerado (`000N_nombre.sql`).
5. **Backend**: lógica de negocio en `src/core/`, acceso a datos en `src/db/`.
   El core no debe tocar el driver (para poder migrar a Postgres después).
6. **Frontend**: componentes shadcn en `web/src/components/ui/`; features en
   `web/src/features/<area>/`; data fetching con TanStack Query (`web/src/features/panel/hooks.ts`).
7. **Errores**: `AppError` + helpers en `src/middleware/errors.ts` (`notFound`, `badRequest`,
   `conflict`, `serviceUnavailable`). El frontend los muestra como toast con `ApiError.message`.
8. **Nada de secretos en el repo**: `.dev.vars` está en `.gitignore`; en prod, `wrangler secret put`.

---

## 5. Estado del proyecto (2 nov 2026)

### ✅ Hecho y verificado

- **MVP completo (fases 1–7)**: registro/login/sesión, onboarding, servicios, equipo, horarios,
  bloqueos, feriados de Chile, motor de disponibilidad, página pública de 4 pasos, gestión de
  reserva por token, panel (dashboard, calendario, clientes, servicios, equipo, horarios, ajustes),
  emails de confirmación + recordatorios por cron, anti-spam Turnstile, rate limiting.
- **Anti doble-reserva**: `INSERT … SELECT … WHERE NOT EXISTS (solape)` atómico en D1; probado con
  8 inserciones concurrentes → exactamente 1 gana.
- **Google Calendar vía Composio — G1 + G2 (conexión)**:
  - `src/core/gcalendar/composio.ts`: cliente REST v3.1 (`connected_accounts/link`, estado, DELETE,
    `executeTool`).
  - Tabla `calendar_connections` (migración `0004`): **una conexión por profesional**, multi-provider.
  - Connect Link alojada por Composio (con branding en su dashboard) — sin OAuth directo de Google.
  - Callback público `/api/google/callback` con mapeo consume-once en KV.
  - UI en Equipo: conectar / desconectar / badge con el email de la cuenta.
- **Fixes de esta sesión**:
  - `Button` con `forwardRef` → los ⋮ (`DropdownMenuTrigger`) y los `DialogTrigger` funcionan.
  - El panel agenda **fuera del horario semanal** y en minutos fuera de grilla; solo bloquea el solape.
  - El calendario del panel **no pinta** citas canceladas/no-show (el espacio queda libre al mover).
  - El selector de profesional del diálogo filtra por los que ofrecen el servicio elegido.
- **27 tests verdes** (`npm run test`), typecheck y build OK.

### ⏳ Pendiente / a medias

| # | Ítem | Estado |
|---|---|---|
| **G3** | **Push de citas → eventos de Google Calendar** | **A medias — ver §6. Es lo siguiente.** |
| G4 | Freebusy de Google bloquea slots en la reserva pública | No iniciado (depende de G3) |
| — | Emails reales (Resend): `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` | Código listo, falta configurar prod |
| — | Página `/privacidad` | No iniciada |
| — | Login de staff (integrante con su propio usuario) | No iniciado (feature mayor) |
| — | Deploy prod: `db:migrate:remote` (0003 + 0004), `wrangler secret put COMPOSIO_API_KEY` y `PUBLIC_APP_URL`, allowlist de redirect en el dashboard de Composio | Pendiente |

### 🔐 Pendiente de seguridad

La API key de Composio quedó expuesta en un chat de trabajo → **rotarla** en el dashboard de
Composio (Settings → regenerate) y actualizar `.dev.vars` local + el secret de producción.

---

## 6. G3 — Push de citas a Google Calendar (tarea a medias, plan listo)

**Objetivo**: que cada cita del negocio aparezca como evento en el Google Calendar **del
profesional** que la atiende, y que se actualice/borre sola al mover o cancelar la cita.

### Estado previo (ya existe, no rehacer)

- `src/core/gcalendar/composio.ts` → `executeTool(env, toolSlug, connectedAccountId, args)` ya
  implemented y tipado. Envía `POST /api/v3.1/tools/execute/{slug}` con `{ connected_account_id, arguments }`.
- `appointments.google_event_id` → **columna ya existe** (`src/db/schema.ts`), creada en la
  migración `0003_google_calendar.sql`. Sirve para referenciar el evento de Google.
- `src/db/repos/calendarConnections.ts` → `getConnectionForProfessional(db, tenantId, professionalId)`.
- Conexión real funcionando end-to-end (el usuario ya conectó su cuenta; badge verde en Equipo).

### Paso 1 — Descubrir los slugs y argumentos reales de los tools

No adivines los nombres. Consulta la API de Composio con tu key:

```bash
curl -s "https://backend.composio.dev/api/v3.1/tools?toolkit=googlecalendar" \
  -H "x-api-key: $COMPOSIO_API_KEY"
```

Filtra los que contengan `EVENT` (típicamente `GOOGLECALENDAR_CREATE_EVENT`,
`GOOGLECALENDAR_UPDATE_EVENT` / `..._MODIFY_EVENT`, `GOOGLECALENDAR_DELETE_EVENT`) y **anota los
argumentos exactos** (`event_title` / `start_datetime` / `end_datetime` / `calendar_id` / etc.).
Alternativa: `GET /api/v3.1/tools?toolkits=googlecalendar` o la página del toolkit en
`composio.dev/toolkits/googlecalendar`.

### Paso 2 — Nuevo módulo `src/core/gcalendar/sync.ts`

Tres funciones best-effort, con la misma forma que el resto del core:

```ts
pushEvent(env, conn, { title, startAt, endAt, color?, notes? }): Promise<{ eventId: string }>
updateEvent(env, conn, eventId, { startAt, endAt, title? }): Promise<void>
deleteEvent(env, conn, eventId): Promise<void>
```

Reglas:
- **Nunca lanzan hacia el flujo de la cita**: capturan el error, lo loguean
  (`console.error('[cital:gcal] …')`) y devuelven `null`/void.
- Si el profesional **no tiene conexión** → no se hace nada (skip silencioso).
- Fechas: enviar ISO con offset de `America/Santiago` (el `tenant.timezone`), no UTC pelado,
  para que el evento caiga en la hora local correcta.
- Título sugerido: `"<Servicio> — <Cliente>"`; duración = `endAt - startAt` (ya viene en la cita).

### Paso 3 — Enganchar los flujos (con `ctx.waitUntil`)

La cita **nunca** debe esperar a Google. En cada ruta, tras confirmar la operación en D1:

```ts
c.executionCtx.waitUntil(
  syncAppointmentToGoogle(c.env, { db, tenantId, appointmentId, op: 'create' | 'update' | 'delete' })
    .catch((err) => console.error('[cital:gcal] sync falló:', err)),
)
```

Puntos exactos a tocar:

| Archivo | Línea aprox. | Operación | Tool |
|---|---|---|---|
| `src/routes/panel/appointments.ts` | 57 (`POST /`) | crear evento | CREATE |
| `src/routes/panel/appointments.ts` | 117 (`PATCH /:id/move`) | **borrar** el evento viejo + **crear** el nuevo (la cita original se cancela y nace otra con id nuevo) | DELETE + CREATE |
| `src/routes/panel/appointments.ts` | 151 (`PATCH /:id/status`) | si el nuevo estado es `cancelled` → borrar evento | DELETE |
| `src/routes/public.ts` | 199 (`POST /:slug/bookings`) | crear evento | CREATE |
| `src/routes/public.ts` | 298 (`POST /booking/:token/reschedule`) | borrar + crear | DELETE + CREATE |
| `src/routes/public.ts` | 254 (`POST /booking/:token/cancel`) | borrar evento | DELETE |

Tip: el `move` y el `reschedule` **recrean** la cita (nace un id nuevo), así que el
`google_event_id` de la cita nueva está vacío y el de la vieja sigue apunta al evento viejo:
borra el viejo y crea el nuevo (o actualiza el viejo y guarda su id en la cita nueva).

Tras crear el evento, **guarda el id** devuelto por Composio:

```sql
UPDATE appointments SET google_event_id = ? WHERE id = ?
```

(`AppointmentDetail` en `src/db/repos/appointments.ts` hoy no selecciona esa columna: agrégala si
necesitas leerla en las rutas.)

### Paso 4 — Tests

- Añadir tests en `tests/booking.spec.ts` (o un `tests/gcalendar.spec.ts`) **mockeando**
  `executeTool` (vi.mock) para verificar que:
  - con conexión → se llama CREATE y se guarda `google_event_id`;
  - sin conexión → no se llama a Composio y la cita **igual** se crea;
  - un error de Composio **no** revierte la cita.
- Mantener `npm run test` en verde (hoy: 27).

### Paso 5 — Verificación manual

1. Panel → Equipo → profesional con Google conectado.
2. Crear una cita manual → aparece en Google Calendar del profesional con la hora local correcta.
3. Moverla (drag & drop) → el evento de Google se actualiza (no queda duplicado).
4. Cancelarla → el evento desaparece de Google.
5. Probar con un profesional **sin** conexión → la cita se crea igual, sin errores en consola.

### Variables y configuración

- `COMPOSIO_API_KEY` (secret de producción) — sin esto, `ensureGoogleAuthConfigId` lanza y la
  conexión falla con el mensaje "habilita el toolkit Google Calendar en tu dashboard".
- `PUBLIC_APP_URL` — origen canónico del callback (`appOrigin()` en `composio.ts`).
- En el dashboard de Composio: **Redirect URLs** debe incluir el callback de producción
  (`https://<tu-dominio>/api/google/callback`). En dev siempre `http://localhost:5174`.

---

## 7. Trampas conocidas (no las repitas)

1. **`;` dentro de comentarios SQL rompe los tests.** `tests/setup.ts` parte las migraciones por
   `;`, así que un `;` en un `-- comentario` parte la sentencia a la mitad y D1 da
   `syntax error near "esta"`. En los `.sql` evita `;` en los comentarios.
2. **`Button` (y cualquier componente shadcn que use `asChild`) necesita `forwardRef`.**
   Sin eso, Radix no puede medir/posicionar el trigger: los menús ⋮ abren pero los ítems no
   responden, y React avisa *"Function components cannot be given refs"*. Patrón:
   `React.forwardRef<HTMLButtonElement, Props>((props, ref) => <Comp ref={ref} … />)`.
3. **Página pública estricta vs panel laxo.** `createBooking` exige que el horario sea un slot
   ofertado **solo si `source === 'public'`**. El panel agenda a cualquier hora; lo único que
   bloquea es el solape (INSERT atómico con `NOT EXISTS`).
4. **El calendario del panel no debe pintar citas canceladas/no-show** (`CalendarPage.tsx` filtra
   por estado). Si vuelve a aparecer el "espacio atascado" al mover una cita, es esto.
5. **Rate limit por IP en `/api/auth/register`.** Si ves `429`, espera o reutiliza una sesión
   existente (login) en vez de registrar usuarios en bucle.
6. **Puertos y procesos zombis.** `npm run dev` levanta wrangler en `:8787` y Vite en `:5174`
   (Vite hace proxy de `/api/*` → `http://127.0.0.1:8787`). Si un wrangler anterior quedó vivo,
   el nuevo arranca en `:8788` y el proxy apunta al backend viejo → errores raros (500).
   Antes de arrancar: `Get-NetTCPConnection -LocalPort 5174,8787 -State Listen` y mata los PIDs
   (`Stop-Process -Id <pid> -Force`).
7. **Migrar en local no es migrar en prod.** `npm run db:migrate:remote` es aparte; la D1 de
   producción tiene su propio estado.
8. **No subas `.dev.vars`.** Está en `.gitignore`; usa `.dev.vars.example` como plantilla.
9. **Los secretos de Google OAuth directo quedaron obsoletos** (`GOOGLE_CLIENT_ID/SECRET`): la
   integración va por Composio. No las re-introduzcas.

---

## 8. Verificación antes de dar por terminado algo

```bash
npm run typecheck   # 0 errores
npm run test        # 27+ tests verdes
npm run build       # build de web/dist OK
```

Si tocaste migraciones, aplica también `npm run db:migrate:local` y confirma que la suite sigue
verde (los tests aplican las migraciones en su propia D1).

Commits: mensajes en español, formato corto tipo `fix(agenda): …` / `feat(gcalendar): …`.
Rama principal: `main` (se pushea directo a `origin`).
