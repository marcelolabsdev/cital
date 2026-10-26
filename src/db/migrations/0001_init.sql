-- cital: esquema inicial multi-tenant.
-- SQL portable (sin extensiones exclusivas de SQLite) para facilitar la
-- migración futura a Postgres. Timestamps como texto ISO-8601 UTC.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  logo_url TEXT,
  brand_color TEXT NOT NULL DEFAULT '#4f46e5',
  cancellation_policy_hours INTEGER NOT NULL DEFAULT 24,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  booking_lead_hours INTEGER NOT NULL DEFAULT 2,
  booking_window_days INTEGER NOT NULL DEFAULT 60,
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  plan TEXT NOT NULL DEFAULT 'free',
  trial_ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  price_clp INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_services_tenant ON services(tenant_id);

CREATE TABLE professionals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  bio TEXT,
  color TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_professionals_tenant ON professionals(tenant_id);

CREATE TABLE professional_services (
  professional_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  PRIMARY KEY (professional_id, service_id),
  FOREIGN KEY (professional_id) REFERENCES professionals(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
);
CREATE INDEX idx_prof_services_service ON professional_services(service_id);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  professional_id TEXT,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute INTEGER NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),
  CHECK (end_minute > start_minute),
  FOREIGN KEY (professional_id) REFERENCES professionals(id)
);
CREATE INDEX idx_schedules_lookup ON schedules(tenant_id, professional_id, weekday);

CREATE TABLE time_blocks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  professional_id TEXT,
  kind TEXT NOT NULL DEFAULT 'block',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (professional_id) REFERENCES professionals(id)
);
CREATE INDEX idx_time_blocks_tenant ON time_blocks(tenant_id, start_at);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  price_clp INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'public',
  manage_token TEXT NOT NULL UNIQUE,
  reminder_sent_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (service_id) REFERENCES services(id),
  FOREIGN KEY (professional_id) REFERENCES professionals(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX idx_appt_tenant_start ON appointments(tenant_id, start_at);
CREATE INDEX idx_appt_prof_start ON appointments(professional_id, start_at, status);
CREATE INDEX idx_appt_customer ON appointments(customer_id);
