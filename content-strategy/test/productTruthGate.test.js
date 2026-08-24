// productTruthGate.test.js — Fase 15, §9/§13/§17. Ejecuta ProductTruthGate
// sobre los 5 ContentDraft REALES ya producidos en la Fase 14 (no se generan
// piezas nuevas) y verifica el caso "problemático" documentado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProductTruthGate } from '../src/productTruthGate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHASE14_EXPORT = join(__dirname, '..', 'exports', 'phase14');

describe('runProductTruthGate — auditoría real de los 5 drafts de la Fase 14', () => {
  const drafts = JSON.parse(readFileSync(join(PHASE14_EXPORT, 'content_drafts.json'), 'utf8'));

  test('existen exactamente los 5 drafts reales esperados', () => {
    assert.equal(drafts.length, 5);
  });

  test('cada uno de los 5 drafts obtiene un status (PASS/REVIEW_REQUIRED/BLOCKED) y clasificaciones por afirmación', () => {
    for (const draft of drafts) {
      const result = runProductTruthGate({ item: null, draft });
      assert.ok(['PASS', 'REVIEW_REQUIRED', 'BLOCKED'].includes(result.status));
      assert.ok(result.classifications.length > 0, 'cada draft debe tener al menos una afirmación clasificada');
    }
  });

  test('ninguno de los 5 queda BLOCKED (no inventan ingredientes/testimonios/estadísticas — solo mencionan malva/mirra/cardo bendito, reales)', () => {
    for (const draft of drafts) {
      const result = runProductTruthGate({ item: null, draft });
      assert.notEqual(result.status, 'BLOCKED', `draft ${draft.draft_id} no debería estar BLOCKED: ${result.reasons.join('; ')}`);
    }
  });

  test('los 5 quedan en REVIEW_REQUIRED — todos mencionan "desintoxicación"/"pérdida de peso", lenguaje fisiológico que nunca se auto-aprueba', () => {
    for (const draft of drafts) {
      const result = runProductTruthGate({ item: null, draft });
      assert.equal(result.status, 'REVIEW_REQUIRED', `draft ${draft.draft_id} debería requerir revisión por lenguaje de salud`);
    }
  });

  test('CASO PROBLEMÁTICO (§13): el draft con hookVariant EDUCATIONAL/mecanismo ("cómo actúa cada ingrediente") queda correctamente detenido en REVIEW_REQUIRED, nunca aprobado automáticamente', () => {
    const problematic = drafts.find((d) => d.hook.includes('cómo actúa cada ingrediente'));
    assert.ok(problematic, 'debe existir el draft con la frase de mecanismo de la Fase 14');
    const result = runProductTruthGate({ item: null, draft: problematic });
    assert.equal(result.status, 'REVIEW_REQUIRED');
    assert.ok(result.reasons.some((r) => r.includes('HEALTH_CLAIM_REQUIRES_REVIEW')));
    const hookClassification = result.classifications.find((c) => c.field === 'hook');
    assert.equal(hookClassification.category, 'HEALTH_CLAIM_REQUIRES_REVIEW');
  });

  test('las menciones a "malva, mirra, cardo bendito" se clasifican como SUPPORTED_PRODUCT_FACT (ingredientes reales del catálogo)', () => {
    const draft = drafts[0];
    const result = runProductTruthGate({ item: null, draft });
    const desarrollo = result.classifications.find((c) => c.field === 'scene_structure.desarrollo');
    assert.ok(desarrollo);
    assert.equal(desarrollo.category, 'SUPPORTED_PRODUCT_FACT');
  });

  test('trazabilidad: los ProductFact usados quedan listados por fact_id, nunca se copia el documento completo', () => {
    const result = runProductTruthGate({ item: null, draft: drafts[0] });
    assert.ok(result.supported_facts_used.length > 0);
    for (const factId of result.supported_facts_used) assert.equal(typeof factId, 'string');
  });
});

describe('runProductTruthGate — casos sintéticos de BLOCKED (para probar el veredicto extremo sin esperar a que ocurra naturalmente)', () => {
  test('un testimonio inventado bloquea la pieza', () => {
    const draft = { hook: 'Nuestros clientes confirman resultados increíbles', body: 'x', scene_structure: [] };
    const result = runProductTruthGate({ item: null, draft });
    assert.equal(result.status, 'BLOCKED');
  });

  test('una estadística sin fuente bloquea la pieza', () => {
    const draft = { hook: 'El 95% de las personas lo notan', body: 'x', scene_structure: [] };
    const result = runProductTruthGate({ item: null, draft });
    assert.equal(result.status, 'BLOCKED');
  });

  test('un ingrediente no presente en el catálogo bloquea la pieza', () => {
    const draft = { hook: 'x', body: 'Ingredientes: ginseng siberiano y guaraná amazónico', scene_structure: [] };
    const result = runProductTruthGate({ item: null, draft });
    assert.equal(result.status, 'BLOCKED');
  });
});
