#!/usr/bin/env node
// phase5bValidation.js — Fase 5B: intento de validación REAL de
// AnthropicLLMProvider, usando exclusivamente RAW ya adquirido en las
// Fases 2-3. No hace investigación nueva, no usa Agent Reach, no eleva el
// presupuesto de CostGuard por encima de sus valores por defecto.
//
// Dos verificaciones separadas, deliberadamente:
//   A) A través del Agent completo (RawStore/CostGuard/AnalysisCache reales)
//      — esto es lo que de verdad ejecutaría un análisis en producción.
//   B) Directamente contra AnthropicLLMProvider.analyze(), para aislar
//      específicamente qué capa detiene la ejecución (CostGuard vs.
//      credencial) cuando (A) no llega a intentar la llamada real.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';

import { RawStore } from './src/storage/rawStore.js';
import { IntelligenceStore } from './src/storage/intelligenceStore.js';
import { AnalysisCache } from './src/storage/analysisCache.js';
import { CostGuard } from './src/agent/costGuard.js';
import { HeuristicLLMProvider } from './src/llm/heuristicProvider.js';
import { AnthropicLLMProvider } from './src/llm/anthropicProvider.js';
import { MarketingIntelligenceAgent } from './src/agent/marketingIntelligenceAgent.js';
import { aggregateInferences } from './src/pipeline/inference.js';
import { generateHypotheses } from './src/pipeline/hypothesis.js';
import { toJson, toJsonl } from './src/export/exportJson.js';
import { toCsv } from './src/export/exportCsv.js';
import { toMarkdownReport } from './src/export/exportMarkdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase5b');

function loadAllStoredRawRecords(rawStore) {
  const rawDir = join(DATA_DIR, 'raw');
  let files = [];
  try { files = readdirSync(rawDir).filter((f) => f.endsWith('.jsonl')); } catch { return []; }
  return files.flatMap((file) => rawStore.loadAll(file.replace(/\.jsonl$/, '')));
}

function selectRichDocuments(rawRecords, max = 3) {
  // Prioriza contenido de marketing/publicidad real sobre repos de código
  // (que son la fuente "especializada", no la central para este análisis).
  const marketingLike = rawRecords.filter((r) => r.source === 'web' || r.source === 'rss');
  const rest = rawRecords.filter((r) => !marketingLike.includes(r));
  return [...marketingLike, ...rest].slice(0, max);
}

