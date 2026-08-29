// claimRelevance.test.js — Corrección "Hook Intelligence + Claim
// Relevance + Auto-QA" (2026-08-28). Cobertura real de la clasificación
// determinista de claims por relevancia al primaryAngle real -- nunca
// inventa un claim, nunca toca Claim Safety.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectRelevantClaims, classifyClaimsForField } from '../src/claimRelevance.js';

const FACTS_REAL = Object.freeze({
  nombreComercial: 'Café Divina Tongkat Ali', nombreVisible: 'Café Tongkat Ali',
  problema: 'Libido baja o irregular.',
  beneficios: 'Líbido saludable; agudeza mental; fuerza muscular; antioxidante.',
  ingredientes: 'Reishi, Tongkat Ali, café arábico, 2 g de fibra.',
});

describe('classifyClaimsForField', () => {
  test('divide un campo real en claims reales individuales (separados por ";")', () => {
    const r = classifyClaimsForField({ fieldText: FACTS_REAL.beneficios, angleId: null });
    assert.equal(r.core.length, 4);
  });

  test('sin angleId real (compatibilidad hacia atrás): nunca filtra, preserva el campo real completo', () => {
    const r = classifyClaimsForField({ fieldText: FACTS_REAL.beneficios, angleId: null });
    assert.equal(r.filteredText, FACTS_REAL.beneficios);
    assert.equal(r.supporting.length, 0);
    assert.equal(r.irrelevant.length, 0);
  });

  test('CORE/SUPPORTING/IRRELEVANT real: respeta maxCoreClaims/maxSupportingClaims reales', () => {
    const r = classifyClaimsForField({ fieldText: FACTS_REAL.beneficios, angleId: 'mechanism', maxCoreClaims: 2, maxSupportingClaims: 1 });
    assert.ok(r.core.length <= 2);
    assert.ok(r.supporting.length <= 1);
    assert.equal(r.core.length + r.supporting.length + r.irrelevant.length, 4);
  });

  test('sin ninguna señal real de angle en el campo -> preserva el primer claim real (nunca deja el campo vacío, Paso 29)', () => {
    const r = classifyClaimsForField({ fieldText: 'Sabor intenso; aroma natural.', angleId: 'mechanism' });
    assert.ok(r.core.length >= 1);
  });
});

describe('selectRelevantClaims', () => {
  test('filteredFacts real: beneficios/ingredientes recortados, problema/nombreComercial intactos', () => {
    const { filteredFacts } = selectRelevantClaims({ facts: FACTS_REAL, angleId: 'mechanism' });
    assert.equal(filteredFacts.problema, FACTS_REAL.problema);
    assert.equal(filteredFacts.nombreComercial, FACTS_REAL.nombreComercial);
    assert.notEqual(filteredFacts.beneficios, FACTS_REAL.beneficios, 'beneficios real debe quedar recortado real para el ángulo "mechanism"');
  });

  test('maxCoreClaims=2/maxSupportingClaims=1 reales por defecto (Paso 12 del encargo)', () => {
    const { core, supporting } = selectRelevantClaims({ facts: FACTS_REAL, angleId: 'aspiration' });
    assert.ok(core.length <= 4); // 2 por campo (beneficios+ingredientes), nunca más
    assert.ok(supporting.length <= 2);
  });

  test('rechaza sin facts real', () => {
    assert.throws(() => selectRelevantClaims({ facts: null, angleId: 'routine' }), /facts/);
  });

  test('nunca modifica ni inventa el texto real de un claim -- solo selecciona/omite (Paso 13: Claim Safety intacto)', () => {
    const { core, supporting } = selectRelevantClaims({ facts: FACTS_REAL, angleId: 'mechanism' });
    const original = new Set([...FACTS_REAL.beneficios.split(';'), ...FACTS_REAL.ingredientes.split(',')].map((s) => s.trim().replace(/\.+$/, '')));
    for (const c of [...core, ...supporting]) {
      assert.ok([...original].some((o) => o === c || o.includes(c) || c.includes(o)), `claim real "${c}" debe provenir literalmente del texto real original`);
    }
  });
});

describe('Claim Diversity — Corrección "Refinamiento creativo" (Paso 12/26/37 del encargo)', () => {
  test('ANGLE -> CLAIMS: un claim real con señal real de keyword para un ángulo real se prioriza sobre uno sin señal -- distinto de "routine" (rutina/día a día) a "mechanism" (ingredientes/fórmula)', () => {
    const facts = Object.freeze({ ...FACTS_REAL, beneficios: 'Apoyo a la rutina diaria; fórmula con ingredientes activos; antioxidante.' });
    const rutina = selectRelevantClaims({ facts, angleId: 'routine' });
    const mecanismo = selectRelevantClaims({ facts, angleId: 'mechanism' });
    assert.notEqual(rutina.filteredFacts.beneficios, mecanismo.filteredFacts.beneficios, 'ángulos reales con señal real distinta filtran real beneficios distinto');
  });

  test('secondaryAngleId real amplía el pool real de claims relevantes (score real combinado, nunca reemplaza al ángulo primario)', () => {
    const soloPrimario = classifyClaimsForField({ fieldText: FACTS_REAL.beneficios, angleId: 'mechanism' });
    const conSecundario = classifyClaimsForField({ fieldText: FACTS_REAL.beneficios, angleId: 'mechanism', secondaryAngleId: 'aspiration' });
    // El core real con secondaryAngle nunca queda vacío ni cambia el
    // criterio real de máximo -- solo puede reordenar/incluir claims reales
    // que también conectan con el ángulo secundario real.
    assert.ok(conSecundario.core.length > 0 && conSecundario.core.length === soloPrimario.core.length);
  });

  test('NO REPEATED CLAIMS UNNECESSARILY: con previousClaims reales del CORE ya usado, una segunda selección real para el MISMO ángulo prefiere claims reales aún no usados cuando hay opciones reales suficientes', () => {
    const primera = selectRelevantClaims({ facts: FACTS_REAL, angleId: 'mechanism' });
    const segunda = selectRelevantClaims({ facts: FACTS_REAL, angleId: 'mechanism', previousClaims: primera.core });
    // La relevancia real sigue dominando (Paso 27) -- pero cuando existen
    // claims reales alternativos con la MISMA señal real, la segunda
    // selección real no debe ser IDÉNTICA a la primera si hay al menos un
    // claim real alternativo disponible con score real empatado.
    const totalClaimsReales = FACTS_REAL.beneficios.split(';').length + FACTS_REAL.ingredientes.split(',').length;
    if (totalClaimsReales > primera.core.length) {
      assert.notDeepEqual(segunda.core, primera.core, 'con alternativas reales disponibles, la segunda selección real de claims varía real respecto a la primera');
    }
  });
});
