#!/usr/bin/env node
// agentDemo.js — Fase 3: prueba controlada del Marketing Intelligence Agent.
//
// IMPORTANTE: no adquiere nada nuevo de Internet. Reutiliza exclusivamente
// los registros RAW ya almacenados en data/raw/ durante la Fase 2 (Web, RSS,
// GitHub). Ninguna llamada de red ocurre en este script.
//
// Demuestra la cadena:
//   RAW (ya adquirido) -> LLM ANALYSIS (proveedor heurístico) -> OBSERVATION
//   -> INFERENCE (= PATTERN) -> HYPOTHESIS -> TREND -> INTELLIGENCE STORE -> EXPORT
//
// Uso: node agentDemo.js   (o: npm run demo:agent)

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';

import { RawStore } from './src/storage/rawStore.js';
import { IntelligenceStore } from './src/storage/intelligenceStore.js';
import { AnalysisCache } from './src/storage/analysisCache.js';
import { CostGuard } from './src/agent/costGuard.js';
import { HeuristicLLMProvider } from './src/llm/heuristicProvider.js';
import { MarketingIntelligenceAgent } from './src/agent/marketingIntelligenceAgent.js';
import { aggregateInferences } from './src/pipeline/inference.js';
import { generateHypotheses } from './src/pipeline/hypothesis.js';
import { detectTrends } from './src/pipeline/trend.js';
import { toJson, toJsonl } from './src/export/exportJson.js';
import { toCsv } from './src/export/exportCsv.js';
import { toMarkdownReport } from './src/export/exportMarkdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase3');

