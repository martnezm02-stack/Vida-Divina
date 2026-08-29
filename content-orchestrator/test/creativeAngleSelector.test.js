// creativeAngleSelector.test.js — Corrección "Evolución integral del
// Creative Director" (2026-08-28). Cobertura real del selector
// determinista de ángulo/hook -- nunca genera copy nuevo, solo puntúa
// candidatos YA generados (variantsDetail reales).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectCreativeAngle } from '../src/creativeAngleSelector.js';

function candidate({ angleId, hookId, format = 'Native TikTok-style' }) {
  return { angleId, hookId, creativeVariant: { format } };
}

describe('selectCreativeAngle', () => {
  test('ANGLE: instrucción real con señales de "rutina" elige el candidato real con angleId "routine"', () => {
    const candidates = [
      candidate({ angleId: 'mechanism', hookId: 'curiosity' }),
      candidate({ angleId: 'routine', hookId: 'story' }),
      candidate({ angleId: 'comparison', hookId: 'contrarian' }),
    ];
    const result = selectCreativeAngle({
      userInstruction: 'Quiero mostrar a un hombre en una mañana normal, antes del trabajo, como una historia de estilo de vida real.',
      candidates,
    });
    assert.equal(result.selectedIndex, 1);
    assert.equal(result.primaryAngle.id, 'routine');
    assert.equal(result.hookType.id, 'story');
  });

  test('ANGLE: instrucción real de "explicar ingredientes" prioriza mechanism sobre routine', () => {
    const candidates = [
      candidate({ angleId: 'routine', hookId: 'story' }),
      candidate({ angleId: 'mechanism', hookId: 'curiosity' }),
    ];
    const result = selectCreativeAngle({
      userInstruction: 'Quiero explicar los ingredientes reales y cómo funciona la fórmula.',
      candidates,
    });
    assert.equal(result.primaryAngle.id, 'mechanism');
  });

  test('PRIMARY/SECONDARY: instrucción real con dos señales distintas expone secondaryAngle real (nunca fuerza mezclar variantes)', () => {
    const candidates = [
      candidate({ angleId: 'routine', hookId: 'story' }),
      candidate({ angleId: 'aspiration', hookId: 'pov' }),
    ];
    const result = selectCreativeAngle({
      userInstruction: 'Una rutina matutina real que se sienta aspiracional, una mejor versión del día.',
      candidates,
    });
    assert.ok(result.primaryAngle);
    assert.ok(result.secondaryAngle);
    assert.notEqual(result.primaryAngle.id, result.secondaryAngle.id);
  });

  test('HOOK: hookRelevanceScore real > 0 cuando hay coincidencia real, nunca inventado', () => {
    const candidates = [candidate({ angleId: 'routine', hookId: 'story' })];
    const result = selectCreativeAngle({ userInstruction: 'Una historia real de rutina matutina.', candidates });
    assert.ok(result.hookRelevanceScore > 0);
  });

  test('BACKWARD COMPATIBILITY: sin userInstruction real, elige el PRIMER candidato real (mismo criterio preexistente, Paso 31)', () => {
    const candidates = [
      candidate({ angleId: 'discovery', hookId: 'visual' }),
      candidate({ angleId: 'routine', hookId: 'story' }),
    ];
    const result = selectCreativeAngle({ userInstruction: null, candidates });
    assert.equal(result.selectedIndex, 0);
    assert.equal(result.hookRelevanceScore, 0);
  });

  test('rechaza sin candidatos reales', () => {
    assert.throws(() => selectCreativeAngle({ userInstruction: 'x', candidates: [] }), /candidates.*real/);
  });

  test('sin coincidencia real de ningún candidato -> conserva el primero real (nunca lanza, nunca inventa un ángulo)', () => {
    const candidates = [candidate({ angleId: 'discovery', hookId: 'visual' }), candidate({ angleId: 'comparison', hookId: 'contrarian' })];
    const result = selectCreativeAngle({ userInstruction: 'Texto sin ninguna señal reconocible real.', candidates });
    assert.equal(result.selectedIndex, 0);
  });
});
