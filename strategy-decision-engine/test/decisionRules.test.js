import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  riskFor, expectedImpactFor, scopeTypeFor, detectContradictions, isDominatedByStrongerContradiction,
  hasRealCommercialEvidence, isConsistent, CONSISTENCY_SAMPLE_SIZE,
} from '../src/decisionRules.js';
import { makeLearning } from './helpers/fixtures.js';

describe('riskFor — Fase 12', () => {
  test('mapeo determinístico por learningType, con los ejemplos exactos del encargo', () => {
    assert.equal(riskFor('FORMAT_LEARNING'), 'LOW'); // "ajuste limitado de formato"
    assert.equal(riskFor('PLATFORM_LEARNING'), 'MEDIUM'); // "cambio de distribución entre plataformas"
    assert.equal(riskFor('PRODUCT_LEARNING'), 'HIGH'); // "cambio de estrategia de producto"
    assert.equal(riskFor('COMMERCIAL_LEARNING'), 'HIGH'); // "cambio de estrategia... comercial"
    assert.equal(riskFor('TIPO_DESCONOCIDO'), 'UNKNOWN');
  });
});

describe('expectedImpactFor — Fase 11 (nunca inventa un porcentaje)', () => {
  test('sin delta cuantificado, nunca sube a HIGH aunque confidence sea HIGH', () => {
    assert.equal(expectedImpactFor({ confidence: 'HIGH', deltaAbs: null }), 'MEDIUM');
    assert.equal(expectedImpactFor({ confidence: 'MEDIUM', deltaAbs: null }), 'LOW');
  });
  test('HIGH solo con delta >= 0.25 (umbral ya usado en confidence.js) y confidence HIGH', () => {
    assert.equal(expectedImpactFor({ confidence: 'HIGH', deltaAbs: 0.30 }), 'HIGH');
    assert.equal(expectedImpactFor({ confidence: 'MEDIUM', deltaAbs: 0.30 }), 'MEDIUM'); // confidence no es HIGH -- nunca HIGH sin ambas condiciones
  });
  test('MEDIUM con delta >= 0.10 (umbral ya usado en performanceSignal.js)', () => {
    assert.equal(expectedImpactFor({ confidence: 'LOW', deltaAbs: 0.15 }), 'MEDIUM');
  });
  test('UNKNOWN confidence -> siempre UNKNOWN', () => {
    assert.equal(expectedImpactFor({ confidence: 'UNKNOWN', deltaAbs: 0.9 }), 'UNKNOWN');
  });
});

describe('scopeTypeFor — Fase 13', () => {
  test('product > format > platform > GLOBAL', () => {
    assert.equal(scopeTypeFor(makeLearning({ product: 'TéDivina' })), 'PRODUCT');
    assert.equal(scopeTypeFor(makeLearning({ product: null, format: 'video' })), 'FORMAT');
    assert.equal(scopeTypeFor(makeLearning({ product: null, format: null, platform: 'instagram' })), 'PLATFORM');
    assert.equal(scopeTypeFor(makeLearning({ product: null, format: null, platform: null })), 'GLOBAL');
    assert.equal(scopeTypeFor(makeLearning({ product: null, format: null, platform: 'all' })), 'GLOBAL'); // "all" no es una sola plataforma
  });
});

describe('isConsistent — Fase 8', () => {
  test('STRATEGY_LEARNING es consistente por construcción (ya transversal)', () => {
    assert.equal(isConsistent(makeLearning({ learningType: 'STRATEGY_LEARNING', evidenceCount: 2 })), true);
  });
  test('resto: consistente solo con evidenceCount >= 2×MIN_BASELINE_SAMPLE_SIZE, mismo umbral que confidence.js', () => {
    assert.equal(isConsistent(makeLearning({ evidenceCount: CONSISTENCY_SAMPLE_SIZE - 1 })), false);
    assert.equal(isConsistent(makeLearning({ evidenceCount: CONSISTENCY_SAMPLE_SIZE })), true);
  });
  test('no exige múltiples plataformas cuando el scope ya es de una sola plataforma explícita', () => {
    const singlePlatform = makeLearning({ evidenceCount: CONSISTENCY_SAMPLE_SIZE, platform: 'instagram' });
    assert.equal(isConsistent(singlePlatform), true);
  });
});

