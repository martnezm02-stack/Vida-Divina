-- 0007_add_prospects.sql
-- FASE "Prospector: Scout -> Google Maps/Apify -> normalización -> dedupe
-- -> PostgreSQL" (2026-09-15). Tabla nueva, aislada -- sin FK hacia
-- customers/orders/payments ni ninguna tabla existente. Un prospecto es
-- un negocio candidato descubierto por Scout, no todavía un customer del
-- CRM -- la promoción de prospect -> customer (si llega a ocurrir) es una
-- decisión de negocio de una fase posterior, fuera de alcance aquí.
--
-- Decisiones de diseño:
--
-- (1) UUID generado por la aplicación (node:crypto randomUUID), mismo
--     mecanismo que el resto del schema -- ver nota (1) de
--     0001_init_schema.sql.
--
-- (2) Sin UNIQUE constraint a nivel de schema sobre google_maps_url ni
--     phone: la deduplicación (prioridad 1. google_maps_url, 2. teléfono
--     normalizado, 3. nombre+dirección) es lógica de aplicación en
--     prospectRepository.js -- mismo criterio que
--     customerRepository.findCustomerByChannel (find-then-create/update
--     explícito, no relying on ON CONFLICT). Un UNIQUE real sobre
--     google_maps_url impediría dos prospectos legítimos sin URL de Maps
--     (ambos NULL no violan UNIQUE en Postgres, pero un índice parcial
--     WHERE NOT NULL sí sería seguro) -- se omite de todas formas para
--     mantener el mismo patrón find-then-write que el resto del CRM, sin
--     introducir un segundo mecanismo de dedupe (constraint DB) además del
--     de aplicación.
--
-- (3) niche/zone se persisten como contexto de la búsqueda que originó (o
--     actualizó) el prospecto -- útil para reporting/filtrado por Scout,
--     nunca se usan como criterio de dedupe.
--
-- (4) rating NUMERIC(2,1) y reviews INTEGER replican exactamente los tipos
--     ya usados en el script de referencia (prospector-skill.md) -- sin
--     inventar precisión adicional.

CREATE TABLE prospects (
  prospect_id       UUID PRIMARY KEY,
  name              TEXT NOT NULL,
  phone             TEXT NULL,
  address           TEXT NULL,
  city              TEXT NULL,
  category          TEXT NULL,
  rating            NUMERIC(2, 1) NULL,
  reviews           INTEGER NULL,
  website           TEXT NULL,
  google_maps_url   TEXT NULL,
  whatsapp_url      TEXT NULL,
  source            TEXT NOT NULL DEFAULT 'apify_google_maps',
  niche             TEXT NULL,
  zone              TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_prospects_google_maps_url ON prospects (google_maps_url);
CREATE INDEX ix_prospects_phone ON prospects (phone);
CREATE INDEX ix_prospects_name_address ON prospects (name, address);
