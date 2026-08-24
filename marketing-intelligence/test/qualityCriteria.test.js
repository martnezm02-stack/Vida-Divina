// qualityCriteria.test.js — §18 del encargo: criterios de evaluación
// explícitos y automatizados, no una afirmación de "el LLM respondió bien".
//
// Se ejecutan contra la salida REAL del agente (proveedor heurístico) sobre
// un pequeño corpus de fixtures — sin red, deterministas.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecord } from '../src/contract.js';
import { RawStore } from '../src/storage/rawStore.js';
import { IntelligenceStore } from '../src/storage/intelligenceStore.js';
import { AnalysisCache } from '../src/storage/analysisCache.js';
import { CostGuard } from '../src/agent/costGuard.js';
import { HeuristicLLMProvider } from '../src/llm/heuristicProvider.js';
import { MarketingIntelligenceAgent } from '../src/agent/marketingIntelligenceAgent.js';
import { aggregateInferences } from '../src/pipeline/inference.js';
import { generateHypotheses } from '../src/pipeline/hypothesis.js';
import { DIMENSIONS } from '../src/taxonomy.js';

const FIXTURES = [
  '¿Sabías que el 90% de las personas fallan en su primera dieta? Compra ahora y transforma tu vida, oferta válida solo hoy.',
  'Este té elimina la grasa abdominal en 7 días, según estudios demuestran. Miles de personas ya lo probaron.',
  'Cómo funciona nuestro método: gracias a ingredientes naturales, te ayuda a lograr más energía.',
  'Repositorio de código para automatización de marketing, sin afirmaciones de producto.',
];

describe('Criterios de evaluación de calidad (§18)', () => {
  let dir, rawStore, intelligenceStore, allObservations, allClaims, inferences, hypotheses, rawRecords;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mi-quality-'));
    rawStore = new RawStore(join(dir, 'raw'));
    intelligenceStore = new IntelligenceStore(join(dir, 'intelligence'));
    const analysisCache = new AnalysisCache(join(dir, 'cache'));
    const agent = new MarketingIntelligenceAgent({
      provider: new HeuristicLLMProvider(),
      intelligenceStore, analysisCache,
      costGuard: new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: 10 }),
    });

    rawRecords = FIXTURES.map((content, i) => createRecord({
      source: 'web', platform_object_type: 'article', url: `https://fixture.test/quality-${i}`,
      content, access_method: 'specialized_tool',
    }));
    for (const r of rawRecords) rawStore.save(r);

    const results = await agent.analyzeBatch(rawRecords);
    allObservations = results.flatMap((r) => r.observations ?? []);
    allClaims = results.flatMap((r) => r.claims ?? []);
    inferences = aggregateInferences(allObservations, { scopeLabel: `N=${rawRecords.length} fixtures de prueba` });
    hypotheses = generateHypotheses(inferences);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  test('1. Evidencia presente: toda observación tiene evidence_quote no vacío', () => {
    assert.ok(allObservations.length > 0);
    for (const o of allObservations) assert.ok(o.evidence_quote && o.evidence_quote.length > 0);
  });

  test('2. Trazabilidad: toda observación resuelve a un registro RAW real existente', () => {
    for (const o of allObservations) {
      const source = rawStore.loadByRecordId(o.raw_id);
      assert.ok(source, `raw_id ${o.raw_id} debe existir en RawStore`);
    }
  });

  test('3. Ausencia de invención: evidence_quote es un fragmento literal del contenido original (excepto FORMAT, que por diseño referencia metadata estructurada, no texto — ver format.js)', () => {
    for (const o of allObservations.filter((obs) => obs.dimension !== 'FORMAT')) {
      const source = rawStore.loadByRecordId(o.raw_id);
      const haystack = `${source.title ?? ''} ${source.content}`;
      assert.ok(haystack.includes(o.evidence_quote), `evidence_quote "${o.evidence_quote}" debe ser substring literal de la fuente`);
    }
    for (const o of allObservations.filter((obs) => obs.dimension === 'FORMAT')) {
      assert.match(o.evidence_quote, /^metadata\.platform_object_type = /, 'FORMAT debe citar metadata explícitamente, nunca inventar texto');
    }
  });

  test('4. Separación estricta OBSERVACIÓN / INFERENCIA / HIPÓTESIS', () => {
    for (const o of allObservations) assert.equal(o.basis, 'OBSERVADO');
    for (const i of inferences) assert.equal(i.basis, 'INFERENCIA');
    for (const h of hypotheses) {
      assert.equal(h.basis, 'HIPOTESIS');
      assert.equal(h.requires_review, true, 'ninguna hipótesis se presenta como hecho verificado');
    }
  });

  test('5. Clasificación correcta: toda dimensión pertenece a la taxonomía definida', () => {
    for (const o of allObservations) assert.ok(DIMENSIONS.includes(o.dimension), `${o.dimension} no está en la taxonomía`);
  });

  test('6. Manejo de incertidumbre: confidence siempre en [0,1] y con justificación', () => {
    for (const o of allObservations) {
      assert.ok(o.confidence >= 0 && o.confidence <= 1);
      assert.ok(o.confidence_basis && o.confidence_basis.length > 0);
    }
    for (const i of inferences) assert.ok(i.scope && i.scope.length > 0, 'toda inferencia declara su alcance (N)');
  });

  test('7. Claims correctamente marcados: nunca se afirman como verdad, siempre requieren revisión', () => {
    const healthFixtureClaims = allClaims.filter((c) => c.claim_type === 'health_benefit_claim');
    assert.ok(healthFixtureClaims.length > 0, 'el fixture de té/grasa abdominal debe producir al menos un claim de salud');
    for (const c of allClaims) {
      assert.equal(c.verification_status, 'UNVERIFIED');
      assert.equal(c.requires_human_review, true);
    }
  });

  test('8. Resistencia a prompt injection: ver test/promptInjectionResistance.test.js (criterio validado por separado)', () => {
    // Criterio cubierto en su propio archivo para mantener la trazabilidad de
    // ese caso específico; se referencia aquí para que la lista de 8
    // criterios quede completa en un solo lugar.
    assert.ok(true);
  });
});
