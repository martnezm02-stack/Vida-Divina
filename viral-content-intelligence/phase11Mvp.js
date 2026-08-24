#!/usr/bin/env node
// phase11Mvp.js — Fase 11: primer MVP de Viral Content Intelligence.
//
// VIDEO → PERFORMANCE_SIGNAL → TRANSCRIPT → OBSERVATIONS → PATTERNS →
// HYPOTHESES → CONTENT OPPORTUNITY → ORIGINAL VIDA DIVINA CONTENT BRIEF.
//
// Reutiliza SIN MODIFICAR: RawStore, IntelligenceStore, AnalysisCache,
// CostGuard, HeuristicLLMProvider, MarketingIntelligenceAgent,
// aggregateInferences, generateHypotheses, exportJson (marketing-intelligence)
// y createContentBrief/createPatternReference/createClaimReference/
// traceReference (website-intelligence). Solo se crea código nuevo para lo
// que genuinamente no existía: PERFORMANCE_SIGNAL y ContentOpportunity.
//
// Eficiencia deliberada: se reutilizan los 5 videos YA descubiertos y
// verificados en la Fase 10 (misma categoría: detox/weight-loss tea) en vez
// de hacer una nueva consulta de WebSearch — ya cumplen el criterio de
// diversidad pedido (views: 631 a 474,512; 5 canales distintos; formatos
// distintos) y evita una investigación redundante (§15 del encargo).

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MI_ROOT = join(__dirname, '..', 'marketing-intelligence');
const WI_ROOT = join(__dirname, '..', 'website-intelligence');

const { RawStore } = await import(`${toFileUrl(join(MI_ROOT, 'src/storage/rawStore.js'))}`);
const { IntelligenceStore } = await import(toFileUrl(join(MI_ROOT, 'src/storage/intelligenceStore.js')));
const { AnalysisCache } = await import(toFileUrl(join(MI_ROOT, 'src/storage/analysisCache.js')));
const { CostGuard } = await import(toFileUrl(join(MI_ROOT, 'src/agent/costGuard.js')));
const { HeuristicLLMProvider } = await import(toFileUrl(join(MI_ROOT, 'src/llm/heuristicProvider.js')));
const { MarketingIntelligenceAgent } = await import(toFileUrl(join(MI_ROOT, 'src/agent/marketingIntelligenceAgent.js')));
const { fetchYouTubeVideo } = await import(toFileUrl(join(MI_ROOT, 'src/adapters/youtubeAdapter.js')));
const { YouTubeTranscriptApiBackend } = await import(toFileUrl(join(MI_ROOT, 'src/acquisition/youtube/youtubeTranscriptApiBackend.js')));
const { aggregateInferences } = await import(toFileUrl(join(MI_ROOT, 'src/pipeline/inference.js')));
const { generateHypotheses } = await import(toFileUrl(join(MI_ROOT, 'src/pipeline/hypothesis.js')));
const { toJson, toJsonl } = await import(toFileUrl(join(MI_ROOT, 'src/export/exportJson.js')));

const { createContentBrief, createPatternReference, createClaimReference } = await import(toFileUrl(join(WI_ROOT, 'src/contentBrief.js')));
const { traceReference } = await import(toFileUrl(join(WI_ROOT, 'src/traceability.js')));

const { createPerformanceSignalObservation } = await import('./src/performanceSignal.js');
const { createContentOpportunity } = await import('./src/contentOpportunity.js');

function toFileUrl(p) { return 'file://' + p.replace(/\\/g, '/'); }

const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase11');
const MAX_VIDEOS = 5;

// El venv aislado ya autorizado en las Fases 10C/10D/10E — nunca instalado de
// nuevo, nunca reutilizado dentro del entorno del proyecto por defecto. Se
// configura aquí SOLO por configuración (como ya se hizo en la Fase 10E),
// nunca ampliando la infraestructura de adquisición.
const SCRATCHPAD_PYTHON = 'C:/Users/manue/AppData/Local/Temp/claude/C--Users-manue-Vida-Divina/33ff00f7-3194-47ef-8de7-7128a40506e9/scratchpad/venv-yta-test/Scripts/python.exe';

