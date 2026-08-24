import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDataPoint, createObservation, createPattern, createLearning, createRecommendation,
  assertNoUnverifiedBusinessClaim, crossValidateWithOwnPerformance, sanitizeCompetitiveMetrics,
  UNKNOWN, FORBIDDEN_INFERRED_METRICS,
} from '../src/evidenceTaxonomy.js';

describe('Evidence classification — DATA → OBSERVATION → PATTERN → LEARNING → RECOMMENDATION', () => {
  test('DATA: un dato crudo real, con fuente', () => {
    const data = createDataPoint({ domain: 'COMPETITIVE', field: 'observedLongevity', value: 180, source: 'meta_ad_library' });
    assert.equal(data.type, 'DATA');
    assert.equal(data.value, 180);
  });

  test('DATA: nunca se infiere ROAS/CPA/ventas/conversiones/audiencia real de un competidor', () => {
    for (const field of FORBIDDEN_INFERRED_METRICS) {
      assert.throws(
        () => createDataPoint({ domain: 'COMPETITIVE', field, value: 4.2, source: 'estimación de terceros' }),
        /nunca se infiere/,
        `se esperaba que "${field}" fuera rechazado si no es UNKNOWN`
      );
      // Pero SÍ se acepta si se declara honestamente como UNKNOWN.
      const ok = createDataPoint({ domain: 'COMPETITIVE', field, value: UNKNOWN, source: null });
      assert.equal(ok.value, UNKNOWN);
    }
  });

  test('OBSERVATION requiere al menos 1 DataPoint real detrás', () => {
    assert.throws(() => createObservation({ domain: 'COMPETITIVE', description: 'x', basedOnData: [] }));
    const data = createDataPoint({ domain: 'COMPETITIVE', field: 'observedLongevity', value: 180, source: 'meta_ad_library' });
    const obs = createObservation({ domain: 'COMPETITIVE', description: 'El anuncio lleva 180 días activo', basedOnData: [data] });
    assert.equal(obs.type, 'OBSERVATION');
  });

  test('PATTERN nunca nace de una sola Observation — exige repetición real', () => {
    const data = createDataPoint({ domain: 'COMPETITIVE', field: 'format', value: 'Podcast clip', source: 'ad_library' });
    const obs1 = createObservation({ domain: 'COMPETITIVE', description: 'Competidor A usa podcast clip', basedOnData: [data] });
    assert.throws(() => createPattern({ domain: 'COMPETITIVE', description: 'x', basedOnObservations: [obs1] }));
    const obs2 = createObservation({ domain: 'COMPETITIVE', description: 'Competidor B usa podcast clip', basedOnData: [data] });
    const pattern = createPattern({ domain: 'COMPETITIVE', description: 'Formato podcast clip se repite entre competidores', basedOnObservations: [obs1, obs2] });
    assert.equal(pattern.type, 'PATTERN');
  });

  test('LEARNING nunca nace de una Observation aislada — exige al menos 1 Pattern', () => {
    assert.throws(() => createLearning({ description: 'x', basedOnPatterns: [] }));
  });

  test('RECOMMENDATION nunca se autoejecuta', () => {
    const data = createDataPoint({ domain: 'COMPETITIVE', field: 'format', value: 'Podcast clip', source: 'ad_library' });
    const obs1 = createObservation({ domain: 'COMPETITIVE', description: 'a', basedOnData: [data] });
    const obs2 = createObservation({ domain: 'COMPETITIVE', description: 'b', basedOnData: [data] });
    const pattern = createPattern({ domain: 'COMPETITIVE', description: 'p', basedOnObservations: [obs1, obs2] });
    const learning = createLearning({ description: 'la estructura merece consideración estratégica', basedOnPatterns: [pattern] });
    const rec = createRecommendation({ description: 'Crear una hipótesis propia inspirada en el patrón', basedOnLearning: learning });
    assert.equal(rec.autoExecutes, false);
  });
});

describe('Competitive evidence NUNCA se convierte automáticamente en sales evidence', () => {
  function competitivePattern() {
    const data = createDataPoint({ domain: 'COMPETITIVE', field: 'observedLongevity', value: 180, source: 'ad_library' });
    const obs1 = createObservation({ domain: 'COMPETITIVE', description: 'Anuncio A activo 180 días', basedOnData: [data] });
    const obs2 = createObservation({ domain: 'COMPETITIVE', description: 'Anuncio B activo 150 días', basedOnData: [data] });
    return createPattern({ domain: 'COMPETITIVE', description: 'Longevidad alta en varios competidores', basedOnObservations: [obs1, obs2] });
  }

  test('rechaza un Learning basado SOLO en evidencia competitiva que afirma "vende"', () => {
    const pattern = competitivePattern();
    const learning = createLearning({ description: 'este formato vende muy bien en el mercado', basedOnPatterns: [pattern] });
    assert.throws(() => assertNoUnverifiedBusinessClaim(learning), /Meta no expone performance real/);
  });

  test('permite un Learning basado solo en evidencia competitiva SIN afirmar resultado de negocio', () => {
    const pattern = competitivePattern();
    const learning = createLearning({ description: 'la estructura merece consideración estratégica', basedOnPatterns: [pattern] });
    assert.equal(assertNoUnverifiedBusinessClaim(learning), true);
  });

  test('crossValidateWithOwnPerformance exige AMBOS lados (Competitor Pattern + Vida Divina Performance)', () => {
    const compPattern = competitivePattern();
    assert.throws(() => crossValidateWithOwnPerformance({ competitivePattern: compPattern, ownPerformancePattern: null, description: 'x' }));

    const ownData = createDataPoint({ domain: 'OWN_PERFORMANCE', field: 'saved', value: 42, source: 'instagram_insights' });
    const ownObs1 = createObservation({ domain: 'OWN_PERFORMANCE', description: 'pieza propia con saves altos', basedOnData: [ownData] });
    const ownObs2 = createObservation({ domain: 'OWN_PERFORMANCE', description: 'segunda pieza con saves altos', basedOnData: [ownData] });
    const ownPattern = createPattern({ domain: 'OWN_PERFORMANCE', description: 'saves consistentemente altos', basedOnObservations: [ownObs1, ownObs2] });

    const strategicLearning = crossValidateWithOwnPerformance({ competitivePattern: compPattern, ownPerformancePattern: ownPattern, description: 'evidencia cruzada: patrón de mercado + desempeño propio coinciden' });
    assert.equal(strategicLearning.subType, 'STRATEGIC_LEARNING');
    assert.deepEqual([...strategicLearning.evidenceDomains].sort(), ['COMPETITIVE', 'OWN_PERFORMANCE']);
  });

  test('sanitizeCompetitiveMetrics fuerza a UNKNOWN cualquier métrica prohibida presente en un registro', () => {
    const dirty = { competitor: 'x', sales: 5000, roas: 3.2, format: 'Podcast clip' };
    const { record, scrubbedFields } = sanitizeCompetitiveMetrics(dirty);
    assert.equal(record.sales, UNKNOWN);
    assert.equal(record.roas, UNKNOWN);
    assert.equal(record.format, 'Podcast clip'); // campo no prohibido, se conserva intacto
    assert.deepEqual(scrubbedFields.sort(), ['roas', 'sales']);
  });
});
