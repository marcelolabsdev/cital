-- Conexiones de calendario externo por profesional (proveedor Composio).
-- La vecina 0003 creó las columnas google_* en professionals y esta migración
-- las retira y centraliza las conexiones en propia tabla (una por profesional,
-- extensible a varios proveedores en el futuro).
-- appointments.google_event_id se conserva para la fase G3 (push de eventos).

ALTER TABLE professionals DROP COLUMN google_refresh_token;
ALTER TABLE professionals DROP COLUMN google_calendar_id;
ALTER TABLE professionals DROP COLUMN google_email;
ALTER TABLE professionals DROP COLUMN google_connected_at;

CREATE TABLE calendar_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  professional_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'composio',
  connected_account_id TEXT NOT NULL,
  account_email TEXT,
  connected_at TEXT NOT NULL
);

CREATE INDEX idx_calconn_tenant ON calendar_connections(tenant_id);
