import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectHooksAndAngles } from '../src/agent/heuristics/hooksAndAngles.js';
import { detectPersuasionSignals } from '../src/agent/heuristics/persuasionSignals.js';
import { detectAudience } from '../src/agent/heuristics/audience.js';
import { detectFormat } from '../src/agent/heuristics/format.js';
import { detectClaims } from '../src/agent/heuristics/claims.js';
import { isValidDimension } from '../src/taxonomy.js';

describe('detectHooksAndAngles', () => {
  test('detecta HOOK de pregunta con evidence_quote literal', () => {
    const results = detectHooksAndAngles('¿Sabías que el 90% falla en su primer intento?', {});
    const hook = results.find((r) => r.dimension === 'HOOK' && r.value === 'pregunta');
    assert.ok(hook);
    assert.ok(isValidDimension(hook.dimension));
    assert.match(hook.evidence_quote, /\?/);
  });

  test('detecta ANGLE de comparación', () => {
    const results = detectHooksAndAngles('Nuestro producto vs la competencia: la diferencia es notable.', {});
    assert.ok(results.some((r) => r.dimension === 'ANGLE' && r.value === 'comparación'));
  });

  test('no inventa un hook si no hay evidencia', () => {
    const results = detectHooksAndAngles('Texto neutro sin preguntas ni estadísticas ni comparaciones.', {});
    assert.equal(results.filter((r) => r.dimension === 'HOOK').length, 0);
  });
});

describe('detectPersuasionSignals', () => {
  test('detecta CTA, URGENCY y OFFER simultáneamente cuando coexisten', () => {
    const results = detectPersuasionSignals('Compra ahora, oferta válida solo hoy con 20% de descuento.');
    assert.ok(results.some((r) => r.dimension === 'CTA'));
    assert.ok(results.some((r) => r.dimension === 'URGENCY'));
    assert.ok(results.some((r) => r.dimension === 'OFFER'));
  });

  test('detecta AUTHORITY por credencial citada', () => {
    const results = detectPersuasionSignals('Según estudios demuestran, este enfoque es efectivo.');
    assert.ok(results.some((r) => r.dimension === 'AUTHORITY'));
  });

  test('detecta EMOTIONAL_TRIGGER de pertenencia', () => {
    const results = detectPersuasionSignals('Únete a nuestra comunidad de emprendedores.');
    assert.ok(results.some((r) => r.dimension === 'EMOTIONAL_TRIGGER' && r.value === 'pertenencia'));
  });

  test('toda detección incluye confidence en [0,1] y confidence_basis no vacío', () => {
    const results = detectPersuasionSignals('Compra ahora. Garantizado. Miles de personas ya lo probaron.');
    for (const r of results) {
      assert.ok(r.confidence >= 0 && r.confidence <= 1);
      assert.ok(r.confidence_basis && r.confidence_basis.length > 0);
    }
  });
});

describe('detectAudience', () => {
  test('detecta AUDIENCE_OBSERVED cuando el texto la menciona explícitamente', () => {
    const results = detectAudience('Esta guía es para emprendedores que recién comienzan.');
    assert.equal(results.length, 1);
    assert.equal(results[0].audience_basis, 'AUDIENCE_OBSERVED');
  });

  test('no produce AUDIENCE_INFERRED (limitación deliberada de esta fase, sin LLM real)', () => {
    const results = detectAudience('Contenido sin ninguna mención directa de audiencia.');
    assert.equal(results.length, 0);
  });
});

describe('detectFormat', () => {
  test('deriva FORMAT de metadata estructurada, no del texto', () => {
    const results = detectFormat('cualquier texto', { platform_object_type: 'repo' });
    assert.equal(results[0].dimension, 'FORMAT');
    assert.equal(results[0].value, 'repo');
    assert.ok(results[0].confidence >= 0.9);
  });

  test('devuelve vacío si no hay platform_object_type', () => {
    assert.deepEqual(detectFormat('texto', {}), []);
  });
});

describe('detectClaims — nunca verifica, solo observa', () => {
  test('detecta un claim de salud típico en español', () => {
    const claims = detectClaims('Este té elimina la grasa abdominal en solo 7 días.');
    assert.ok(claims.length > 0);
    assert.equal(claims[0].claim_type, 'health_benefit_claim');
    assert.match(claims[0].claim_text.toLowerCase(), /elimina/);
  });

  test('detecta un claim de rendimiento con porcentaje', () => {
    const claims = detectClaims('Aumenta tu energía en 50% desde la primera semana.');
    assert.ok(claims.some((c) => c.claim_type === 'performance_claim'));
  });

  test('no detecta claims en texto sin afirmaciones de beneficio', () => {
    assert.deepEqual(detectClaims('Este es un repositorio de código para automatización de marketing.'), []);
  });
});