// --- PRIMARY_PRODUCT_CONTEXT — información oficial interna de Vida Divina,
// citada literalmente de docs/productos/01-control-de-peso/tedivina.md y
// docs/productos.md. NUNCA se mezcla con EXTERNAL_MARKET_INTELLIGENCE ni se
// vuelve a investigar por fuera del proyecto.
const PRIMARY_PRODUCT_CONTEXT = {
  source_files: ['docs/productos.md', 'docs/productos/01-control-de-peso/tedivina.md', 'docs/clientes/perder_peso.md'],
  product: 'TéDivina',
  objetivo_principal: 'Limpiar mente y cuerpo como base para iniciar un estilo de vida saludable.',
  problema_que_ayuda_a_resolver: 'Necesidad de desintoxicación corporal antes de comenzar un programa de pérdida de peso; tránsito intestinal lento.',
  ingredientes_principales: ['malva', 'mirra', 'cardo bendito', 'malvavisco', 'papaya', 'chaga', 'arándano rojo', 'cardo santo', 'manzanilla', 'hojas de caqui', 'fibra soluble', 'ganoderma', 'jengibre'],
  presentacion: 'Bolsitas de té, 3 oz / 50 mg, 1 bolsita por sobre.',
  posicion_en_ventas: 'Producto #1 en ventas de Vida Divina (dato del propio catálogo).',
};

// --- Los 5 videos ya descubiertos/verificados en Fase 10 — reutilizados
// deliberadamente (ver nota de eficiencia arriba). Diversidad ya confirmada:
// views 631–474,512; 5 canales distintos; formatos distintos (vlog personal,
// review de dietista, formato "dos presentadoras").
const VIDEOS = [
  'https://www.youtube.com/watch?v=zS3mRtxrMCE',
  'https://www.youtube.com/watch?v=35Fw_hLQJDE',
  'https://www.youtube.com/watch?v=5Juf_goyKnY',
  'https://www.youtube.com/watch?v=T2MtmC3MWVQ',
  'https://www.youtube.com/watch?v=S6scaAQjaGE',
].slice(0, MAX_VIDEOS);

function log(...args) { console.log(...args); }

/**
 * Guarda un RAW record y devuelve SIEMPRE el registro REALMENTE persistido —
 * nunca el objeto recién construido en memoria. Bug real detectado en esta
 * fase: RawStore.save() deduplica por content_hash; si el contenido ya
 * existía (ej. al re-ejecutar el piloto sobre el mismo video), el
 * record_id recién generado NUNCA se escribe — pero seguía usándose para
 * construir observaciones, rompiendo la trazabilidad (raw_id → URL) en
 * cualquier corrida que no fuera la primera. Esta función resuelve siempre
 * al record_id canónico, ya esté recién guardado o ya existiera.
 */
function saveAndResolveCanonical(rawStore, record) {
  const result = rawStore.save(record);
  if (result.stored) return record;
  return rawStore.loadByRecordId(result.existing_record_id);
}

