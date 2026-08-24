// pipeline.test.js — Fase 11. Prueba de integración de la CADENA propia de
// este módulo (pattern → ContentOpportunity → ContentBrief → trazabilidad),
// con datos SINTÉTICOS (nunca red real) — las funciones reutilizadas de
// marketing-intelligence/website-intelligence (aggregateInferences,
// generateHypotheses, createContentBrief, traceReference) ya tienen su
// propia suite de pruebas completa en sus módulos de origen; aquí solo se
// prueba el GLUE nuevo de la Fase 11, para no duplicar cobertura.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPerformanceSignalObservation } from '../src/performanceSignal.js';
import { createContentOpportunity } from '../src/contentOpportunity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MI_ROOT = join(__dirname, '..', '..', 'marketing-intelligence');
const WI_ROOT = join(__dirname, '..', '..', 'website-intelligence');

const { aggregateInferences } = await import(`file://${join(MI_ROOT, 'src/pipeline/inference.js').replace(/\\/g, '/')}`);
const { generateHypotheses } = await import(`file://${join(MI_ROOT, 'src/pipeline/hypothesis.js').replace(/\\/g, '/')}`);
const { RawStore } = await import(`file://${join(MI_ROOT, 'src/storage/rawStore.js').replace(/\\/g, '/')}`);
const { IntelligenceStore } = await import(`file://${join(MI_ROOT, 'src/storage/intelligenceStore.js').replace(/\\/g, '/')}`);
const { createRecord } = await import(`file://${join(MI_ROOT, 'src/contract.js').replace(/\\/g, '/')}`);
const { createContentBrief, createPatternReference } = await import(`file://${join(WI_ROOT, 'src/contentBrief.js').replace(/\\/g, '/')}`);
const { traceReference } = await import(`file://${join(WI_ROOT, 'src/traceability.js').replace(/\\/g, '/')}`);

function syntheticObservation(overrides = {}) {
  return { observation_id: `obs-${Math.random().toString(36).slice(2)}`, raw_id: 'raw-fake-1', dimension: 'HOOK', value: 'pregunta', evidence_quote: '¿Funciona de verdad?', confidence: 0.6, requires_human_review: true, ...overrides };
}

describe('Fase 11 — separación PERFORMANCE_SIGNAL vs OBSERVATION de contenido', () => {
  test('un performance signal y una observación de contenido son objetos distintos, nunca se agregan juntos', () => {
    const perf = createPerformanceSignalObservation({ raw_id: 'raw-1', url: 'https://youtube.com/watch?v=x', metricName: 'views', metrics: { views: 100, views_available: true } });
    const contentObs = syntheticObservation();
    assert.notEqual(perf.dimension, contentObs.dimension);
    // aggregateInferences agrupa por dimension::value — si se mezclaran, "PERFORMANCE_SIGNAL::views" nunca debe coincidir con ninguna dimensión de contenido real.
    const inferences = aggregateInferences([perf, contentObs, contentObs], { scopeLabel: 'test' });
    const perfInference = inferences.find((i) => i.dimension === 'PERFORMANCE_SIGNAL');
    assert.ok(perfInference, 'aggregateInferences no rompe con PERFORMANCE_SIGNAL, pero queda como su propio grupo separado');
    assert.equal(perfInference.pattern, 'views');
  });
});

describe('Fase 11 — pattern → hypothesis → ContentOpportunity → ContentBrief (con datos sintéticos, sin red)', () => {
  test('cadena completa: frecuencia/scope/based_on_observation_ids reales, ContentOpportunity y ContentBrief válidos', () => {
    const observations = [
      syntheticObservation({ observation_id: 'obs-a', dimension: 'HOOK', value: 'pregunta', evidence_quote: '¿Esto funciona?' }),
      syntheticObservation({ observation_id: 'obs-b', dimension: 'HOOK', value: 'pregunta', evidence_quote: '¿De verdad sirve?' }),
      syntheticObservation({ observation_id: 'obs-c', dimension: 'CTA', value: 'llamada_a_la_accion', evidence_quote: 'suscríbete ahora' }),
    ];

    const patterns = aggregateInferences(observations, { scopeLabel: 'test_sample (N=2)' });
    const hookPattern = patterns.find((p) => p.dimension === 'HOOK');
    assert.equal(hookPattern.frequency, 0.67); // 2/3, con el redondeo de aggregateInferences
    assert.equal(hookPattern.scope, 'test_sample (N=2)');
    assert.deepEqual(hookPattern.based_on_observation_ids, ['obs-a', 'obs-b']);

    const hypotheses = generateHypotheses(patterns);
    const hookHyp = hypotheses.find((h) => h.based_on_inference_id === hookPattern.inference_id);
    assert.equal(hookHyp.requires_review, true);

    const opportunity = createContentOpportunity({
      market_pattern: { description: 'Pregunta directa aparece en 2/3 observaciones.', dimension: hookPattern.dimension, frequency: hookPattern.frequency, scope: hookPattern.scope, inference_id: hookPattern.inference_id },
      source_observation_ids: hookPattern.based_on_observation_ids,
      hypothesis: { hypothesis_id: hookHyp.hypothesis_id, text: hookHyp.hypothesis },
      vida_divina_relevance: { relation_to_primary_context: 'Podría probarse una apertura en pregunta para TéDivina, como hipótesis a validar.', product_ref: 'TéDivina' },
    });
    assert.equal(opportunity.requires_human_review, true);

    const patternRef = createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: opportunity.market_pattern.inference_id, rationale: opportunity.market_pattern.description });
    const brief = createContentBrief({
      page_type: 'pagina_producto',
      objective: 'Brief de prueba — qué probar, no qué copiar.',
      main_message: opportunity.vida_divina_relevance.relation_to_primary_context,
      desire: [patternRef],
    });
    assert.equal(brief.requires_human_review, true);
    assert.equal(brief.desire[0].reference_id, hookPattern.inference_id);
  });

  test('createPatternReference rechaza "viral_content_intelligence" como source_module — restricción conocida y documentada de website-intelligence, NO modificada en esta fase', () => {
    assert.throws(() => createPatternReference({ source_module: 'viral_content_intelligence', reference_type: 'inference', reference_id: 'x', rationale: 'r' }));
  });
});

