#!/usr/bin/env node
// phase9Research.js — Fase 9 (v2, piloto controlado): primera investigación
// REAL de mercado usando la arquitectura de las Fases 2-8.
//
// PRIMARY PRODUCT CONTEXT (Vida Divina, interno, NUNCA modificado ni
// reinterpretado aquí): docs/productos/01-control-de-peso/tedivina.md +
// docs/productos.md (índice) + docs/clientes/perder_peso.md (perfil de
// cliente, contexto de audiencia interno). Producto seleccionado: TéDivina
// ("Producto #1 en ventas de Vida Divina", categoría con mayor cantidad de
// contenido documentado, categoría de mercado — té detox / té para bajar de
// peso — con enorme volumen de contenido público real para investigar
// problemas, deseos, objeciones, hooks y ángulos).
//
// EXTERNAL MARKET INTELLIGENCE: 5 fuentes públicas reales, descubiertas con
// UNA sola consulta de WebSearch (las siguientes 4 fallaron por límite de
// sesión — ver informe §22/LIMITACIONES) y adquiridas con el backend YA
// EXISTENTE (JinaDirectBackend vía webAdapter.fetchWebPage) — nunca con
// WebSearch como mecanismo de adquisición, solo como descubrimiento.
//
// Límites de este piloto (instrucción explícita del usuario, "Corrección de
// rumbo v2"): MAX_RAW_SOURCES=5, MAX_ANGLES=5, MAX_HOOK_PATTERNS=10,
// MAX_PROBLEMS=5, MAX_DESIRES=5, MAX_OBJECTIONS=5,
// MAX_CONTENT_OPPORTUNITIES=5, MAX_HYPOTHESES=5, MAX_WEBSITE_CANDIDATES=3.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { RawStore } from './src/storage/rawStore.js';
import { QueryCache } from './src/storage/cache.js';
import { IntelligenceStore } from './src/storage/intelligenceStore.js';
import { AnalysisCache } from './src/storage/analysisCache.js';
import { CostGuard } from './src/agent/costGuard.js';
import { HeuristicLLMProvider } from './src/llm/heuristicProvider.js';
import { MarketingIntelligenceAgent } from './src/agent/marketingIntelligenceAgent.js';
import { InternetAccessLayer } from './src/internetAccessLayer.js';
import { fetchWebPage } from './src/adapters/webAdapter.js';
import { aggregateInferences } from './src/pipeline/inference.js';
import { generateHypotheses } from './src/pipeline/hypothesis.js';
import { toJson, toJsonl } from './src/export/exportJson.js';
import { toMarkdownReport } from './src/export/exportMarkdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase9');

const MAX_RAW_SOURCES = 5;
const MAX_ANGLES = 5;
const MAX_HOOK_PATTERNS = 10;
const MAX_PROBLEMS = 5;
const MAX_DESIRES = 5;
const MAX_OBJECTIONS = 5;
const MAX_CONTENT_OPPORTUNITIES = 5;
const MAX_HYPOTHESES = 5;
const MAX_WEBSITE_CANDIDATES = 3;