async function main() {
  log('=== FASE 11 — Viral Content Intelligence MVP ===\n');
  log('--- PRIMARY_PRODUCT_CONTEXT (interno, nunca mezclado con lo externo) ---');
  log(`Producto: ${PRIMARY_PRODUCT_CONTEXT.product} — fuentes: ${PRIMARY_PRODUCT_CONTEXT.source_files.join(', ')}`);

  const rawStore = new RawStore(join(MI_ROOT, 'data', 'raw')); // MISMO RawStore de marketing-intelligence — no se duplica
  const transcriptBackend = new YouTubeTranscriptApiBackend({ pythonPath: SCRATCHPAD_PYTHON });

  log(`\n--- 1. Adquisición (máx ${MAX_VIDEOS} videos): metadata (backend directo) + transcript (youtube_transcript_api) ---`);
  const videoRecords = []; // { url, metadataRecord, transcriptRecord, analysisRecord }
  for (const url of VIDEOS) {
    let [metadataRecord] = await fetchYouTubeVideo(url); // backend directo por defecto — metadata real (título/canal/views/duración/fecha)
    metadataRecord = saveAndResolveCanonical(rawStore, metadataRecord);

    let transcriptRecord = null;
    try {
      [transcriptRecord] = await fetchYouTubeVideo(url, { backend: transcriptBackend });
      transcriptRecord = saveAndResolveCanonical(rawStore, transcriptRecord);
    } catch (err) {
      log(`  [excepción en transcript_api] ${url}: ${err.message}`);
    }

    // Boolean(...) es OBLIGATORIO aquí: "a && b && c" en JS devuelve el
    // último operando truthy, NO un booleano — sin este cast, transcriptOk
    // habría quedado con el STRING COMPLETO de la transcripción (bug real
    // detectado y corregido en esta misma fase: contaminaba videos.jsonl,
    // el export que el encargo prohíbe explícitamente que contenga texto
    // completo).
    const transcriptOk = Boolean(transcriptRecord && transcriptRecord.fetch_status === 'ok' && transcriptRecord.content);
    const analysisRecord = transcriptOk ? transcriptRecord : metadataRecord;

    log(`  ${url}`);
    log(`    título: ${metadataRecord.title} · canal: ${metadataRecord.author} · views: ${metadataRecord.metrics?.views ?? 'null'}`);
    log(`    transcript: ${transcriptOk ? `OK (${transcriptRecord.metadata.platform_specific.transcript_type}, ${transcriptRecord.metadata.platform_specific.transcript_language})` : `NO DISPONIBLE (${transcriptRecord?.metadata?.platform_specific?.reason ?? transcriptRecord?.fetch_status ?? 'sin intento'})`}`);

    videoRecords.push({ url, metadataRecord, transcriptRecord, analysisRecord, transcriptOk });
  }

  const acquiredCount = videoRecords.length;
  const withTranscriptCount = videoRecords.filter((v) => v.transcriptOk).length;
  log(`\nAdquiridos: ${acquiredCount}/${VIDEOS.length} · Con transcript real: ${withTranscriptCount}/${VIDEOS.length}`);

  // --- 2. PERFORMANCE_SIGNAL (nunca mezclado con dimensiones de marketing) ---
  log('\n--- 2. PERFORMANCE_SIGNAL (views, OBSERVED_PERFORMANCE_SIGNAL — nunca prueba de causalidad) ---');
  const performanceSignals = [];
  for (const v of videoRecords) {
    try {
      const sig = createPerformanceSignalObservation({
        raw_id: v.metadataRecord.record_id,
        url: v.url,
        metricName: 'views',
        metrics: v.metadataRecord.metrics,
      });
      performanceSignals.push(sig);
      log(`  ${v.url}: views=${sig.metric_value}`);
    } catch (err) {
      log(`  ${v.url}: sin señal de rendimiento verificable (${err.message})`);
    }
  }

  // --- 3. Observaciones de contenido — MarketingIntelligenceAgent reutilizado
  // SIN modificar, con su propio IntelligenceStore/AnalysisCache/CostGuard
  // apuntando a esta carpeta (contabilidad separada de la Fase 9/10, mismas
  // clases). Analiza SOLO el mejor contenido disponible por video (transcript
  // real si existe, si no el título — nunca fabrica texto).
  log('\n--- 3. Observaciones de contenido (taxonomía EXISTENTE de marketing-intelligence, sin duplicar) ---');
  const intelligenceStore = new IntelligenceStore(join(DATA_DIR, 'intelligence'));
  const analysisCache = new AnalysisCache(join(DATA_DIR, 'cache'));
  const provider = new HeuristicLLMProvider();
  const costGuard = new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: MAX_VIDEOS, maxTokensPerDocument: 4000 });
  const agent = new MarketingIntelligenceAgent({ provider, intelligenceStore, analysisCache, costGuard });

  const analysisResults = await agent.analyzeBatch(videoRecords.map((v) => v.analysisRecord), { forceReanalyze: true });
  const observations = analysisResults.flatMap((r) => r.observations ?? []);
  const claims = analysisResults.flatMap((r) => r.claims ?? []); // detectClaims() ya corre DENTRO de analyzeRecord() — reutilizado, no reimplementado.

  log(`Observaciones de contenido: ${observations.length} · Claims (SIEMPRE UNVERIFIED + requires_human_review): ${claims.length}`);
  for (const obs of observations) log(`  [${obs.dimension}] "${obs.evidence_quote}" (conf ${obs.confidence})`);

  // §9: método de detección del "hook inicial" — documentado honestamente.
  // El detector reutilizado (detectHooksAndAngles, sin modificar) mira
  // "título + primeros 200 caracteres del contenido", NO una ventana de
  // tiempo de 30s literal — el pipeline de transcripción actual (Fase 10E)
  // concatena todos los segmentos en un solo texto plano sin conservar los
  // timestamps por segmento, así que no existe hoy una forma de recortar
  // exactamente "los primeros ~30 segundos" del transcript. Limitación real,
  // documentada aquí y en el informe — no se inventó una solución.
  const hookDetectionMethod = 'heurístico existente (marketing-intelligence/src/agent/heuristics/hooksAndAngles.js): título + primeros ~200 caracteres del contenido. NO es una ventana de tiempo de 30s literal — los timestamps por segmento se descartan al construir el texto plano de la transcripción (Fase 10E), así que recortar por tiempo real no es posible con el pipeline actual.';
  log(`\nMétodo de detección de hook/apertura: ${hookDetectionMethod}`);

  // --- 4. Patrones (Etapa B, reutilizada) — SOLO sobre observaciones de
  // contenido, NUNCA sobre performance signals (agrupar "views" por
  // frecuencia no tiene sentido, y el encargo pide mantenerlos separados).
  log('\n--- 4. Patrones (aggregateInferences reutilizado sin modificar) ---');
  const patterns = aggregateInferences(observations, { scopeLabel: 'selected_youtube_sample (N=5, Fase 11)' });
  for (const p of patterns) intelligenceStore.save('inference', p);
  for (const p of patterns) log(`  ${p.dimension} → "${p.pattern}" — frecuencia ${p.frequency} (${p.scope})`);

  // --- 5. Hipótesis (Etapa C, reutilizada) ---
  const hypotheses = generateHypotheses(patterns);
  for (const h of hypotheses) intelligenceStore.save('hypothesis', h);
  log(`\n--- 5. Hipótesis: ${hypotheses.length} (todas requires_review=true) ---`);

  // --- 6. ContentOpportunity: conecta patrón + señal de rendimiento (cuando
  // aplica) + hipótesis + relevancia para Vida Divina (inferencia SEPARADA).
  log('\n--- 6. ContentOpportunity ---');
  const contentOpportunities = [];
  for (const pattern of patterns) {
    const hyp = hypotheses.find((h) => h.based_on_inference_id === pattern.inference_id);
    if (!hyp) continue;

    // Vincula (informativamente, nunca como causa) la señal de rendimiento
    // de UN video que exhibió esta observación, si existe.
    const contributingObs = observations.find((o) => pattern.based_on_observation_ids.includes(o.observation_id));
    const contributingVideo = contributingObs ? videoRecords.find((v) => v.analysisRecord.record_id === contributingObs.raw_id) : null;
    const perfSignal = contributingVideo ? performanceSignals.find((s) => s.url === contributingVideo.url) : null;

    const opportunity = createContentOpportunity({
      market_pattern: { description: `${pattern.dimension} → "${pattern.pattern}" — aparece en ${pattern.based_on_observation_ids.length} de ${observations.length} observaciones de contenido (${pattern.scope}).`, dimension: pattern.dimension, frequency: pattern.frequency, scope: pattern.scope, inference_id: pattern.inference_id },
      performance_signal: perfSignal ? { observation_id: perfSignal.observation_id, metric: 'views', metric_value: perfSignal.metric_value } : null,
      source_observation_ids: pattern.based_on_observation_ids,
      hypothesis: { hypothesis_id: hyp.hypothesis_id, text: hyp.hypothesis },
      vida_divina_relevance: buildVidaDivinaRelevance(pattern),
    });
    contentOpportunities.push(opportunity);
    log(`  ${opportunity.market_pattern.description}`);
  }

  // --- 7. ContentBrief (máx 3, ORIGINALES, vía website-intelligence sin modificar) ---
  log('\n--- 7. ContentBrief (máx 3, originales, sin copiar guiones/CTA/títulos externos) ---');
  const contentBriefs = buildContentBriefs({ contentOpportunities, observations, claims, createContentBrief, createPatternReference, createClaimReference }).slice(0, 3);
  for (const b of contentBriefs) log(`  ${b.content_brief_id}: ${b.main_message}`);

  // --- 8. Trazabilidad real: hypothesis → inference → observation → raw_id → url ---
  log('\n--- 8. Trazabilidad (traceReference de website-intelligence, sin modificar) ---');
  let traceabilityCheck = { status: 'no_hypotheses' };
  if (hypotheses.length > 0) {
    const ref = createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'hypothesis', reference_id: hypotheses[0].hypothesis_id, rationale: 'Verificación de trazabilidad real de la Fase 11.' });
    traceabilityCheck = traceReference(ref, { rawStore, intelligenceStore });
    log(`  status: ${traceabilityCheck.status}${traceabilityCheck.chain ? ` → url: ${traceabilityCheck.chain.url}` : ''}`);
  }

  // --- 9. Exportación (NUNCA transcripciones completas) ---
  mkdirSync(EXPORT_DIR, { recursive: true });

  const videosExport = videoRecords.map((v) => ({
    video_id: v.metadataRecord.metadata.platform_specific.video_id,
    url: v.url,
    title: v.metadataRecord.title,
    channel: v.metadataRecord.author,
    published_at: v.metadataRecord.published_at,
    views: v.metadataRecord.metrics?.views ?? null,
    duration_seconds: v.metadataRecord.metadata.platform_specific.durationSeconds ?? null,
    transcript_available: v.transcriptOk,
    transcript_type: v.transcriptOk ? v.transcriptRecord.metadata.platform_specific.transcript_type : null,
    transcript_language: v.transcriptOk ? v.transcriptRecord.metadata.platform_specific.transcript_language : null,
  }));

  writeFileSync(join(EXPORT_DIR, 'videos.jsonl'), toJsonl(videosExport), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'performance-signals.jsonl'), toJsonl(performanceSignals), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'observations.jsonl'), toJsonl(observations), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'patterns.jsonl'), toJsonl(patterns), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'hypotheses.jsonl'), toJsonl(hypotheses), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content-opportunities.json'), toJson(contentOpportunities), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content-briefs.json'), toJson(contentBriefs), 'utf8');

  const summary = {
    max_videos: MAX_VIDEOS,
    videos_seleccionados: VIDEOS.length,
    videos_adquiridos: acquiredCount,
    videos_con_transcript: withTranscriptCount,
    videos_sin_transcript: acquiredCount - withTranscriptCount,
    tasa_adquisicion_transcript_observada: `${withTranscriptCount}/${acquiredCount}`,
    performance_signals_count: performanceSignals.length,
    observations_count: observations.length,
    claims_count: claims.length,
    patterns_count: patterns.length,
    hypotheses_count: hypotheses.length,
    content_opportunities_count: contentOpportunities.length,
    content_briefs_count: contentBriefs.length,
    hook_detection_method: hookDetectionMethod,
    traceability_check: traceabilityCheck.status,
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(EXPORT_DIR, 'summary.json'), toJson(summary), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'report.md'), buildReportMarkdown({ videosExport, performanceSignals, observations, patterns, hypotheses, contentOpportunities, contentBriefs, summary, claims }), 'utf8');

  log(`\n--- Exportado a: ${EXPORT_DIR} ---`);
  log(JSON.stringify(summary, null, 2));
}

