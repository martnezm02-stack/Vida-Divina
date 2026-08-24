#!/usr/bin/env node
// phase10YoutubeMvp.js — Fase 10: MVP de adquisición + análisis de YouTube.
//
// YouTube → RAW → métricas disponibles → análisis → patrones → ContentBrief.
//
// Reutiliza TAL CUAL (cero modificaciones): contract.js, RawStore,
// IntelligenceStore, AnalysisCache, CostGuard, HeuristicLLMProvider,
// MarketingIntelligenceAgent, aggregateInferences, generateHypotheses,
// untrustedContent.js. Lo único nuevo es la fuente 'youtube' (backend +
// adapter), exactamente como Web/RSS/GitHub ya conviven sin tocarse entre sí.
//
// Descubrimiento: 1 sola consulta de WebSearch ("detox tea weight loss
// youtube video review") — no es un backend de adquisición, solo el mismo
// mecanismo de descubrimiento ya usado en la Fase 9. Las 5 URLs devueltas son
// las únicas usadas — no se inventó ninguna, no se amplió la búsqueda.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { RawStore } from './src/storage/rawStore.js';
import { QueryCache } from './src/storage/cache.js';
import { IntelligenceStore } from './src/storage/intelligenceStore.js';
import { AnalysisCache } from './src/storage/analysisCache.js';
import { CostGuard } from './src/agent/costGuard.js';
import { HeuristicLLMProvider } from './src/llm/heuristicProvider.js';
import { MarketingIntelligenceAgent } from './src/agent/marketingIntelligenceAgent.js';
import { InternetAccessLayer } from './src/internetAccessLayer.js';
import { fetchYouTubeVideo } from './src/adapters/youtubeAdapter.js';
import { aggregateInferences } from './src/pipeline/inference.js';
import { generateHypotheses } from './src/pipeline/hypothesis.js';
import { toJson, toJsonl } from './src/export/exportJson.js';
import { toMarkdownReport } from './src/export/exportMarkdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase10-youtube');

const MAX_VIDEOS = 5;
const MAX_TOKENS_PER_DOCUMENT = 4000; // mismo orden de magnitud que MAX_TRANSCRIPT_CHARS/4 en youtubeAdapter.js

const VIDEOS = [
  'https://www.youtube.com/watch?v=zS3mRtxrMCE', // SkinnyMe Tea Detox Review/Weight Loss Results
  'https://www.youtube.com/watch?v=35Fw_hLQJDE', // Total detox tea review (weight loss journey)
  'https://www.youtube.com/watch?v=5Juf_goyKnY', // Detox Tea For Weight Loss: Dietitian Reviews
  'https://www.youtube.com/watch?v=T2MtmC3MWVQ', // 14 Day Detox: Fit Tea Review
  'https://www.youtube.com/watch?v=S6scaAQjaGE', // Dietitians Try DETOX TEAS for WEIGHT LOSS | TEATOX
].slice(0, MAX_VIDEOS);

function log(...args) { console.log(...args); }

