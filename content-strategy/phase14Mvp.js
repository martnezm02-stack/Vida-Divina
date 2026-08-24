#!/usr/bin/env node
// phase14Mvp.js — Fase 14: diferenciación real + frontera humana real.
//
// Reutiliza las MISMAS 3 fuentes reales de la Fase 13 (marketing-intelligence
// inference, viral-content-intelligence ContentOpportunity,
// performance-learning-intelligence LearningInsight) — el foco de esta fase
// es la DIFERENCIACIÓN entre piezas y la FRONTERA HUMANA, no descubrir
// inteligencia nueva.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

import { createSourceReference } from './src/sourceReference.js';
import { createContentStrategy } from './src/contentStrategy.js';
import { createContentExperiment } from './src/contentExperiment.js';
import { createContentPlan } from './src/contentPlan.js';
import { createContentItem, approveContentItem, markReadyToPublish } from './src/contentItem.js';
import { createContentDraft } from './src/contentDraft.js';
import { RuleBasedContentGenerator } from './src/productionProvider.js';
import { ContentStrategyStore } from './src/store.js';
import { validateContentBatchDiversity } from './src/batchDiversity.js';
import { runQualityGate } from './src/qualityGate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase14');

const PRIMARY_PRODUCT_CONTEXT = {
  product_name: 'TéDivina',
  problem: 'la desintoxicación corporal previa a un programa de pérdida de peso',
  ingredients: ['malva', 'mirra', 'cardo bendito', 'chaga', 'arándano rojo'],
  source_files: ['docs/productos.md', 'docs/productos/01-control-de-peso/tedivina.md'],
};

const EXTERNAL_EXAMPLE_TEXTS = ['Do Detox Teas Really Work?', '14 Day Detox: Fit Tea Review'];

function log(...args) { console.log(...args); }
function loadJsonl(path) { return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(JSON.parse); }