function buildVidaDivinaRelevance(pattern) {
  // Inferencia SEPARADA y explícita — nunca copia la solución del video
  // externo, nunca afirma que el patrón "funciona" para vender TéDivina.
  const base = {
    product_ref: PRIMARY_PRODUCT_CONTEXT.product,
    risk_note: 'Patrón observado en contenido de terceros sobre la categoría "detox tea" en general — no implica que TéDivina deba adoptarlo, ni que produciría el mismo resultado.',
  };
  switch (pattern.dimension) {
    case 'HOOK':
      return { ...base, relation_to_primary_context: `El patrón de apertura "${pattern.pattern}" observado en el mercado podría probarse para presentar el "problema que ayuda a resolver" documentado de TéDivina (desintoxicación previa a un programa de pérdida de peso, tránsito intestinal lento) — como hipótesis a validar, no como copia.` };
    case 'AUDIENCE':
      return { ...base, relation_to_primary_context: `La audiencia observada ("${pattern.pattern}") es consistente con el perfil interno ya documentado en docs/clientes/perder_peso.md — no es un hallazgo nuevo, pero corrobora que el mercado externo se dirige a una audiencia similar.` };
    case 'FORMAT':
      return { ...base, relation_to_primary_context: `El formato "${pattern.pattern}" observado podría orientar el tipo de pieza a producir para TéDivina, sin implicar que ese formato "funcione mejor" — solo que es frecuente en la categoría.` };
    default:
      return { ...base, relation_to_primary_context: `El patrón "${pattern.dimension} → ${pattern.pattern}" es una posible línea de exploración de contenido para TéDivina, a validar con revisión humana antes de cualquier producción real.` };
  }
}

