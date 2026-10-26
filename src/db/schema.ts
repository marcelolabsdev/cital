import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Esquema multi-tenant: todas las tablas de negocio llevan tenant_id y los
 * repositorios fuerzan el filtro en cada consulta. Timestamps en texto ISO-8601
 * UTC (comparables lexicográficamente y portables a Postgres).
 */

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  timezone: text('timezone').notNull().default('America/Santiago'),
  logoUrl: text('logo_url'),
  brandColor: text('brand_color').notNull().default('#1E5C4F'),
  cancellationPolicyHours: integer('cancellation_policy_hours').notNull().default(24),
  /** 'hours' = cancelar con anticipación mínima; 'no_refund' = sin reembolso */
  cancellationPolicyMode: text('cancellation_policy_mode').notNull().default('hours'),
  bufferMinutes: integer('buffer_minutes').notNull().default(0),
  bookingLeadHours: integer('booking_lead_hours').notNull().default(2),
  bookingWindowDays: integer('booking_window_days').notNull().default(60),
  onboardingStep: integer('onboarding_step').notNull().default(1),
  // Preparado para el futuro (fuera del MVP): plan/trial
  plan: text('plan').notNull().default('free'),
  trialEndsAt: text('trial_ends_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull().default('owner'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_users_tenant').on(t.tenantId)],
)

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
})

export const services = sqliteTable(
  'services',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    priceClp: integer('price_clp').notNull().default(0),
    color: text('color'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_services_tenant').on(t.tenantId)],
)

export const professionals = sqliteTable(
  'professionals',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    bio: text('bio'),
    color: text('color'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_professionals_tenant').on(t.tenantId)],
)

export const professionalServices = sqliteTable(
  'professional_services',
  {
    professionalId: text('professional_id').notNull(),
    serviceId: text('service_id').notNull(),
    tenantId: text('tenant_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.professionalId, t.serviceId] }),
    index('idx_prof_services_service').on(t.serviceId),
  ],
)

export const schedules = sqliteTable(
  'schedules',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    // NULL = horario por defecto del negocio
    professionalId: text('professional_id'),
    weekday: integer('weekday').notNull(), // 0 = lunes ... 6 = domingo
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
  },
  (t) => [index('idx_schedules_lookup').on(t.tenantId, t.professionalId, t.weekday)],
)

export const timeBlocks = sqliteTable(
  'time_blocks',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    // NULL = bloquea todo el negocio
    professionalId: text('professional_id'),
    kind: text('kind').notNull().default('block'), // block | holiday | vacation
    startAt: text('start_at').notNull(),
    endAt: text('end_at').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_time_blocks_tenant').on(t.tenantId, t.startAt)],
)

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('idx_customers_tenant').on(t.tenantId),
    index('idx_customers_phone').on(t.tenantId, t.phone),
  ],
)

export const appointments = sqliteTable(
  'appointments',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    serviceId: text('service_id').notNull(),
    professionalId: text('professional_id').notNull(),
    customerId: text('customer_id').notNull(),
    startAt: text('start_at').notNull(),
    endAt: text('end_at').notNull(),
    status: text('status').notNull().default('pending'),
    priceClp: integer('price_clp').notNull().default(0),
    notes: text('notes'),
    source: text('source').notNull().default('public'),
    manageToken: text('manage_token').notNull().unique(),
    reminderSentAt: text('reminder_sent_at'),
    cancelledAt: text('cancelled_at'),
    cancelReason: text('cancel_reason'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('idx_appt_tenant_start').on(t.tenantId, t.startAt),
    index('idx_appt_prof_start').on(t.professionalId, t.startAt, t.status),
    index('idx_appt_customer').on(t.customerId),
  ],
)