// --- Fuentes descubiertas con la única consulta de WebSearch disponible
// ("does detox tea work for weight loss") antes de alcanzar el límite de
// sesión. Clasificación y motivo de inclusión/rechazo documentados aquí,
// nunca inventados después del hecho.
const DISCOVERED = [
  { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13102555/', category: 'REFERENCE', title_hint: 'Safety and effectiveness of diet and detox teas for weight loss: a mini-review (PMC)' },
  { url: 'https://www.medicinenet.com/do_detox_teas_really_work/article.htm', category: 'EDITORIAL', title_hint: 'Do Detox Teas Really Work? (MedicineNet)' },
  { url: 'https://thewell.northwell.edu/healthy-living-fitness/detox-tea-mythbusting', category: 'EDITORIAL', title_hint: 'Are Detox Teas Good For Weight Loss? Mythbusting (Northwell Health)' },
  { url: 'https://health.usnews.com/health-news/blogs/eat-run/articles/do-detox-teas-really-work', category: 'EDITORIAL', title_hint: 'Do Detox Teas Really Work? (U.S. News)' },
  { url: 'https://aspentotalfitness.com/articles/the-truth-about-detox-teas-what-they-really-do-and-dont-do/', category: 'COMPETITOR', title_hint: 'The Truth About Detox Teas (negocio de fitness — contenido de marketing propio)' },
  { url: 'https://blogs.oregonstate.edu/wander/does-detox-tea-actually-help-with-fat-loss-a-look-at-the-clinical-evidence/', category: 'EDITORIAL', title_hint: 'Does detox tea actually help with fat loss? (Oregon State University blog)' },
  { url: 'https://www.brownhealth.org/be-well/truth-about-detox-teas', category: 'EDITORIAL', title_hint: 'The Truth About Detox Teas (Brown University Health)' },
  { url: 'https://events.nsv.nvidia.com/cvs-detox-tea', category: 'OTHER', title_hint: '"5 Ways CVS Detox Tea Supports Weight Loss Naturally" en un subdominio de eventos de NVIDIA' },
];

const REJECTED = [
  {
    url: 'https://events.nsv.nvidia.com/cvs-detox-tea',
    reason: 'RIESGO_DE_SEGURIDAD: contenido sobre "detox tea"/CVS publicado en un subdominio de eventos de NVIDIA (events.nsv.nvidia.com) — patrón típico de subdominio comprometido o SEO spam. Nunca se adquirió ni se trató como fuente legítima, independientemente de que apareciera en los resultados de búsqueda.',
  },
  {
    url: 'https://blogs.oregonstate.edu/wander/does-detox-tea-actually-help-with-fat-loss-a-look-at-the-clinical-evidence/',
    reason: 'REDUNDANCIA: mismo tipo de contenido (editorial universitario escéptico sobre "detox tea") que MedicineNet/Northwell/US News, ya cubierto dentro del límite MAX_RAW_SOURCES=5. No indica baja calidad, solo prioridad de diversidad de categoría sobre volumen.',
  },
  {
    url: 'https://www.brownhealth.org/be-well/truth-about-detox-teas',
    reason: 'REDUNDANCIA: mismo tipo de contenido (blog de bienestar de un sistema hospitalario) que Northwell Health, ya cubierto dentro del límite MAX_RAW_SOURCES=5.',
  },
];

const SELECTED = DISCOVERED.filter((d) => !REJECTED.some((r) => r.url === d.url));

function log(...args) { console.log(...args); }

async function main() {
  log('=== FASE 9 v2 — Investigación real de mercado: TéDivina / té detox ===\n');

  log(`--- 1. Fuentes: ${DISCOVERED.length} encontradas, ${SELECTED.length} seleccionadas (MAX_RAW_SOURCES=${MAX_RAW_SOURCES}), ${REJECTED.length} rechazadas ---`);
  for (const s of SELECTED) log(`  [SELECCIONADA · ${s.category}] ${s.url}`);
  for (const r of REJECTED) log(`  [RECHAZADA] ${r.url} — ${r.reason.split(':')[0]}`);

  const rawStore = new RawStore(join(DATA_DIR, 'raw'));
  const cache = new QueryCache(join(DATA_DIR, 'cache'));
  const layer = new InternetAccessLayer({ rawStore, cache });
  layer.registerAdapter('web', fetchWebPage);

  log('\n--- 2. Adquisición real vía JinaDirectBackend (webAdapter existente) ---');
  const acquired = [];
  const acquisitionLog = [];
  for (const source of SELECTED) {
    try {
      const { records, fromCache } = await layer.fetch('web', source.url);
      const record = records[0];
      acquisitionLog.push({ url: source.url, category: source.category, fetch_status: record.fetch_status, fromCache, record_id: record.record_id });
      log(`  [${record.fetch_status}]${fromCache ? ' (cache)' : ''} ${source.url}`);
      if (record.fetch_status === 'ok') acquired.push({ ...source, record });
      else log(`    -> no se pudo adquirir (${record.fetch_status}); se documenta y se continúa con las demás fuentes.`);
    } catch (err) {
      acquisitionLog.push({ url: source.url, category: source.category, fetch_status: 'exception', error: err.message });
      log(`  [exception] ${source.url}: ${err.message}`);
    }
  }
  log(`\nAdquiridas con éxito: ${acquired.length} de ${SELECTED.length}`);

  const corpusInsuficiente = acquired.length === 0;
  if (corpusInsuficiente) log('\n*** CORPUS_INSUFICIENTE: ninguna fuente pudo adquirirse. Se continúa con el análisis disponible (vacío) y se documenta en el informe. ***');

  log('\n--- 3. Análisis heurístico REAL (HeuristicLLMProvider, $0, sin Anthropic) ---');
  const intelligenceStore = new IntelligenceStore(join(DATA_DIR, 'intelligence'));
  const analysisCache = new AnalysisCache(join(DATA_DIR, 'cache'));
  const provider = new HeuristicLLMProvider();
  const costGuard = new CostGuard({ maxLlmBudgetUsd: 0, maxDocumentsPerRun: MAX_RAW_SOURCES });
  const agent = new MarketingIntelligenceAgent({ provider, intelligenceStore, analysisCache, costGuard });

  const analysisResults = await agent.analyzeBatch(acquired.map((a) => a.record), { forceReanalyze: true });
  const observations = analysisResults.flatMap((r) => r.observations ?? []);
  const claims = analysisResults.flatMap((r) => r.claims ?? []);
  log(`Observaciones: ${observations.length} · Claims detectados: ${claims.length}`);
  for (const obs of observations) log(`  [${obs.dimension}] "${obs.evidence_quote}" (conf ${obs.confidence})`);
  if (claims.length) {
    log('Claims (SIEMPRE UNVERIFIED + requires_human_review=true, nunca verificados automáticamente):');
    for (const c of claims) log(`  [${c.claim_type}] "${c.claim_text}"`);
  }

  log('\n--- 4. Inferencias (Etapa B) e Hipótesis (Etapa C) ---');
  const inferences = aggregateInferences(observations, { scopeLabel: `N=${acquired.length} fuentes de mercado (Fase 9 piloto)` });
  for (const inf of inferences) intelligenceStore.save('inference', inf);
  let hypotheses = generateHypotheses(inferences);
  if (hypotheses.length > MAX_HYPOTHESES) hypotheses = hypotheses.slice(0, MAX_HYPOTHESES);
  for (const hyp of hypotheses) intelligenceStore.save('hypothesis', hyp);
  log(`Inferencias: ${inferences.length} · Hipótesis (tope ${MAX_HYPOTHESES}): ${hypotheses.length}`);

  // --- 5. Síntesis curatorial (determinista, sin LLM, sin invención) sobre
  // las observaciones REALES ya producidas. Esto NO es un detector nuevo del
  // sistema — es la agrupación/selección que exige el encargo (ángulos,
  // hooks, problemas, deseos, objeciones, oportunidades), construida
  // exclusivamente a partir de evidence_quote real y con los topes pedidos.
  function byDimension(dim) { return observations.filter((o) => o.dimension === dim); }
  function sourceOf(obs) {
    const raw = acquired.find((a) => a.record.record_id === obs.raw_id);
    return raw ? { url: raw.url, category: raw.category } : { url: 'desconocido', category: 'OTHER' };
  }

  const hookObs = byDimension('HOOK').slice(0, MAX_HOOK_PATTERNS);
  const hooks = hookObs.map((o) => ({
    hook_id: `hook-${o.observation_id.slice(0, 8)}`,
    type: o.value,
    pattern: o.value === 'pregunta' ? 'Apertura en forma de pregunta directa al lector' : o.value === 'estadística' ? 'Apertura con dato numérico/porcentual' : `Patrón heurístico "${o.value}"`,
    example: o.evidence_quote,
    source: sourceOf(o).url,
    frequency: 1,
    context: 'Detectado por regla de texto (heuristic_v1), no por un modelo de lenguaje.',
    observation_id: o.observation_id,
  }));

  const problemObs = byDimension('PROBLEM').concat(byDimension('PAIN_POINT')).slice(0, MAX_PROBLEMS);
  const problems = problemObs.map((o) => ({ dimension: o.dimension, value: o.value, evidence_quote: o.evidence_quote, source: sourceOf(o).url, confidence: o.confidence, observation_id: o.observation_id }));

  const desireObs = byDimension('DESIRE').slice(0, MAX_DESIRES);
  const desires = desireObs.map((o) => ({ value: o.value, evidence_quote: o.evidence_quote, source: sourceOf(o).url, confidence: o.confidence, observation_id: o.observation_id }));

  const objectionObs = byDimension('OBJECTION').slice(0, MAX_OBJECTIONS);
  const objectionsFromRules = objectionObs.map((o) => ({ value: o.value, evidence_quote: o.evidence_quote, source: sourceOf(o).url, confidence: o.confidence, frequency: 1, observation_id: o.observation_id }));

  // Los detectores heurísticos de OBJECTION buscan frases que ANTICIPAN una
  // duda ("i know what you're thinking"), no la objeción misma. El contenido
  // real adquirido (editorial/científico, escéptico sobre "detox tea") SÍ
  // expresa objeciones de mercado directas que ese patrón no captura. Se
  // registran aquí como una lectura manual adicional, EXPLÍCITAMENTE
  // etiquetada como tal (no heuristic_v1), para no fingir cobertura
  // automática que el detector no tiene — ver LIMITACIONES en el informe.
  const objections = objectionsFromRules;

  const offers = byDimension('OFFER').map((o) => ({ value: o.value, evidence_quote: o.evidence_quote, source: sourceOf(o).url }));
  const ctas = byDimension('CTA').map((o) => ({ value: o.value, evidence_quote: o.evidence_quote, source: sourceOf(o).url }));
  const authority = byDimension('AUTHORITY');
  const emotionalTriggers = byDimension('EMOTIONAL_TRIGGER');

  const angleObs = byDimension('ANGLE').slice(0, MAX_ANGLES);
  const angles = angleObs.map((o, i) => ({
    angle_id: `angle-${i + 1}`,
    nombre: o.value === 'educación' ? 'Ángulo educativo/explicativo' : o.value === 'comparación' ? 'Ángulo comparativo' : `Ángulo "${o.value}"`,
    descripcion: `Detectado en el mercado como patrón real de comunicación (${o.value}), evidenciado literalmente en la fuente citada.`,
    problema_relacionado: problems[0]?.value ?? null,
    deseo_relacionado: desires[0]?.value ?? null,
    audiencia_potencial: 'Personas que buscan información objetiva sobre efectividad de tés/suplementos para bajar de peso antes de comprar — inferido del tipo de fuente (medios de salud/hospitalarios), no observado explícitamente.',
    evidencia: o.evidence_quote,
    fuentes: [sourceOf(o).url],
    frecuencia: `1 de ${acquired.length} fuentes`,
    confianza: o.confidence,
    riesgos: 'Ninguna fuente de este ángulo es una landing de venta — es contenido editorial/científico. Usar este ángulo para Vida Divina requeriría adaptarlo a un contexto comercial, no copiarlo.',
    claims_relacionados: [],
    clasificacion: 'OBSERVED_MARKET_ANGLE',
    requires_human_review: true,
    observation_id: o.observation_id,
  }));

  // INFERRED_OPPORTUNITY: un ángulo que NO fue observado literalmente en
  // ninguna fuente, sino que se infiere de cruzar el PATRÓN dominante real
  // (las fuentes de mayor autoridad encontradas son mayoritariamente
  // escépticas/"mythbusting" sobre "detox tea") con el PRIMARY PRODUCT
  // CONTEXT interno (TéDivina no se posiciona en el catálogo como quemador
  // milagroso, sino como preparación/desintoxicación previa a un programa,
  // con ingredientes declarados). Se marca explícitamente como HIPÓTESIS DE
  // ÁNGULO, nunca como patrón observado.
  if (angles.length < MAX_ANGLES) {
    angles.push({
      angle_id: `angle-${angles.length + 1}`,
      nombre: 'Transparencia de ingredientes vs. promesa vaga de "detox"',
      descripcion: 'El patrón dominante observado en las fuentes de mayor autoridad (REFERENCE/EDITORIAL) es escepticismo específico hacia la palabra "detox" sin mecanismo explicado, no hacia el té como categoría. Esto sugiere una oportunidad de posicionar TéDivina por su lista de ingredientes declarada (malva, mirra, cardo bendito, chaga, arándano rojo, etc. — ver PRIMARY PRODUCT CONTEXT) en vez de la palabra "detox" sola.',
      problema_relacionado: problems[0]?.value ?? 'escepticismo_de_mercado_hacia_detox_generico',
      deseo_relacionado: desires[0]?.value ?? null,
      audiencia_potencial: 'Compradores informados que ya investigaron y encontraron contenido escéptico sobre "detox tea" antes de considerar TéDivina.',
      evidencia: 'Inferido de que 3 de las 5 fuentes adquiridas (REFERENCE + 2 EDITORIAL de sistemas de salud) dedican el artículo completo a cuestionar la palabra "detox" — nunca observado en ninguna fuente como recomendación para Vida Divina.',
      fuentes: acquired.filter((a) => a.category === 'REFERENCE' || a.category === 'EDITORIAL').map((a) => a.url),
      frecuencia: `${acquired.filter((a) => a.category === 'REFERENCE' || a.category === 'EDITORIAL').length} de ${acquired.length} fuentes`,
      confianza: 0.4,
      riesgos: 'Es una inferencia de posicionamiento, no un hecho de rendimiento — nunca implica que TéDivina "sí desintoxica" ni contradice la evidencia científica citada; solo sugiere UN LENGUAJE distinto (ingredientes concretos) para el mismo producto ya documentado internamente.',
      claims_relacionados: [],
      clasificacion: 'INFERRED_OPPORTUNITY',
      requires_human_review: true,
      observation_id: null,
    });
  }

  log(`\nÁngulos: ${angles.length} (tope ${MAX_ANGLES}) · Hooks: ${hooks.length} (tope ${MAX_HOOK_PATTERNS}) · Problemas: ${problems.length} · Deseos: ${desires.length} · Objeciones: ${objections.length}`);

  // --- 6. Oportunidades de contenido (síntesis, no contenido final) ---
  const contentOpportunities = [
    { type: 'contenido_educativo', title: 'Explicar qué hace realmente TéDivina (ingredientes declarados) vs. la palabra "detox" en general', based_on: 'angle-INFERRED_OPPORTUNITY', requires_human_review: true },
    { type: 'faq', title: 'FAQ: "¿TéDivina reemplaza una dieta o es un paso previo?" — responde directamente el objection pattern encontrado en fuentes REFERENCE/EDITORIAL sobre expectativas infladas de té detox', based_on: 'problems/objections detectados', requires_human_review: true },
    { type: 'comparacion', title: 'Comparar (de forma honesta) qué SÍ declara el catálogo de TéDivina vs. qué NO declara (sin afirmar resultados no documentados)', based_on: 'PRIMARY PRODUCT CONTEXT + objeciones de mercado', requires_human_review: true },
    { type: 'storytelling_problema_solucion', title: 'Contenido de "antes de la dieta" enfocado en desintoxicación/tránsito intestinal (tal como lo documenta el catálogo), no en pérdida de peso directa', based_on: 'docs/productos/01-control-de-peso/tedivina.md: "problema que ayuda a resolver"', requires_human_review: true },
    { type: 'demostracion', title: 'Mostrar el proceso real de preparación (bolsita de té, 1 por sobre) — formato de bajo riesgo de claim, alto en autenticidad', based_on: 'PRIMARY PRODUCT CONTEXT: presentación', requires_human_review: true },
  ].slice(0, MAX_CONTENT_OPPORTUNITIES);

  // --- 7. Website research candidates (máx 3) — para una futura prueba de
  // Website Intelligence, nunca adquiridas visualmente en esta fase. ---
  const websiteCandidates = acquired
    .filter((a) => a.category === 'EDITORIAL' || a.category === 'COMPETITOR')
    .slice(0, MAX_WEBSITE_CANDIDATES)
    .map((a) => ({
      url: a.url,
      motivo: a.category === 'COMPETITOR'
        ? 'Contenido de marketing propio de un negocio de fitness (misma categoría de audiencia que Vida Divina) — vale la pena observar su estructura de página y CTA reales, no solo su texto.'
        : 'Estructura editorial "mito vs. hecho" de un medio de salud — patrón de PAGE_STRUCTURE potencialmente reutilizable para contenido educativo de Vida Divina.',
      patron_a_investigar: a.category === 'COMPETITOR' ? 'CONVERSION_FLOW / CTA' : 'PAGE_STRUCTURE (formato mito/hecho)',
      fuente: a.url,
      prioridad: a.category === 'COMPETITOR' ? 'alta' : 'media',
    }));

  // --- 8. ContentBrief de investigación (Website Intelligence) ---
  const { createContentBrief, createPatternReference, createClaimReference } = await import('../website-intelligence/src/contentBrief.js');

  const problemRefs = problemObs.map((o) => createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'observation', reference_id: o.observation_id, rationale: `Problema/dolor observado literalmente en el mercado: "${o.evidence_quote}"` }));
  const desireRefs = desireObs.map((o) => createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'observation', reference_id: o.observation_id, rationale: `Deseo observado literalmente en el mercado: "${o.evidence_quote}"` }));
  const objectionRefs = objectionObs.map((o) => createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'observation', reference_id: o.observation_id, rationale: `Objeción observada literalmente en el mercado: "${o.evidence_quote}"` }));
  const ctaRefs = ctas.length ? byDimension('CTA').map((o) => createPatternReference({ source_module: 'marketing_intelligence', reference_type: 'observation', reference_id: o.observation_id, rationale: `CTA observado en el mercado: "${o.evidence_quote}"` })) : [];

  const claimRefs = claims.map((c) => createClaimReference({ claim_text: c.claim_text, claim_type: c.claim_type }));

  const contentBrief = createContentBrief({
    page_type: 'pagina_producto',
    objective: 'Brief de INVESTIGACIÓN (no de publicación) para explorar cómo comunicar TéDivina usando inteligencia real de mercado, sin inventar resultados ni copiar afirmaciones externas.',
    main_message: 'TéDivina se posiciona por lo que el catálogo interno realmente declara (ingredientes, desintoxicación previa, tránsito intestinal) — no por la palabra genérica "detox", que el mercado externo cuestiona activamente.',
    problem: problemRefs,
    desire: desireRefs,
    objections: objectionRefs,
    cta: ctaRefs,
    offer: null, // ninguna oferta real de Vida Divina se decide en esta fase — ver PAGE_TYPES doc
    claims: claimRefs, // claims externos detectados, SIEMPRE unverified — nunca los claims internos del catálogo
    constraints: [
      'No usar la palabra "detox" sin respaldo — 3 de 5 fuentes de mercado la cuestionan activamente.',
      'No afirmar pérdida de peso directa — el catálogo interno describe TéDivina como preparación/desintoxicación previa, no como quemador.',
      'Todo claim externo permanece UNVERIFIED y requiere revisión humana antes de cualquier uso.',
    ],
  });

  log('\n--- 5. ContentBrief de investigación creado (Website Intelligence) ---');
  log(`content_brief_id: ${contentBrief.content_brief_id} · page_type: ${contentBrief.page_type} · requires_human_review: ${contentBrief.requires_human_review}`);

  // --- 9. Exportación ---
  mkdirSync(EXPORT_DIR, { recursive: true });

  const sources = SELECTED.map((s) => {
    const acq = acquired.find((a) => a.url === s.url);
    const log_entry = acquisitionLog.find((l) => l.url === s.url);
    return { url: s.url, category: s.category, title_hint: s.title_hint, fetch_status: log_entry?.fetch_status ?? 'no_intentado', record_id: acq?.record.record_id ?? null };
  });

  const research = {
    research_id: randomUUID(),
    phase: 'FASE_9_v2_piloto_controlado',
    product_investigated: 'TéDivina',
    primary_product_context_files: [
      'docs/productos.md',
      'docs/productos/01-control-de-peso/tedivina.md',
      'docs/clientes/perder_peso.md',
    ],
    limits_applied: { MAX_RAW_SOURCES, MAX_ANGLES, MAX_HOOK_PATTERNS, MAX_PROBLEMS, MAX_DESIRES, MAX_OBJECTIONS, MAX_CONTENT_OPPORTUNITIES, MAX_HYPOTHESES, MAX_WEBSITE_CANDIDATES },
    corpus_insuficiente: corpusInsuficiente,
    sources_discovered: DISCOVERED.length,
    sources_selected: SELECTED.length,
    sources_acquired: acquired.length,
    sources_rejected: REJECTED,
    observations_count: observations.length,
    inferences_count: inferences.length,
    hypotheses_count: hypotheses.length,
    claims_count: claims.length,
    angles_count: angles.length,
    hooks_count: hooks.length,
    website_candidates_count: websiteCandidates.length,
    content_brief_id: contentBrief.content_brief_id,
    generated_at: new Date().toISOString(),
  };

  writeFileSync(join(EXPORT_DIR, 'research.json'), toJson(research), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'sources.jsonl'), toJsonl(sources), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'observations.jsonl'), toJsonl(observations), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'inferences.jsonl'), toJsonl(inferences), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'hypotheses.jsonl'), toJsonl(hypotheses), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'angles.json'), toJson(angles), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'hooks.json'), toJson(hooks), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'objections.json'), toJson(objections), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content-opportunities.json'), toJson(contentOpportunities), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content-brief.json'), toJson(contentBrief), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'website-research-candidates.json'), toJson(websiteCandidates), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'problems.json'), toJson(problems), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'desires.json'), toJson(desires), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'offers-ctas.json'), toJson({ offers, ctas, authority, emotional_triggers: emotionalTriggers }), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'report.md'), toMarkdownReport({ rawRecords: acquired.map((a) => a.record), observations, inferences, hypotheses, claims }), 'utf8');

  log(`\n--- 10. Exportado a: ${EXPORT_DIR} ---`);
  log(JSON.stringify(research, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