function buildContentBriefs({ contentOpportunities, claims, createContentBrief, createPatternReference, createClaimReference }) {
  return contentOpportunities.slice(0, 3).map((opp, i) => {
    const patternRef = createPatternReference({
      source_module: 'marketing_intelligence', // observaciones/inferencias producidas por el código real de marketing-intelligence (MarketingIntelligenceAgent), aplicado a RAW de YouTube — ver informe §"decisión de diseño".
      reference_type: 'inference',
      reference_id: opp.market_pattern.inference_id,
      rationale: opp.market_pattern.description,
    });
    const hypothesisRef = createPatternReference({
      source_module: 'marketing_intelligence',
      reference_type: 'hypothesis',
      reference_id: opp.hypothesis.hypothesis_id,
      rationale: `Hipótesis a probar, no un hecho: ${opp.hypothesis.text}`,
    });
    const claimRefs = claims.slice(0, 1).map((c) => createClaimReference({ claim_text: c.claim_text, claim_type: c.claim_type, source_claim_id: c.claim_id }));

    return createContentBrief({
      page_type: 'pagina_producto',
      objective: `Brief de INVESTIGACIÓN #${i + 1} — qué probar para TéDivina a partir de un patrón observado en YouTube, nunca qué copiar.`,
      product_ref: PRIMARY_PRODUCT_CONTEXT.product,
      main_message: opp.vida_divina_relevance.relation_to_primary_context,
      desire: [patternRef],
      objections: [],
      cta: [],
      structure_refs: [hypothesisRef],
      claims: claimRefs,
      constraints: [
        'No copiar títulos, guiones, frases largas, estructura palabra por palabra ni CTA literal del contenido externo observado.',
        'No afirmar que el patrón observado "es viral" ni que "garantiza" ningún resultado.',
        `Usar únicamente lo documentado en PRIMARY_PRODUCT_CONTEXT (${PRIMARY_PRODUCT_CONTEXT.source_files.join(', ')}) para cualquier afirmación sobre el producto.`,
      ],
    });
  });
}