describe('detectContradictions — Fase 9', () => {
  test('ejemplo del encargo: "priorizar video" (IMPROVE) vs "video con freno comercial" (INVESTIGATE) sobre el mismo formato -> contradicción real', () => {
    const a = makeLearning({ learningType: 'FORMAT_LEARNING', format: 'video', platform: 'instagram', evidence: { delta: 0.3, expectedDirection: 'IMPROVE' } });
    const b = makeLearning({ learningType: 'OPPORTUNITY_LEARNING', format: 'video', platform: 'instagram', evidence: { expectedDirection: 'INVESTIGATE' }, relatedContentIds: ['c9'] });
    const contradictions = detectContradictions(a, [a, b]);
    assert.equal(contradictions.length, 1);
    assert.equal(contradictions[0].learningId, b.id);
  });

  test('sin dimensión compartida (platform/format/product distintos) -- nunca fabrica una contradicción', () => {
    const a = makeLearning({ format: 'video', platform: 'instagram', evidence: { expectedDirection: 'IMPROVE' } });
    const b = makeLearning({ format: 'image', platform: 'facebook', evidence: { expectedDirection: 'REDUCE' } });
    assert.equal(detectContradictions(a, [a, b]).length, 0);
  });

  test('CONTENT_LEARNING/ENGAGEMENT_LEARNING (una sola publicación) nunca participan de contradicciones -- evitan ruido falso', () => {
    const a = makeLearning({ learningType: 'CONTENT_LEARNING', platform: 'instagram', format: null, evidence: { expectedDirection: 'IMPROVE' } });
    const b = makeLearning({ learningType: 'CONTENT_LEARNING', platform: 'instagram', format: null, evidence: { expectedDirection: 'INVESTIGATE' }, relatedContentIds: ['other'] });
    assert.equal(detectContradictions(a, [a, b]).length, 0);
  });

  test('mismas direcciones -- nunca es una contradicción', () => {
    const a = makeLearning({ format: 'video', evidence: { expectedDirection: 'IMPROVE' } });
    const b = makeLearning({ format: 'video', evidence: { expectedDirection: 'IMPROVE' }, relatedContentIds: ['c9'] });
    assert.equal(detectContradictions(a, [a, b]).length, 0);
  });
});

describe('isDominatedByStrongerContradiction — Fase 15 (REJECT vs DEFER)', () => {
  test('contradicción con confidence HIGH y >= 2x evidenceCount domina -- REJECT candidato', () => {
    const weak = makeLearning({ confidence: 'MEDIUM', evidenceCount: 6 });
    const strongContradiction = [{ confidence: 'HIGH', evidenceCount: 20, learningId: 'x' }];
    assert.equal(isDominatedByStrongerContradiction(weak, strongContradiction), true);
  });
  test('evidencia comparable (ninguna domina) -- nunca REJECT, queda en DEFER', () => {
    const a = makeLearning({ confidence: 'MEDIUM', evidenceCount: 12 });
    const comparable = [{ confidence: 'MEDIUM', evidenceCount: 13, learningId: 'x' }];
    assert.equal(isDominatedByStrongerContradiction(a, comparable), false);
  });
  test('la recomendación evaluada ya es HIGH -- nunca queda dominada', () => {
    const strong = makeLearning({ confidence: 'HIGH', evidenceCount: 6 });
    const contradiction = [{ confidence: 'HIGH', evidenceCount: 100, learningId: 'x' }];
    assert.equal(isDominatedByStrongerContradiction(strong, contradiction), false);
  });
});

describe('hasRealCommercialEvidence — Fase 10 (UNKNOWN attribution nunca es evidencia positiva)', () => {
  test('learningType no comercial -- regla no aplica, siempre true', () => {
    assert.equal(hasRealCommercialEvidence(makeLearning({ learningType: 'FORMAT_LEARNING' })), true);
  });
  test('COMMERCIAL_LEARNING sin nonUnknownCount/revenueRecordCount real -- false', () => {
    assert.equal(hasRealCommercialEvidence(makeLearning({ learningType: 'COMMERCIAL_LEARNING', evidence: { expectedDirection: 'IMPROVE' } })), false);
  });
  test('COMMERCIAL_LEARNING con nonUnknownCount real > 0 -- true', () => {
    assert.equal(hasRealCommercialEvidence(makeLearning({ learningType: 'COMMERCIAL_LEARNING', evidence: { expectedDirection: 'IMPROVE', nonUnknownCount: 2 } })), true);
  });
});
