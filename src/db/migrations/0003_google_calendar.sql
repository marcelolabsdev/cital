-- Google Calendar (fase G1): conexión por profesional y traza del evento externo.
-- El profesional conecta su propia cuenta Google: guardamos su refresh token
-- cifrable en reposo, el calendario destino y su email para mostrarlo en la UI.

ALTER TABLE professionals ADD COLUMN google_refresh_token TEXT;
ALTER TABLE professionals ADD COLUMN google_calendar_id TEXT;
ALTER TABLE professionals ADD COLUMN google_email TEXT;
ALTER TABLE professionals ADD COLUMN google_connected_at TEXT;

-- id del evento en Google Calendar, para actualizar/cancelar la cita sincronizada
ALTER TABLE appointments ADD COLUMN google_event_id TEXT;
