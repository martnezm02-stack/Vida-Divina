-- 0003_add_customer_attribution.sql
-- FASE "Attribution + Reporting + Email MCP + Alerta WhatsApp" (2026-09-04).
--
-- Extiende customers (entidad ya existente, Fase A §6) en vez de crear una
-- tabla/entidad paralela -- first_touch/last_touch son atributos DEL
-- CLIENTE (su primer y más reciente origen conocido), no de una
-- conversación/mensaje individual.
--
-- Aditiva y reversible: ADD COLUMN nullable (sin DEFAULT no-nulo, sin
-- reescritura de tabla en PostgreSQL 11+, mismo criterio real que
-- 0002_add_conversation_source.sql). Ninguna fila existente se reclasifica
-- por inferencia -- todos los customers ya existentes quedan con estas
-- columnas en NULL hasta que una atribución REAL (metadata real de Meta, o
-- una referencia explícita) los rellene. Reversible con
-- ALTER TABLE customers DROP COLUMN <col> si alguna vez hiciera falta.
--
-- Vocabulario de platform/source/medium: TEXT libre (sin CHECK), mismo
-- criterio de diseño ya documentado en la migración 0001 nota (2) para
-- estado/estado_actual -- el vocabulario real (qué plataformas/fuentes
-- existen) vive en código (hermes-kit/src/lib/vidaDivina/attribution.ts),
-- no duplicado aquí como CHECK que se desincronizaría.
--
-- first_touch_* se escriben UNA sola vez, al crear el customer (ver
-- customerRepository.createCustomer) -- nunca se sobrescriben después
-- (eso es responsabilidad de la capa de aplicación, no hay trigger ni
-- constraint que lo fuerce a nivel de schema, igual que el resto de reglas
-- de negocio de este CRM). last_touch_* se actualizan con
-- updateLastTouch() cada vez que existe una atribución real nueva.
ALTER TABLE customers
  ADD COLUMN first_touch_platform    TEXT NULL,
  ADD COLUMN first_touch_source      TEXT NULL,
  ADD COLUMN first_touch_medium      TEXT NULL,
  ADD COLUMN first_touch_campaign    TEXT NULL,
  ADD COLUMN first_touch_campaign_id TEXT NULL,
  ADD COLUMN first_touch_content     TEXT NULL,
  ADD COLUMN first_touch_content_id  TEXT NULL,
  ADD COLUMN first_touch_ad_id       TEXT NULL,
  ADD COLUMN first_touch_creative_id TEXT NULL,
  ADD COLUMN first_touch_at          TIMESTAMPTZ NULL,
  ADD COLUMN last_touch_platform     TEXT NULL,
  ADD COLUMN last_touch_source       TEXT NULL,
  ADD COLUMN last_touch_medium       TEXT NULL,
  ADD COLUMN last_touch_campaign     TEXT NULL,
  ADD COLUMN last_touch_campaign_id  TEXT NULL,
  ADD COLUMN last_touch_content      TEXT NULL,
  ADD COLUMN last_touch_content_id   TEXT NULL,
  ADD COLUMN last_touch_ad_id        TEXT NULL,
  ADD COLUMN last_touch_creative_id  TEXT NULL,
  ADD COLUMN last_touch_at           TIMESTAMPTZ NULL;

CREATE INDEX ix_customers_first_touch_platform ON customers (first_touch_platform);
CREATE INDEX ix_customers_last_touch_platform ON customers (last_touch_platform);
CREATE INDEX ix_customers_first_touch_campaign_id ON customers (first_touch_campaign_id);