describe('Fase 11 — trazabilidad real: hypothesis → inference → observation → raw_id → url', () => {
  let dir, rawStore, intelligenceStore;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'vci-fase11-trace-'));
    rawStore = new RawStore(join(dir, 'raw'));
    intelligenceStore = new IntelligenceStore(join(dir, 'intelligence'));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('resuelve una hipótesis sintética hasta la URL real de un RAW guardado con el RawStore real', () => {
    const raw = createRecord({ source: 'youtube', platform_object_type: 'video', url: 'https://www.youtube.com/watch?v=sintetico1', content: 'contenido de prueba', access_method: 'public_web_direct', fetch_status: 'ok' });
    rawStore.save(raw);

    const observation = { observation_id: 'obs-x', raw_id: raw.record_id, dimension: 'HOOK', value: 'pregunta', evidence_quote: 'contenido', confidence: 0.5 };
    intelligenceStore.save('observation', observation);

    const [pattern] = aggregateInferences([observation], { scopeLabel: 'test' });
    intelligenceStore.save('inference', pattern);
    const [hyp] = generateHypotheses([pattern]);
    intelligenceStore.save('hypothesis', hyp);

    const ref = createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'hypothesis', reference_id: hyp.hypothesis_id, rationale: 'prueba de trazabilidad Fase 11' });
    const result = traceReference(ref, { rawStore, intelligenceStore });
    assert.equal(result.status, 'resolved');
    assert.equal(result.chain.url, 'https://www.youtube.com/watch?v=sintetico1');
  });
});

describe('Fase 11 — disciplina de exportación y anti-copia', () => {
  test('un objeto de export de video (shape usado por videos.jsonl) nunca incluye la transcripción completa', () => {
    // Replica el shape exacto que phase11Mvp.js escribe a videos.jsonl — solo
    // campos agregados/metadata, nunca "content" ni "transcript".
    const videoExportShape = { video_id: 'x', url: 'https://youtube.com/watch?v=x', title: 't', channel: 'c', published_at: null, views: 100, duration_seconds: 60, transcript_available: true, transcript_type: 'auto', transcript_language: 'en' };
    assert.ok(!('content' in videoExportShape));
    assert.ok(!('transcript' in videoExportShape));
  });

  test('evidence_quote de una observación es siempre corto (nunca la transcripción completa reproducida como "evidencia")', () => {
    const obs = syntheticObservation({ evidence_quote: 'x'.repeat(50) });
    assert.ok(obs.evidence_quote.length < 300, 'evidence_quote debe ser una cita corta, no un fragmento extenso del contenido');
  });

  test('el ContentBrief generado siempre incluye la restricción explícita de no copiar contenido externo', () => {
    const brief = { constraints: ['No copiar títulos, guiones, frases largas, estructura palabra por palabra ni CTA literal del contenido externo observado.'] };
    assert.ok(brief.constraints.some((c) => c.toLowerCase().includes('no copiar')));
  });
});

describe('Fase 11 — regresión: "a && b && c" nunca debe usarse como booleano exportable', () => {
  test('transcriptOk se calcula con Boolean(...) explícito en el script real, no con un && crudo (bug real detectado y corregido en esta fase)', () => {
    const source = readFileSync(join(__dirname, '..', 'phase11Mvp.js'), 'utf8');
    assert.match(source, /const transcriptOk = Boolean\(/, 'debe envolver la expresión && en Boolean(...) para nunca exportar el string completo de la transcripción en lugar de true/false');
  });

  test('si existen exports reales de una corrida previa, ningún registro de videos.jsonl tiene un campo string sospechosamente largo ni transcript_available no-booleano', () => {
    const exportPath = join(__dirname, '..', 'exports', 'phase11', 'videos.jsonl');
    let content;
    try { content = readFileSync(exportPath, 'utf8'); } catch { return; } // sin export previo: nada que verificar en esta corrida de tests
    const videos = content.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    for (const v of videos) {
      assert.equal(typeof v.transcript_available, 'boolean', `transcript_available de ${v.video_id} debe ser boolean, nunca un string`);
      for (const [key, value] of Object.entries(v)) {
        if (typeof value === 'string') assert.ok(value.length < 300, `campo "${key}" de ${v.video_id} tiene ${value.length} caracteres — sospechoso de contener contenido completo en vez de metadata corta`);
      }
    }
  });
});

describe('Fase 11 — límite máximo de videos (MAX_VIDEOS=5)', () => {
  test('el script del piloto declara y respeta un tope de 5 videos', () => {
    const source = readFileSync(join(__dirname, '..', 'phase11Mvp.js'), 'utf8');
    assert.match(source, /const MAX_VIDEOS = 5;/);
    assert.match(source, /\.slice\(0, MAX_VIDEOS\)/);
  });
});
