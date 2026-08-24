#!/usr/bin/env node
// anthropicDemo.js — Fase 5: prueba controlada de AnthropicLLMProvider.
//
// IMPORTANTE — qué es real y qué es simulado en este script:
//   1. Intento REAL contra la API real, sobre 1 documento de la Fase 2 ya
//      adquirido (sin investigación nueva). Si no hay ANTHROPIC_API_KEY,
//      falla limpio con "REQUIERE CREDENCIAL PARA EJECUCIÓN REAL" — nunca se
//      inventa ni se pide una key aquí.
//   2. Si el paso 1 falla por falta de credencial, se corre una demostración
//      OFFLINE con una respuesta SIMULADA (fetchImpl inyectado, etiquetada
//      explícitamente como "SIMULADO") — sirve únicamente para probar que el
//      cableado RAW → LLM → Observación → Inferencia → Hipótesis →
//      IntelligenceStore → exportación funciona de punta a punta. NO es una
//      comparación real de calidad del modelo.
//   3. Comparación real: HeuristicLLMProvider corre de verdad (sin red) sobre
//      los mismos documentos, para contraste de cobertura de dimensiones.
//
// No se hace investigación nueva, no se consulta X/Meta/Reddit, no se usa
// Agent Reach, no se introduce ninguna credencial.

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
import { DIMENSIONS } from './src/taxonomy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase5');

function loadAllStoredRawRecords(rawStore) {
  const rawDir = join(DATA_DIR, 'raw');
  let files = [];
  try { files = readdirSync(rawDir).filter((f) => f.endsWith('.jsonl')); } catch { return []; }
  return files.flatMap((file) => rawStore.loadAll(file.replace(/\.jsonl$/, '')));
}

function simulatedFetch(targetRecord) {
  // Respuesta SIMULADA — no proviene de ningún modelo real. Solo demuestra
  // el cableado. Las evidence_quote se construyen a partir del CONTENIDO
  // REAL del documento elegido (nunca un string hardcodeado de otro
  // documento) — así el filtro anti-invención de AnthropicLLMProvider
  // (evidence_quote debe ser substring literal) se comporta exactamente
  // igual que con una respuesta real, sin importar qué documento se eligió.
  const content = targetRecord.content || '';
  const firstFragment = content.slice(0, 60).trim();
  const titleFragment = (targetRecord.title || '').slice(0, 60).trim();

  const observations = [];
  if (titleFragment) {
    observations.push({ dimension: 'FORMAT', value: 'titulo_detectado', evidence_quote: titleFragment, confidence: 0.6, confidence_basis: 'SIMULADO — coincide con el título del documento' });
  }
  if (firstFragment) {
    observations.push({ dimension: 'HOOK', value: 'apertura_del_contenido', evidence_quote: firstFragment, confidence: 0.5, confidence_basis: 'SIMULADO — primer fragmento del contenido real' });
  }

  return async () => ({
    ok: true,
    json: async () => ({
      stop_reason: 'end_turn',
      usage: { input_tokens: 480, output_tokens: 95 },
      content: [{ type: 'text', text: JSON.stringify({ observations }) }],
    }),
    text: async () => '',
  });
}

async function main() {
  const rawStore = new RawStore(join(DATA_DIR, 'raw'));
  const rawRecords = loadAllStoredRawRecords(rawStore);
  console.log(`--- 0. RAW ya adquirido en la Fase 2 (sin red nueva): ${rawRecords.length} registros ---`);
  if (rawRecords.length === 0) {
    console.log('No hay RAW almacenado. Corre primero `npm run demo` (Fase 2). Deteniendo.');
    return;
  }
  const target = rawRecords.find((r) => r.title) ?? rawRecords[0];
  console.log(`Documento de prueba: [${target.source}] ${target.title ?? target.url}`);

  console.log('\n--- 1. Intento REAL contra la API de Anthropic (1 documento) ---');
  const realProvider = new AnthropicLLMProvider({});
  let llmRealStatus;
  try {
    await realProvider.analyze(target.content, {});
    llmRealStatus = 'LLM REAL EJECUTADO';
    console.log('Modelo usado:', realProvider.model, '| prompt_version:', realProvider.promptVersion);
  } catch (err) {
    llmRealStatus = 'LLM REAL PENDIENTE POR CREDENCIAL';
    console.log('No se pudo ejecutar contra el modelo real:', err.message);
  }

  console.log('\n--- 2. Demostración de cableado end-to-end (respuesta SIMULADA, claramente etiquetada) ---');
  const intelligenceStore = new IntelligenceStore(join(DATA_DIR, 'intelligence'));
  const analysisCache = new AnalysisCache(join(DATA_DIR, 'cache'));
  const costGuard = new CostGuard({ maxLlmBudgetUsd: 1, maxDocumentsPerRun: 5 });
  // apiKey aquí es un placeholder no real: fetchImpl está completamente
  // mockeado (nunca toca la red), así que no hay ninguna credencial real
  // involucrada — solo se necesita un valor no vacío para pasar el guard.
  const simulatedProvider = new AnthropicLLMProvider({ apiKey: 'simulado-no-es-una-credencial-real', fetchImpl: simulatedFetch(target), model: 'claude-opus-5-SIMULADO' });
  const agentWithSimulated = new MarketingIntelligenceAgent({
    provider: simulatedProvider, intelligenceStore, analysisCache, costGuard,
  });

  const simulatedResult = await agentWithSimulated.analyzeRecord(target, { forceReanalyze: true });
  console.log(`Observaciones (simuladas): ${simulatedResult.observations.length}`);
  for (const obs of simulatedResult.observations) {
    console.log(`  [${obs.dimension}] "${obs.evidence_quote}" (confidence ${obs.confidence}, requires_human_review=${obs.requires_human_review}, model=${obs.model})`);
  }
  console.log('Auditoría de costos registrada (simulada):', intelligenceStore.loadAll('cost_audit').length > 0);

  console.log('\n--- 3. Comparación REAL: HeuristicLLMProvider (sin red) sobre el mismo documento ---');
  const heuristicProvider = new HeuristicLLMProvider();
  const heuristicObservations = await heuristicProvider.analyze(target.content, { platform_object_type: target.platform_object_type });
  console.log(`Observaciones (heurística, reales): ${heuristicObservations.length}`);
  for (const obs of heuristicObservations) {
    console.log(`  [${obs.dimension}] "${obs.evidence_quote}" (confidence ${obs.confidence})`);
  }

  const heuristicDims = new Set(heuristicObservations.map((o) => o.dimension));
  const simulatedDims = new Set(simulatedResult.observations.map((o) => o.dimension));
  console.log('\n--- 4. Tabla de comparación (dimensiones detectadas) ---');
  for (const dim of DIMENSIONS) {
    const h = heuristicDims.has(dim) ? 'sí' : 'no';
    const a = simulatedDims.has(dim) ? 'sí (simulado)' : 'no';
    if (h === 'sí' || simulatedDims.has(dim)) console.log(`  ${dim.padEnd(20)} heurística: ${h.padEnd(15)} anthropic: ${a}`);
  }

  console.log('\n--- 5. Exportación ---');
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'comparacion.json'), JSON.stringify({
    estado_llm_real: llmRealStatus,
    documento: { source: target.source, url: target.url, title: target.title },
    heuristico: heuristicObservations,
    anthropic_simulado: simulatedResult.observations,
    cost_audit_simulado: intelligenceStore.loadAll('cost_audit'),
  }, null, 2), 'utf8');
  console.log(`Exportado a: ${EXPORT_DIR}/comparacion.json`);

  console.log(`\n${llmRealStatus}`);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
