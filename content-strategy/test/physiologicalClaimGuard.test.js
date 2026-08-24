import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectPhysiologicalClaim } from '../src/physiologicalClaimGuard.js';

describe('detectPhysiologicalClaim — analiza el CONTEXTO de la frase, no una palabra aislada (§5)', () => {
  test('detecta las frases exactas de prueba pedidas en §6', () => {
    assert.equal(detectPhysiologicalClaim('cómo actúa cada ingrediente').matched, true);
    assert.equal(detectPhysiologicalClaim('desintoxicación').matched, true);
    assert.equal(detectPhysiologicalClaim('ayuda a perder peso').matched, true);
    assert.equal(detectPhysiologicalClaim('elimina toxinas').matched, true);
    assert.equal(detectPhysiologicalClaim('acelera el metabolismo').matched, true);
  });

  test('"cuando el cuerpo todavía no está listo" y "prepararse antes de empezar" NO disparan el guard (no son afirmaciones fisiológicas específicas)', () => {
    assert.equal(detectPhysiologicalClaim('cuando el cuerpo todavía no está listo').matched, false);
    assert.equal(detectPhysiologicalClaim('prepararse antes de empezar').matched, false);
  });

  test('distingue "acelera el metabolismo" (afirmación) de "no está demostrado que acelere el metabolismo" (negación)', () => {
    const claim = detectPhysiologicalClaim('acelera el metabolismo');
    assert.equal(claim.matched, true);
    assert.equal(claim.negated, false);

    const negated = detectPhysiologicalClaim('no está demostrado que acelere el metabolismo');
    assert.equal(negated.matched, true);
    assert.equal(negated.negated, true);
  });

  test('ante una negación no reconocida por las frases de referencia, el detector NO confirma seguridad (negated=false, empuja a revisión)', () => {
    const result = detectPhysiologicalClaim('quizás no acelere el metabolismo, quién sabe'); // negación informal, no está en NEGATION_CUES
    assert.equal(result.matched, true);
    assert.equal(result.negated, false, 'ante duda, el detector no debe asumir que está a salvo');
  });

  test('texto sin ningún término fisiológico no dispara el guard', () => {
    assert.equal(detectPhysiologicalClaim('conoce los ingredientes en el catálogo oficial').matched, false);
  });
});
