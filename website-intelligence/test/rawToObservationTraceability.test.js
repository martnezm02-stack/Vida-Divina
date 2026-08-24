// rawToObservationTraceability.test.js — Prueba de trazabilidad Fase 8: ahora
// que existe un WebsiteRawStore real, una WebsitePatternObservation (Fase 7)
// que declara un raw_id debe poder resolverse hasta la URL original — sin
// inventar ninguna cadena, y sin modificar traceability.js (que sigue
// devolviendo "pending" para website_intelligence porque los stores de
// observación/inferencia/hipótesis de Website Intelligence AÚN no existen —
// eso queda para una fase posterior, ver informe §25).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebsiteRawStore } from '../src/acquisition/rawStore.js';
import { createWebsiteRawRecord } from '../src/acquisition/websiteRawRecord.js';
import { createWebsitePatternObservation } from '../src/websitePatternObservation.js';
import { traceReference } from '../src/traceability.js';
import { createPatternReference } from '../src/contentBrief.js';

describe('raw_id → url ya es resoluble de verdad (aunque traceReference() completo siga pendiente)', () => {
  let dir, store;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'website-intelligence-trace-'));
    store = new WebsiteRawStore(dir);
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('un raw_id declarado en una observación real resuelve a la URL real vía WebsiteRawStore', () => {
    const raw = createWebsiteRawRecord({
      url: 'https://ejemplo-ficticio.test/landing',
      acquisition_method: 'http_direct',
      fetch_status: 'ok',
      html: '<html><body>hero, beneficios, cta</body></html>',
    });
    store.save(raw);

    const observation = createWebsitePatternObservation({
      url: raw.url,
      page_id: 'ejemplo-ficticio::landing',
      dimension: 'PAGE_STRUCTURE',
      value: 'hero_beneficios_cta',
      evidence: { method: 'html_structure', detail: 'orden de secciones' },
      confidence: 0.6,
      confidence_basis: 'prueba de trazabilidad Fase 8',
      raw_id: raw.raw_id,
    });

    const resolved = store.loadByRawId(observation.raw_id);
    assert.ok(resolved, 'el raw_id de la observación debe resolver a un WebsiteRawRecord real');
    assert.equal(resolved.url, 'https://ejemplo-ficticio.test/landing');
  });

  test('traceReference() sigue devolviendo "pending" para website_intelligence — no se simula una resolución completa que la Fase 8 no construyó (falta el IntelligenceStore de observaciones)', () => {
    const ref = createPatternReference({
      source_module: 'website_intelligence',
      reference_type: 'observation',
      reference_id: 'cualquier-id',
      rationale: 'verificación de que no se infla el alcance de esta fase',
    });
    const result = traceReference(ref);
    assert.equal(result.status, 'pending');
  });
});
