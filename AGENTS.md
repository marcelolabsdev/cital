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
npm run test                # suite completa: 30 tests con D1 real local
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
- **Google Calendar vía Composio — G1 + G2 (conexión) y G3 (push de eventos)**:
  - `src/core/gcalendar/composio.ts`: cliente REST v3.1 (`connected_accounts/link`, estado, DELETE,
    `executeTool` con `user_id`).
  - `src/core/gcalendar/sync.ts`: CREATE/DELETE de eventos (ver §6) enganchado a panel y público.
  - Tabla `calendar_connections` (migración `0004`): **una conexión por profesional**, multi-provider.
  - Connect Link alojada por Composio (con branding en su dashboard) — sin OAuth directo de Google.
  - Callback público `/api/google/callback` con mapeo consume-once en KV.
  - UI en Equipo: conectar / desconectar / badge con el email de la cuenta.
- **Fixes de esta sesión**:
  - `Button` con `forwardRef` → los ⋮ (`DropdownMenuTrigger`) y los `DialogTrigger` funcionan.
  - El panel agenda **fuera del horario semanal** y en minutos fuera de grilla; solo bloquea el solape.
  - El calendario del panel **no pinta** citas canceladas/no-show (el espacio queda libre al mover).
  - El selector de profesional del diálogo filtra por los que ofrecen el servicio elegido.
- **30 tests verdes** (`npm run test`), typecheck y build OK.

### ⏳ Pendiente / a medias

| # | Ítem | Estado |
|---|---|---|
| **G3** | Push de citas → eventos de Google Calendar | ✅ **Implementada** — ver §6 |
| G4 | Freebusy de Google bloquea slots en la reserva pública | No iniciado — **es lo siguiente**; la infraestructura (conexión por profesional + `executeTool`) ya existe |
| — | Emails reales (Resend): `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` | Código listo, falta configurar prod |
| — | Página `/privacidad` | No iniciada |
| — | Login de staff (integrante con su propio usuario) | No iniciado (feature mayor) |
| — | Deploy prod: `db:migrate:remote` (0003 + 0004), `wrangler secret put COMPOSIO_API_KEY` y `PUBLIC_APP_URL`, allowlist de redirect en el dashboard de Composio | Pendiente |

### 🔐 Pendiente de seguridad

La API key de Composio quedó expuesta en un chat de trabajo → **rotarla** en el dashboard de
Composio (Settings → regenerate) y actualizar `.dev.vars` local + el secret de producción.

---

## 6. G3 — Push de citas a Google Calendar (implementada)

**Objetivo cumplido**: cada cita del negocio aparece como evento en el Google Calendar del
profesional que la atiende; al mover o cancelar la cita, el evento se gira en Google.

### Cómo funciona (bits implementados)

- `src/core/gcalendar/sync.ts` — módulo de sync best-effort:
  - `pushEvent(env, conn, userId, timezone, data)` → `GOOGLECALENDAR_CREATE_EVENT`; devuelve el
    `event_id` y **lo guarda en `appointments.google_event_id`**.
  - `deleteEvent(env, conn, userId, eventId)` → `GOOGLECALENDAR_DELETE_EVENT` (tolerante a 404/410).
  - `toLocalStamp(isoUtc, timezone)` → convierte UTC a pared local `YYYY-MM-DDTHH:MM:SS`
    (formato que exigen los tools).
  - `syncAppointment(env, db, timezone, appointmentId, tenantId, op)` — entrada única desde las
    rutas; carga la cita + conexión del profesional y ejecuta CREATE o DELETE. **Nunca lanza**:
    un error de Google se loguea y no afecta la cita. Sin conexión → no-op silencioso.
- `src/core/gcalendar/composio.ts` — `executeTool` acepta `userId`: **Composio v3.1 exige
  `user_id` junto al `connected_account_id`** (error 1811 si falta). Usamos el
  `professionalId`, mismo id con que se creó su auth link.
- `src/db/repos/appointments.ts` — `AppointmentDetailWithGoogle` (agrega `googleEventId`),
  `detailWithGoogle` select compartido y `getByTenantAndId`.

### Hooks (dónde se llama, con `ctx.waitUntil`)

| Archivo | Operación | Acción en Google |
|---|---|---|
| `src/routes/panel/appointments.ts` — `POST /` | cita manual | CREATE |
| `src/routes/panel/appointments.ts` — `PATCH /:id/move` | mover (recrea la cita) | DELETE (vieja) + CREATE (nueva) |
| `src/routes/panel/appointments.ts` — `PATCH /:id/status` | cancel / no_show | DELETE |
| `src/routes/public.ts` — `POST /:slug/bookings` | reserva pública | CREATE |
| `src/routes/public.ts` — `POST /booking/:token/cancel` | cancela el cliente | DELETE |
| `src/routes/public.ts` — `POST /booking/:token/reschedule` | reprograma el cliente | DELETE + CREATE |

### Detalles que quizás necesites tocar después

- Formato de horas de los tools: `YYYY-MM-DDTHH:MM:SS` + `timezone` IANA del tenant.
- En el CREATE/DELETE se manda `create_meeting_room: false` (evita links de Meet) y
  `send_updates: 'none'` (evita emails de Google aparte de los de cital).
- La respuesta del tool incluye el evento completo en `data.response_data` (Google API cruda):
  el id está en `raw.id` (aliases `event_id`/`eventId` por si cambia la versión).
- Autor del evento: la cuenta Google del profesional (`calendar_id: 'primary'`).
- Título del evento: `"<Servicio> — <Cliente>"`; description = notas de la cita.

### Verificación

- Tests (`tests/booking.spec.ts`): `toLocalStamp` correcto; sin `COMPOSIO_API_KEY` la sync
  no hace nada y no escribe `google_event_id`; sin conexión es no-op. 30 tests verdes.
- Manual (verificado con la cuenta real del negocio): crear evento → aparece en el Calendar
  del profesional a la hora local correcta; borrar → desaparece.
- **Pendiente** de validar con el usuario: mover cita por drag & drop (DELETE + CREATE encadenados).

### Variables

- `COMPOSIO_API_KEY` (secret) — obligatoria para la sync.
- `PUBLIC_APP_URL` — callback/recursos canónicos.
- Dashboard de Composio: Redirect URLs incluye el callback de producción
  (`https://<tu-dominio>/api/google/callback`); en dev `http://localhost:5174`.

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
npm run test        # 30+ tests verdes
npm run build       # build de web/dist OK
```

Si tocaste migraciones, aplica también `npm run db:migrate:local` y confirma que la suite sigue
verde (los tests aplican las migraciones en su propia D1).

Commits: mensajes en español, formato corto tipo `fix(agenda): …` / `feat(gcalendar): …`.
Rama principal: `main` (se pushea directo a `origin`).
