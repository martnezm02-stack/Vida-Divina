-- 0002_add_conversation_source.sql
-- Fase 16, Parte 4 (Dashboard Operational Workspace) — separación
-- estructural REAL vs SIMULATED vs TEST vs FIXTURE vs UNKNOWN.
--
-- Se auditó primero si ya existía un campo o metadata suficiente
-- (state_transitions.fuente_funcion, messages.fuente_recurso): ninguno
-- distingue el ORIGEN de la conversación (siempre el mismo valor literal
-- sin importar quién llamó) — no se reutilizó nada porque no había nada
-- que reutilizar para este propósito específico.
--
-- Aditiva, no destructiva: ADD COLUMN con DEFAULT es metadata-only en
-- PostgreSQL 11+, sin reescritura de tabla. Ninguna fila existente se
-- reclasifica por inferencia (contenido/timestamp/nombre de contacto,
-- explícitamente prohibido) — todas las conversaciones ya existentes
-- quedan 'UNKNOWN' hasta que un llamador real declare su origen de forma
-- explícita al crearlas (ver crm/repositories/conversationRepository.js,
-- crm/context/disassemble.js).
ALTER TABLE conversations
  ADD COLUMN source TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (source IN ('REAL', 'SIMULATED', 'TEST', 'FIXTURE', 'UNKNOWN'));