function buildReportMarkdown({ videosExport, performanceSignals, observations, patterns, hypotheses, contentOpportunities, contentBriefs, summary, claims }) {
  const lines = [];
  lines.push('# Fase 11 — Viral Content Intelligence MVP', '', `Generado: ${summary.generated_at}`, '');
  lines.push('## Videos seleccionados y adquiridos', '');
  for (const v of videosExport) {
    lines.push(`- **${v.title}** (${v.channel}) — views: ${v.views ?? 'null'} · transcript: ${v.transcript_available ? `${v.transcript_type}/${v.transcript_language}` : 'no disponible'} — [${v.url}](${v.url})`);
  }
  lines.push('', '## Performance signals (OBSERVED_PERFORMANCE_SIGNAL — nunca prueba de causalidad)', '');
  for (const s of performanceSignals) lines.push(`- ${s.url}: ${s.value}=${s.metric_value}`);
  lines.push('', '## Observaciones de contenido', '');
  for (const o of observations) lines.push(`- **${o.dimension}**: "${o.evidence_quote}" (confianza ${o.confidence})`);
  lines.push('', `## Claims detectados (${claims.length}, SIEMPRE UNVERIFIED + requires_human_review)`, '');
  for (const c of claims) lines.push(`- [${c.claim_type}] "${c.claim_text}" — estado: ${c.verification_status}`);
  lines.push('', '## Patrones (frecuencia observada en la muestra, nunca "esto funciona mejor")', '');
  for (const p of patterns) lines.push(`- ${p.dimension} → "${p.pattern}" — frecuencia ${p.frequency} (${p.scope})`);
  lines.push('', '## Hipótesis (especulativas, requieren revisión humana)', '');
  for (const h of hypotheses) lines.push(`- ${h.hypothesis}`);
  lines.push('', '## Content Opportunities', '');
  for (const o of contentOpportunities) lines.push(`- ${o.market_pattern.description} → relevancia Vida Divina: ${o.vida_divina_relevance.relation_to_primary_context}`);
  lines.push('', '## Content Briefs (originales)', '');
  for (const b of contentBriefs) lines.push(`- **${b.content_brief_id}**: ${b.main_message}`);
  lines.push('', '## Resumen', '', '```json', JSON.stringify(summary, null, 2), '```');
  return lines.join('\n') + '\n';
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