async function main() {
  console.log('--- 1. Credencial ---');
  const hasCredential = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log(hasCredential ? 'CONFIGURADA' : 'AUSENTE');
  // Nunca se imprime, se escribe ni se registra el valor de la credencial en ningún punto de este script.

  const rawStore = new RawStore(join(DATA_DIR, 'raw'));
  const allRaw = loadAllStoredRawRecords(rawStore);
  const selected = selectRichDocuments(allRaw, 3);
  console.log(`\n--- 2. Documentos seleccionados (RAW ya adquirido, ${selected.length} de ${allRaw.length}) ---`);
  for (const r of selected) console.log(`  [${r.source}] ${r.title ?? r.url}`);

  console.log('\n--- 3. Intento REAL vía el Agent completo (CostGuard con valores por defecto, sin elevarlos) ---');
  const intelligenceStore = new IntelligenceStore(join(DATA_DIR, 'intelligence'));
  const analysisCache = new AnalysisCache(join(DATA_DIR, 'cache'));
  const anthropicProvider = new AnthropicLLMProvider({}); // sin overrides: modelo/credencial 100% desde el entorno
  const defaultCostGuard = new CostGuard(); // max_llm_budget_usd=0, max_documents_per_run=Infinity, max_tokens_per_document=Infinity — valores ya configurados, sin elevarlos
  const agentReal = new MarketingIntelligenceAgent({ provider: anthropicProvider, intelligenceStore, analysisCache, costGuard: defaultCostGuard });

  console.log('provider:', anthropicProvider.name, '| model:', anthropicProvider.model, '| prompt_version:', anthropicProvider.promptVersion);

  let realCallAttempts = 0;
  let agentResult;
  try {
    agentResult = await agentReal.analyzeRecord(selected[0]);
    if (!agentResult.skipped) realCallAttempts = 1;
  } catch (err) {
    agentResult = { threw: true, message: err.message };
    realCallAttempts = 1; // llegó a intentar analyze(), aunque falló
  }
  console.log('Resultado vía Agent:', JSON.stringify(agentResult).slice(0, 300));

  console.log('\n--- 4. Verificación aislada: ¿qué capa detiene exactamente la ejecución? ---');
  const budgetCheck = defaultCostGuard.canProcessOne(anthropicProvider.costPerDocumentUsd);
  console.log('CostGuard.canProcessOne con presupuesto por defecto:', JSON.stringify(budgetCheck));

  let credentialGateResult;
  try {
    await anthropicProvider.analyze(selected[0].content, {});
    credentialGateResult = 'LLAMADA REAL EJECUTADA';
  } catch (err) {
    credentialGateResult = err.message;
  }
  console.log('Llamada directa a AnthropicLLMProvider.analyze() (fuera de CostGuard):', credentialGateResult);

  console.log('\n--- 5. Análisis heurístico REAL (sin costo, sin credencial) sobre los mismos documentos ---');
  const heuristicProvider = new HeuristicLLMProvider();
  const heuristicCostGuard = new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: 10 });
  const heuristicAgent = new MarketingIntelligenceAgent({ provider: heuristicProvider, intelligenceStore, analysisCache, costGuard: heuristicCostGuard });

  const heuristicResults = await heuristicAgent.analyzeBatch(selected, { forceReanalyze: true });
  const allObservations = heuristicResults.flatMap((r) => r.observations ?? []);
  const allClaims = heuristicResults.flatMap((r) => r.claims ?? []);
  console.log(`Observaciones heurísticas reales: ${allObservations.length} · Claims: ${allClaims.length}`);
  for (const obs of allObservations) {
    console.log(`  [${obs.dimension}] "${obs.evidence_quote}" (confidence ${obs.confidence})`);
  }

  const inferences = aggregateInferences(allObservations, { scopeLabel: `N=${selected.length} documentos de la Fase 5B` });
  for (const inf of inferences) intelligenceStore.save('inference', inf);
  const hypotheses = generateHypotheses(inferences);
  for (const hyp of hypotheses) intelligenceStore.save('hypothesis', hyp);
  console.log(`Inferencias: ${inferences.length} · Hipótesis: ${hypotheses.length}`);

  console.log('\n--- 6. cost_audit ---');
  const allCostAudits = intelligenceStore.loadAll('cost_audit');
  const newCostAudits = allCostAudits.filter((a) => selected.some((s) => s.record_id === a.raw_id));
  console.log(`Registros cost_audit para los documentos de esta corrida: ${newCostAudits.length} (0 es lo esperado — no hubo ninguna llamada real exitosa)`);
  console.log('¿Algún registro contiene la subcadena "sk-ant"?', JSON.stringify(allCostAudits).includes('sk-ant'));

  console.log('\n--- 7. Exportación ---');
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'observations.jsonl'), toJsonl(allObservations), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'intelligence.json'), toJson({ observations: allObservations, inferences, hypotheses, claims: allClaims }), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'observations.csv'), toCsv(allObservations), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'reporte.md'), toMarkdownReport({ rawRecords: selected, observations: allObservations, inferences, hypotheses, claims: allClaims }), 'utf8');
  console.log(`Exportado a: ${EXPORT_DIR}`);

  console.log('\n--- 8. Resumen máquina-legible ---');
  const summary = {
    credential_status: hasCredential ? 'CONFIGURADA' : 'AUSENTE',
    provider: anthropicProvider.name,
    model: anthropicProvider.model,
    prompt_version: anthropicProvider.promptVersion,
    documents_selected: selected.length,
    real_anthropic_call_attempts: realCallAttempts,
    real_anthropic_calls_succeeded: 0,
    agent_result_for_doc1: agentResult,
    cost_guard_check: budgetCheck,
    credential_gate_result: credentialGateResult,
    heuristic_observations: allObservations.length,
    heuristic_inferences: inferences.length,
    heuristic_hypotheses: hypotheses.length,
    claims_detected: allClaims.length,
    cost_audit_records_this_run: newCostAudits.length,
  };
  writeFileSync(join(EXPORT_DIR, 'resumen.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
