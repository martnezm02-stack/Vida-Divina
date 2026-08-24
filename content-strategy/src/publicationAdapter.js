// publicationAdapter.js — Fase 17, §3-4. Mismo patrón arquitectónico que
// AcquisitionBackend (marketing-intelligence, Fase 4) y PerformanceSource
// (performance-learning-intelligence, Fase 12): una interfaz abstracta +
// un motor intercambiable. PublicationAdapter NUNCA sabe de Instagram/
// TikTok/YouTube — solo conoce publish(contentItem, context) → resultado
// normalizado. Conectar una red real sería un futuro adapter detrás de
// esta misma interfaz, nunca implementado aquí.
//
// Fase 19 — EXTENSIÓN MÍNIMA NECESARIA (documentada, no una reescritura):
// hasta Fase 17 solo existía el camino de simulación (status SIMULATED,
// mode "simulation"). Un adapter real (InstagramPublicationAdapter) necesita
// poder expresar 4 resultados que no tenían representación: publicación real
// exitosa, rechazo estructural (sin llegar a la red), y los dos bloqueos
// explícitos que el encargo de Fase 19 exige nunca evadir — falta de
// configuración local (CONFIGURATION_REQUIRED) y falta de autorización de
// Meta (AUTHORIZATION_REQUIRED). "FAILED" ya existía en el enum desde la
// Fase 17 sin ningún emisor real — queda con su primer uso real aquí (un
// intento real que falla a nivel de red/API).
//
// Regla de emparejamiento status↔mode (nueva, para no romper el test de
// Fase 17 que espera que SIMULATED+mode:"real" siga siendo inválido):
// SIMULATED es el ÚNICO status que exige mode "simulation"; cualquier otro
// status exige mode "real". Esto preserva exactamente el comportamiento
// anterior (SIMULATED nunca pudo combinarse con "real") mientras habilita
// los nuevos status reales.

import { randomUUID } from 'node:crypto';

export class PublicationAdapter {
  get name() {
    throw new Error('PublicationAdapter: la propiedad "name" debe implementarse en la subclase');
  }

  // eslint-disable-next-line no-unused-vars
  async publish(contentItem, context) {
    throw new Error('PublicationAdapter.publish() debe implementarse en la subclase');
  }
}

const PUBLICATION_STATUSES = Object.freeze([
  'SIMULATED', 'FAILED', 'PUBLISHED', 'REJECTED', 'AUTHORIZATION_REQUIRED', 'CONFIGURATION_REQUIRED',
]);
const PUBLICATION_MODES = Object.freeze(['simulation', 'real']);

/** Contrato #1 (de los ≤3 permitidos): la forma exacta que §4 pide (Fase 17) + extensión mínima de Fase 19 (§4). */
export function createPublicationResult({ platform, external_content_id, status, publication_mode = 'simulation', detail = null }) {
  if (!platform) throw new Error('PublicationResult: "platform" es obligatorio.');
  if (!external_content_id) throw new Error('PublicationResult: "external_content_id" es obligatorio.');
  if (!PUBLICATION_STATUSES.includes(status)) throw new Error(`PublicationResult: status inválido "${status}" (válidos: ${PUBLICATION_STATUSES.join(', ')})`);
  if (!PUBLICATION_MODES.includes(publication_mode)) throw new Error(`PublicationResult: publication_mode inválido "${publication_mode}" (válidos: ${PUBLICATION_MODES.join(', ')})`);
  if (status === 'SIMULATED' && publication_mode !== 'simulation') {
    throw new Error('PublicationResult: status "SIMULATED" solo puede combinarse con publication_mode "simulation".');
  }
  if (status !== 'SIMULATED' && publication_mode !== 'real') {
    throw new Error(`PublicationResult: status "${status}" solo puede combinarse con publication_mode "real".`);
  }

  return Object.freeze({
    publication_id: randomUUID(),
    platform,
    external_content_id,
    published_at: new Date().toISOString(),
    status,
    publication_mode,
    detail,
  });
}

/**
 * Contrato #2: el único backend real de esta fase. NUNCA hace HTTP, OAuth,
 * cookies ni sube nada — construye un id determinista de simulación y
 * devuelve un PublicationResult. Verificable estructuralmente (ver test
 * "no debe hacer ninguna llamada HTTP externa", §12-J): este archivo no
 * importa `fetch`, `http`, `https` ni ningún cliente de red.
 */
export class MockPublicationBackend extends PublicationAdapter {
  get name() {
    return 'mock_publication_backend';
  }

  async publish(contentItem) {
    const external_content_id = `mock_${contentItem.content_item_id.slice(0, 8)}_${contentItem.content_version.slice(0, 8)}`;
    return createPublicationResult({ platform: contentItem.platform, external_content_id, status: 'SIMULATED', publication_mode: 'simulation' });
  }
}