async function main() {
  log('=== FASE 10 — YouTube Content Intelligence MVP ===\n');
  log(`--- 1. Videos a adquirir (máx ${MAX_VIDEOS}): ${VIDEOS.length} ---`);
  for (const v of VIDEOS) log(`  ${v}`);

  const rawStore = new RawStore(join(DATA_DIR, 'raw'));
  const cache = new QueryCache(join(DATA_DIR, 'cache'));
  const layer = new InternetAccessLayer({ rawStore, cache });
  layer.registerAdapter('youtube', fetchYouTubeVideo);

  log('\n--- 2. Adquisición real vía YouTubeTranscriptBackend (sin yt-dlp, sin Whisper, sin login) ---');
  const acquired = [];
  const acquisitionLog = [];
  for (const url of VIDEOS) {
    try {
      const { records, fromCache } = await layer.fetch('youtube', url);
      const record = records[0];
      const ps = record.metadata?.platform_specific ?? {};
      log(`  [${record.fetch_status}]${fromCache ? ' (cache)' : ''} ${url}`);
      log(`    título: ${record.title ?? 'desconocido'} · canal: ${record.author ?? 'desconocido'} · views: ${record.metrics?.views ?? 'null (' + (record.metrics?.views_reason ?? 'sin motivo') + ')'}`);
      log(`    likes: ${record.metrics?.likes ?? 'null'} (${record.metrics?.likes_reason ?? ''})`);
      log(`    comments: ${record.metrics?.comments ?? 'null'} (${record.metrics?.comments_reason ?? ''})`);
      if (ps.transcript_available === false) log(`    transcript: NO DISPONIBLE — ${ps.transcript_reason} · contenido usado para análisis: ${ps.content_source}`);
      else if (ps.transcript_available) log(`    transcript: disponible (${ps.transcript_type}, ${ps.transcript_language}), truncado: ${ps.transcript_truncated}`);

      acquisitionLog.push({ url, fetch_status: record.fetch_status, fromCache, record_id: record.record_id, title: record.title, metrics: record.metrics, transcript_available: ps.transcript_available ?? null, transcript_reason: ps.transcript_reason ?? null });
      if (record.fetch_status === 'ok' || (record.fetch_status === 'partial' && record.content)) acquired.push(record);
    } catch (err) {
      acquisitionLog.push({ url, fetch_status: 'exception', error: err.message });
      log(`  [exception] ${url}: ${err.message}`);
    }
  }
  log(`\nCon transcript utilizable para análisis: ${acquired.length} de ${VIDEOS.length}`);

  log('\n--- 3. Análisis heurístico REAL (HeuristicLLMProvider, $0, taxonomía existente sin modificar) ---');
  const intelligenceStore = new IntelligenceStore(join(DATA_DIR, 'intelligence'));
  const analysisCache = new AnalysisCache(join(DATA_DIR, 'cache'));
  const provider = new HeuristicLLMProvider();
  const costGuard = new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: MAX_VIDEOS, maxTokensPerDocument: MAX_TOKENS_PER_DOCUMENT });
  const agent = new MarketingIntelligenceAgent({ provider, intelligenceStore, analysisCache, costGuard });

  const analysisResults = await agent.analyzeBatch(acquired, { forceReanalyze: true });
  const observations = analysisResults.flatMap((r) => r.observations ?? []);
  const claims = analysisResults.flatMap((r) => r.claims ?? []);
  const skippedTooLong = analysisResults.filter((r) => r.skipped && r.reason === 'max_tokens_per_document_exceeded');
  log(`Observaciones: ${observations.length} · Claims: ${claims.length} · Omitidos por exceder tokens (CostGuard, sin modificar): ${skippedTooLong.length}`);
  for (const obs of observations) log(`  [${obs.dimension}] "${obs.evidence_quote}" (conf ${obs.confidence})`);

  log('\n--- 4. Inferencias e Hipótesis (pipeline existente, sin modificar) ---');
  const inferences = aggregateInferences(observations, { scopeLabel: `N=${acquired.length} videos de YouTube (Fase 10 MVP)` });
  for (const inf of inferences) intelligenceStore.save('inference', inf);
  const hypotheses = generateHypotheses(inferences);
  for (const hyp of hypotheses) intelligenceStore.save('hypothesis', hyp);
  log(`Inferencias: ${inferences.length} · Hipótesis: ${hypotheses.length}`);

  // --- 5. Performance: separación estricta OBSERVADO / SEÑAL DE RENDIMIENTO /
  // INFERENCIA / HIPÓTESIS, tal como exige el encargo. Nunca se llama
  // "viral" a nada aquí — solo se reportan métricas comparables cuando
  // existen, y se documenta explícitamente qué NO se pudo medir.
  const performance = {
    videos: acquired.map((r) => ({
      record_id: r.record_id,
      url: r.url,
      title: r.title,
      basis: 'OBSERVADO',
      metrics_observadas: r.metrics,
    })),
    senal_de_rendimiento: acquired
      .filter((r) => r.metrics?.views_available)
      .map((r) => ({ record_id: r.record_id, url: r.url, views: r.metrics.views }))
      .sort((a, b) => b.views - a.views),
    nota: 'views es la ÚNICA señal de rendimiento realmente disponible en esta corrida (likes/comments no obtenibles sin API oficial). Un mayor view count NUNCA se interpreta aquí como "viral" ni como causa de ningún patrón detectado — ver INFERENCIA/HIPÓTESIS para lo que sí se puede afirmar con evidencia.',
    metricas_faltantes: ['likes', 'comments', 'shares', 'velocidad_de_distribucion (requiere series de tiempo, no una sola captura)'],
  };

  // --- 6. Exportación ---
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'youtube-raw.jsonl'), toJsonl(acquired), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'youtube-observations.jsonl'), toJsonl(observations), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'youtube-inferences.jsonl'), toJsonl(inferences), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'youtube-hypotheses.jsonl'), toJsonl(hypotheses), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'youtube-performance.json'), toJson(performance), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'youtube-report.md'), toMarkdownReport({ rawRecords: acquired, observations, inferences, hypotheses, claims }), 'utf8');

  const summary = {
    videos_intentados: VIDEOS.length,
    videos_con_transcript_utilizable: acquired.length,
    acquisition_log: acquisitionLog,
    observations_count: observations.length,
    claims_count: claims.length,
    inferences_count: inferences.length,
    hypotheses_count: hypotheses.length,
    skipped_too_long: skippedTooLong.length,
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(EXPORT_DIR, 'resumen.json'), toJson(summary), 'utf8');

  log(`\n--- 7. Exportado a: ${EXPORT_DIR} ---`);
  log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