function loadAllStoredRawRecords(rawStore) {
  const rawDir = join(DATA_DIR, 'raw');
  let files = [];
  try {
    files = readdirSync(rawDir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  return files.flatMap((file) => rawStore.loadAll(file.replace(/\.jsonl$/, '')));
}

function checkQualityCriteria(observations, rawStore) {
  const withEvidence = observations.filter((o) => o.evidence_quote && o.evidence_quote.length > 0);
  const withValidConfidence = observations.filter((o) => typeof o.confidence === 'number' && o.confidence >= 0 && o.confidence <= 1);
  const withTraceableSource = observations.filter((o) => rawStore.loadByRecordId(o.raw_id) !== null);

  // FORMAT es la única dimensión cuyo evidence_quote referencia metadata
  // estructurada en vez de texto (por diseño, ver src/agent/heuristics/format.js)
  // — se evalúa por separado para no marcarla como "invención".
  const textBased = observations.filter((o) => o.dimension !== 'FORMAT');
  const formatBased = observations.filter((o) => o.dimension === 'FORMAT');
  const noFabricationText = textBased.filter((o) => {
    const source = rawStore.loadByRecordId(o.raw_id);
    if (!source) return false;
    const haystack = `${source.title ?? ''} ${source.content}`;
    return haystack.includes(o.evidence_quote);
  });
  const formatCitesMetadata = formatBased.filter((o) => o.evidence_quote.startsWith('metadata.platform_object_type = '));

  return {
    total: observations.length,
    evidencia_presente: `${withEvidence.length}/${observations.length}`,
    confidence_valida_0_a_1: `${withValidConfidence.length}/${observations.length}`,
    trazabilidad_a_raw: `${withTraceableSource.length}/${observations.length}`,
    sin_invencion_evidence_quote_literal_texto: `${noFabricationText.length}/${textBased.length}`,
    format_cita_metadata_no_texto: `${formatCitesMetadata.length}/${formatBased.length}`,
  };
}

async function main() {
  const rawStore = new RawStore(join(DATA_DIR, 'raw'));
  const intelligenceStore = new IntelligenceStore(join(DATA_DIR, 'intelligence'));
  const analysisCache = new AnalysisCache(join(DATA_DIR, 'cache'));
  const costGuard = new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: 50, maxTokensPerDocument: 8000 });
  const provider = new HeuristicLLMProvider();
  const agent = new MarketingIntelligenceAgent({ provider, intelligenceStore, analysisCache, costGuard });

  console.log('--- 1. Carga de RAW ya adquirido en la Fase 2 (sin red) ---');
  const rawRecords = loadAllStoredRawRecords(rawStore);
  console.log(`Registros RAW disponibles: ${rawRecords.length}`);

  console.log('\n--- 2. Análisis (LLM ANALYSIS vía proveedor: ' + provider.name + ') ---');
  // --force reanaliza aunque ya exista en AnalysisCache — útil para
  // re-ejecutar esta demo tras un cambio en los detectores. Por defecto
  // (sin --force) el cache se respeta, que es el comportamiento real deseado.
  const forceReanalyze = process.argv.includes('--force');
  const batchResults = await agent.analyzeBatch(rawRecords, { forceReanalyze });
  const analyzed = batchResults.filter((r) => !r.skipped);
  const skipped = batchResults.filter((r) => r.skipped);
  console.log(`Documentos analizados: ${analyzed.length} · omitidos: ${skipped.length}`);
  for (const s of skipped) console.log(`  omitido [${s.raw_id.slice(0, 8)}...]: ${s.reason}`);

  const allObservations = analyzed.flatMap((r) => r.observations);
  const allClaims = analyzed.flatMap((r) => r.claims);
  console.log(`Observaciones generadas: ${allObservations.length} · Claims detectados: ${allClaims.length}`);
  console.log('Costos:', costGuard.summary);

  console.log('\n--- 3. Inferencia = PATTERN (Etapa B, reutiliza src/pipeline/inference.js de la Fase 2) ---');
  const inferences = aggregateInferences(allObservations, {
    scopeLabel: `N=${rawRecords.length} registros RAW ya adquiridos (Fase 3, sin investigación nueva)`,
  });
  for (const inf of inferences) intelligenceStore.save('inference', inf);
  console.log(`Inferencias/Patterns generados: ${inferences.length}`);

  console.log('\n--- 4. Hipótesis (Etapa C) ---');
  const hypotheses = generateHypotheses(inferences);
  for (const hyp of hypotheses) intelligenceStore.save('hypothesis', hyp);
  console.log(`Hipótesis generadas: ${hypotheses.length}`);

  console.log('\n--- 5. Tendencias (TREND — comparación entre corridas históricas) ---');
  const historicalInferences = intelligenceStore.loadAll('inference');
  const trends = detectTrends(historicalInferences);
  for (const t of trends) intelligenceStore.save('trend', t);
  const insufficient = trends.filter((t) => t.direction === 'insufficient_data').length;
  console.log(`Tendencias evaluadas: ${trends.length} (${insufficient} marcadas "insufficient_data" — primera corrida de cada patrón)`);

  console.log('\n--- 6. Trazabilidad SOURCE -> OBSERVATION -> INFERENCE -> HYPOTHESIS (ejemplo real) ---');
  if (hypotheses.length > 0) {
    const hyp = hypotheses[0];
    const inf = inferences.find((i) => i.inference_id === hyp.based_on_inference_id);
    const obs = allObservations.find((o) => inf.based_on_observation_ids.includes(o.observation_id));
    const source = rawStore.loadByRecordId(obs.raw_id);
    console.log('Hipótesis :', hyp.hypothesis);
    console.log('  <- Inferencia  :', `${inf.dimension} -> ${inf.pattern}`, `(scope: ${inf.scope}, frecuencia: ${inf.frequency})`);
    console.log('  <- Observación :', obs.value, `("${obs.evidence_quote}") confidence=${obs.confidence} (${obs.confidence_basis})`);
    console.log('  <- Fuente RAW  :', source.url, `(hash ${source.content_hash.slice(0, 12)}...)`);
  }

  if (allClaims.length > 0) {
    console.log('\n--- 6b. Ejemplo real de claim detectado (NUNCA verificado automáticamente) ---');
    const claim = allClaims[0];
    const source = rawStore.loadByRecordId(claim.raw_id);
    console.log(`  claim_text: "${claim.claim_text}"`);
    console.log(`  claim_type: ${claim.claim_type} · verification_status: ${claim.verification_status} · requires_human_review: ${claim.requires_human_review}`);
    console.log(`  fuente: ${source.url}`);
  } else {
    console.log('\n--- 6b. No se detectaron claims de salud/beneficio en este lote (esperado: el corpus de la Fase 2 es de marketing general, no de anuncios de salud) ---');
  }

  console.log('\n--- 7. Evaluación de calidad (criterios automatizados, §18) ---');
  const quality = checkQualityCriteria(allObservations, rawStore);
  console.log(quality);

  console.log('\n--- 8. Exportación ---');
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'observations.jsonl'), toJsonl(allObservations), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'claims.jsonl'), toJsonl(allClaims), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'intelligence.json'), toJson({ observations: allObservations, inferences, hypotheses, claims: allClaims, trends }), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'observations.csv'), toCsv(allObservations), 'utf8');
  writeFileSync(
    join(EXPORT_DIR, 'reporte.md'),
    toMarkdownReport({ rawRecords, observations: allObservations, inferences, hypotheses, claims: allClaims, trends }),
    'utf8'
  );
  console.log(`Exportado a: ${EXPORT_DIR}`);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
