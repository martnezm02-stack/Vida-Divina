// evidenceProvenance.test.js — cobertura directa de createProvenance()
// (no existía antes de Fase 4C, solo se probaba indirectamente vía
// competitiveEvidencePreliminary.test.js). Cubre especialmente la
// generalización de Fase 4C: evidenceDomain como parámetro real (antes,
// literal fijo 'COMPETITIVE'), retrocompatibilidad total para los
// llamadores COMPETITIVE existentes, y el nuevo camino CUSTOMER_RESEARCH.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProvenance, assertProvenancePreserved } from '../src/evidenceProvenance.js';
import { EVIDENCE_DOMAINS } from '../src/evidenceTaxonomy.js';

function baseArgs(overrides = {}) {
  return {
    source: 'WhatsApp postventa', sourceUrl: null, sourceCurrentlyUnavailable: true,
    sourcePlatform: 'WHATSAPP', sourceType: 'CUSTOMER_TESTIMONIAL', observedAt: '2026-08-20',
    originalEvidenceId: 'CE-01',
    ...overrides,
  };
}

describe('createProvenance — retrocompatibilidad COMPETITIVE (default, sin cambios de comportamiento)', () => {
  test('sin evidenceDomain explícito, sigue siendo COMPETITIVE por default', () => {
    const p = createProvenance({
      source: 'Facebook (página pública)', sourceUrl: 'https://facebook.com/x', sourcePlatform: 'FACEBOOK',
      sourceType: 'AD', observedAt: '2026-08-01', competitor: 'Fuxion', originalEvidenceId: 'AR-06',
    });
    assert.equal(p.evidenceDomain, 'COMPETITIVE');
    assert.equal(p.competitor, 'Fuxion');
  });

  test('sin "competitor", sigue rechazándose cuando evidenceDomain es COMPETITIVE (explícito o por default)', () => {
    assert.throws(
      () => createProvenance({ source: 'x', sourceUrl: 'y', sourcePlatform: 'z', sourceType: 'w', observedAt: '2026-08-01', originalEvidenceId: 'AR-99' }),
      /"competitor" es obligatorio/,
    );
  });
});

describe('createProvenance — Fase 4C: evidenceDomain=CUSTOMER_RESEARCH', () => {
  test('acepta CUSTOMER_RESEARCH sin "competitor" (no aplica a evidencia de cliente real)', () => {
    const p = createProvenance(baseArgs({ evidenceDomain: 'CUSTOMER_RESEARCH' }));
    assert.equal(p.evidenceDomain, 'CUSTOMER_RESEARCH');
    assert.equal(p.competitor, null);
  });

  test('sourceUrl puede ser null si se marca sourceCurrentlyUnavailable -- una llamada de venta real no tiene URL', () => {
    const p = createProvenance(baseArgs({ evidenceDomain: 'CUSTOMER_RESEARCH', sourceUrl: null, sourceCurrentlyUnavailable: true }));
    assert.equal(p.sourceUrl, null);
  });

  test('sigue exigiendo sourcePlatform/sourceType/observedAt/originalEvidenceId reales, igual que COMPETITIVE', () => {
    assert.throws(() => createProvenance(baseArgs({ evidenceDomain: 'CUSTOMER_RESEARCH', sourcePlatform: '' })), /sourcePlatform/);
    assert.throws(() => createProvenance(baseArgs({ evidenceDomain: 'CUSTOMER_RESEARCH', sourceType: '' })), /sourceType/);
    assert.throws(() => createProvenance(baseArgs({ evidenceDomain: 'CUSTOMER_RESEARCH', observedAt: '' })), /observedAt/);
    assert.throws(() => createProvenance(baseArgs({ evidenceDomain: 'CUSTOMER_RESEARCH', originalEvidenceId: '' })), /originalEvidenceId/);
  });

  test('un evidenceDomain que no está en EVIDENCE_DOMAINS se rechaza -- nunca inventa un vocabulario nuevo', () => {
    assert.throws(() => createProvenance(baseArgs({ evidenceDomain: 'CUSTOMER_EVIDENCE' })), /evidenceDomain.*inválido/);
    // CUSTOMER_EVIDENCE es el dominio de CycleInput.evidenceBatch (Fase 4A), un vocabulario DISTINTO y deliberadamente separado del de Provenance (EVIDENCE_DOMAINS) -- nunca se mezclan.
    assert.ok(!EVIDENCE_DOMAINS.includes('CUSTOMER_EVIDENCE'));
    assert.ok(EVIDENCE_DOMAINS.includes('CUSTOMER_RESEARCH'));
  });

  test('assertProvenancePreserved sigue funcionando igual para un Provenance CUSTOMER_RESEARCH', () => {
    const p = createProvenance(baseArgs({ evidenceDomain: 'CUSTOMER_RESEARCH' }));
    assert.ok(assertProvenancePreserved(p, { ...p }));
  });
});