async function main() {
  log('=== FASE 14 — Content Variation + Human Review Gate ===\n');

  // --- 1. Inteligencia real (idéntica a la Fase 13) ---
  const miInferences = loadJsonl(join(ROOT, 'marketing-intelligence', 'data', 'intelligence', 'inferences.jsonl'));
  const hookInference = miInferences.find((i) => i.dimension === 'hook') ?? miInferences[0];
  const viralOpportunities = JSON.parse(readFileSync(join(ROOT, 'viral-content-intelligence', 'exports', 'phase11', 'content-opportunities.json'), 'utf8'));
  const opportunity = viralOpportunities[0];
  const learningInsights = loadJsonl(join(ROOT, 'performance-learning-intelligence', 'exports', 'phase12', 'learning_insights.jsonl'));
  const insight = learningInsights.find((i) => i.direction === 'ABOVE_BASELINE') ?? learningInsights[0];

  const marketRef = createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: hookInference.inference_id, rationale: `Patrón real: ${hookInference.dimension} → "${hookInference.pattern}".` });
  const viralRef = createSourceReference({ source_module: 'viral_content_intelligence', reference_type: 'content_opportunity', reference_id: opportunity.content_opportunity_id, rationale: opportunity.market_pattern.description });
  const learningRef = createSourceReference({ source_module: 'performance_learning_intelligence', reference_type: 'learning_insight', reference_id: insight.insight_id, rationale: `Aprendizaje propio: ${insight.evidence}` });
  const sourceRefs = [marketRef, viralRef, learningRef];

  // --- 2. ContentExperiment (una sola variable: hook) ---
  const experiment = createContentExperiment({
    variable: 'hook', control: 'QUESTION', variant: 'MYTH', success_metric: 'completion_rate',
    hypothesis_reference: insight.insight_id, expected_signal: 'ABOVE_BASELINE',
    sample_requirement: 'Mínimo 5 publicaciones reales adicionales por variante antes de concluir.',
  });

  // --- 3. ContentStrategy ---
  const strategy = createContentStrategy({
    objective: 'Producir piezas educativas genuinamente distintas para TéDivina, combinando mercado + contenido externo + aprendizaje propio.',
    product_ref: PRIMARY_PRODUCT_CONTEXT.product_name,
    content_pillars: ['EDUCATION', 'PRODUCT_CONTEXT', 'PROBLEM_AWARENESS', 'OBJECTION_HANDLING'],
    market_pattern_refs: [marketRef], viral_pattern_refs: [viralRef], learning_refs: [learningRef],
    recommended_hooks: ['priorizar pruebas con hook de pregunta (aprendizaje propio de baja confianza)'],
    experiments: [experiment.experiment_id],
    constraints: ['No copiar frases largas de fuentes externas (PATTERN != COPY).', 'No inventar ingredientes, beneficios, resultados ni estudios.', 'Todo claim externo permanece UNVERIFIED con requires_human_review=true.'],
  });

  const store = new ContentStrategyStore(join(DATA_DIR, 'intelligence'));
  store.save('content_strategy', strategy);
  store.save('content_experiment', experiment);
  const generator = new RuleBasedContentGenerator();

  // --- 4. Batch de 5 — combinación ÚNICA hook+angle+format en cada pieza,
  // ≥3 hooks, ≥2 ángulos, ≥2 formatos, ≥2 pillars (§11) ---
  const BATCH = [
    { platform: 'instagram', format: 'slideshow', hookVariant: 'QUESTION', angle: 'educación', pillar: 'EDUCATION', cta: 'Conoce los ingredientes de TéDivina en el catálogo.' },
    { platform: 'instagram', format: 'short_video', hookVariant: 'MYTH', angle: 'comparación', pillar: 'PRODUCT_CONTEXT', cta: 'Descubre qué SÍ declara el catálogo de TéDivina.' },
    { platform: 'youtube_shorts', format: 'static', hookVariant: 'PROBLEM', angle: 'problema', pillar: 'PROBLEM_AWARENESS', cta: 'Lee más sobre la etapa previa en el catálogo.' },
    { platform: 'youtube_shorts', format: 'slideshow', hookVariant: 'EDUCATIONAL', angle: 'mecanismo', pillar: 'EDUCATION', cta: 'Conoce los ingredientes de TéDivina en el catálogo.' },
    { platform: 'instagram', format: 'short_video', hookVariant: 'CONTRAST', angle: 'comparación', pillar: 'OBJECTION_HANDLING', cta: 'Compara con tus propias dudas antes de decidir.' },
  ].slice(0, 5);

  const items = [];
  const drafts = [];
  log(`--- Generando ${BATCH.length} ContentItems + ContentDrafts (combinaciones únicas hook+angle+format) ---`);
  for (const spec of BATCH) {
    const item = createContentItem({
      platform: spec.platform, format: spec.format, pillar: spec.pillar,
      objective: strategy.objective, hook: spec.hookVariant, angle: spec.angle,
      core_message: `Comunicar, con hechos reales del catálogo, la etapa de ${PRIMARY_PRODUCT_CONTEXT.problem} (ángulo: ${spec.angle}).`,
      structure: `estructura de formato "${spec.format}"`,
      cta: spec.cta,
      product_ref: strategy.product_ref,
      source_references: sourceRefs,
      experiment_id: experiment.experiment_id,
      production_status: 'DRAFT',
    });

    const generated = generator.generate({
      hookVariant: spec.hookVariant, angle: spec.angle, format: spec.format, pillar: spec.pillar, objective: strategy.objective,
      productContext: PRIMARY_PRODUCT_CONTEXT, externalExampleTexts: EXTERNAL_EXAMPLE_TEXTS,
    });

    const draft = createContentDraft({
      content_item: item, hook: generated.hook, body: generated.body, scene_structure: generated.scene_structure,
      caption: generated.hook, cta: spec.cta, generation_method: generated.generation_method,
      externalExampleTexts: EXTERNAL_EXAMPLE_TEXTS,
    });

    items.push(item);
    drafts.push(draft);
    log(`  [${spec.platform}/${spec.format}/${spec.hookVariant}/${spec.angle}/${spec.pillar}] "${generated.hook}"`);
  }

  // --- 5. Diversidad del batch (§7) ---
  const pieces = items.map((item, i) => ({ item, draft: drafts[i] }));
  const diversity = validateContentBatchDiversity(pieces);
  log(`\n--- Diversidad del batch: ${diversity.valid ? 'VÁLIDA' : 'INVÁLIDA'} ---`);
  for (const v of diversity.violations) log(`  ✗ ${v.check}: ${v.detail}`);
  if (!diversity.valid) throw new Error('El batch no pasó la validación de diversidad — no se continúa hacia revisión humana.');

  // --- 6. Quality Gate por pieza (§15) — condición para pasar a REVIEW_REQUIRED ---
  log('\n--- Quality Gate por pieza ---');
  for (let i = 0; i < items.length; i++) {
    const gate = runQualityGate({ item: items[i], draft: drafts[i], externalExampleTexts: EXTERNAL_EXAMPLE_TEXTS, batchDiversityResult: diversity });
    log(`  pieza ${i + 1}: ${gate.passed ? 'PASA' : 'FALLA'}${gate.failures.length ? ' — ' + gate.failures.join('; ') : ''}`);
    if (!gate.passed) throw new Error(`Quality gate falló para la pieza ${i + 1} — no se continúa.`);
  }

  // Todas las piezas que pasan el gate avanzan a REVIEW_REQUIRED — la máquina
  // nunca las lleva más allá por sí misma.
  const reviewItems = items.map((item) => ({ ...item, production_status: 'REVIEW_REQUIRED' }));
  for (const item of reviewItems) store.save('content_item', item);
  for (const draft of drafts) store.save('content_draft', draft);

  const plan = createContentPlan({
    product_ref: strategy.product_ref, objective: strategy.objective, content_pillars: strategy.content_pillars,
    experiments: [experiment.experiment_id], content_items: reviewItems.map((i) => i.content_item_id), source_references: sourceRefs,
  });
  store.save('content_plan', plan);

  // --- 7. Human Review REAL (§12): SOLO la pieza 0 avanza; las otras 4 quedan REVIEW_REQUIRED ---
  log('\n--- Human Review real: aprobando SOLO la pieza 1 de 5 ---');
  const approvedItem = approveContentItem(reviewItems[0], { approved_by: 'humano_revisor_demo_fase14' });
  const readyItem = markReadyToPublish(approvedItem);
  store.save('content_item', readyItem); // se guarda el estado final (append-only: el historial completo queda en el store)

  log(`  pieza 1: ${readyItem.production_status} (approved_by: ${readyItem.approved_by})`);
  for (let i = 1; i < reviewItems.length; i++) log(`  pieza ${i + 1}: ${reviewItems[i].production_status} (sin acción humana — permanece en revisión)`);

  // --- 8. Trazabilidad completa de la pieza aprobada ---
  const readyDraft = drafts[0];
  log('\n--- Trazabilidad de la pieza aprobada ---');
  log(`  READY_TO_PUBLISH: ContentItem ${readyItem.content_item_id}`);
  log(`  → ContentDraft ${readyDraft.draft_id}`);
  log(`  → ContentPlan ${plan.plan_id}`);
  log(`  → Strategy ${strategy.strategy_id}`);
  log(`  → Experiment ${experiment.experiment_id} (variable:${experiment.variable})`);
  for (const ref of readyItem.source_references) log(`    → [${ref.source_module}] ${ref.reference_id} — ${ref.rationale}`);

  // --- 9. Exportación ---
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'content_strategy.json'), JSON.stringify(strategy, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content_experiment.json'), JSON.stringify(experiment, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content_plan.json'), JSON.stringify(plan, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content_items.json'), JSON.stringify([readyItem, ...reviewItems.slice(1)], null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content_drafts.json'), JSON.stringify(drafts, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'diversity_report.json'), JSON.stringify(diversity, null, 2), 'utf8');

  const summary = {
    items_count: items.length,
    unique_hook_variants: [...new Set(BATCH.map((b) => b.hookVariant))].length,
    unique_angles: [...new Set(BATCH.map((b) => b.angle))].length,
    unique_formats: [...new Set(BATCH.map((b) => b.format))].length,
    unique_pillars: [...new Set(BATCH.map((b) => b.pillar))].length,
    batch_diversity_valid: diversity.valid,
    final_statuses: [readyItem.production_status, ...reviewItems.slice(1).map((i) => i.production_status)],
    approved_by: readyItem.approved_by,
    generation_method: 'rule_based_template',
    llm_real_used: false,
    published: false,
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(EXPORT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  log(`\n--- Exportado a: ${EXPORT_DIR} ---`);
  log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
