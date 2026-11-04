-- Foto de los integrantes del equipo: data-URL base64 comprimida en el
-- navegador (JPEG <= ~150KB). NULL = sin foto (se muestra la inicial).
ALTER TABLE professionals ADD COLUMN photo TEXT
;