#!/usr/bin/env node
// phase13Mvp.js — Fase 13: INTELLIGENCE → CONTENT STRATEGY → CONTENT ITEM →
// CONTENT DRAFT → [frontera humana] → READY_TO_PUBLISH (nunca alcanzado
// automáticamente).
//
// Entradas REALES (no fixtures nuevos): 1 patrón de marketing-intelligence
// (Fase 9), 1 ContentOpportunity de viral-content-intelligence (Fase 11),
// 1 LearningInsight de performance-learning-intelligence (Fase 12).
// PRIMARY PRODUCT CONTEXT: mismos hechos citados en las Fases 9/11 desde
// docs/productos/01-control-de-peso/tedivina.md — nunca reinvestigado.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

import { createSourceReference } from './src/sourceReference.js';
import { createContentStrategy } from './src/contentStrategy.js';
import { createContentExperiment } from './src/contentExperiment.js';
import { createContentPlan } from './src/contentPlan.js';
import { createContentItem } from './src/contentItem.js';
import { createContentDraft } from './src/contentDraft.js';
import { RuleBasedContentGenerator } from './src/productionProvider.js';
import { ContentStrategyStore } from './src/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase13');

const PRIMARY_PRODUCT_CONTEXT = {
  product_name: 'TéDivina',
  problem: 'la desintoxicación corporal previa a un programa de pérdida de peso',
  ingredients: ['malva', 'mirra', 'cardo bendito', 'chaga', 'arándano rojo'],
  source_files: ['docs/productos.md', 'docs/productos/01-control-de-peso/tedivina.md'],
};

function log(...args) { console.log(...args); }

function loadJsonl(path) { return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(JSON.parse); }

async function main() {
  log('=== FASE 13 — Content Strategy + Content Production MVP ===\n');
  log(`PRIMARY_PRODUCT_CONTEXT: ${PRIMARY_PRODUCT_CONTEXT.product_name} (fuentes: ${PRIMARY_PRODUCT_CONTEXT.source_files.join(', ')})\n`);

  // --- 1. Cargar inteligencia REAL ya generada (nunca fixtures nuevos) ---
  const miInferences = loadJsonl(join(ROOT, 'marketing-intelligence', 'data', 'intelligence', 'inferences.jsonl'));
  const hookInference = miInferences.find((i) => i.dimension === 'hook') ?? miInferences[0];
  const viralOpportunities = JSON.parse(readFileSync(join(ROOT, 'viral-content-intelligence', 'exports', 'phase11', 'content-opportunities.json'), 'utf8'));
  const opportunity = viralOpportunities[0];
  const learningInsights = loadJsonl(join(ROOT, 'performance-learning-intelligence', 'exports', 'phase12', 'learning_insights.jsonl'));
  const insight = learningInsights.find((i) => i.direction === 'ABOVE_BASELINE') ?? learningInsights[0];

  log('--- 1. Inteligencia real cargada ---');
  log(`  marketing-intelligence: ${hookInference.dimension} → "${hookInference.pattern}" (${hookInference.scope})`);
  log(`  viral-content-intelligence: ${opportunity.market_pattern.description}`);
  log(`  performance-learning-intelligence: ${insight.evidence}`);

  const marketRef = createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: hookInference.inference_id, rationale: `Patrón real de mercado: ${hookInference.dimension} → "${hookInference.pattern}".` });
  const viralRef = createSourceReference({ source_module: 'viral_content_intelligence', reference_type: 'content_opportunity', reference_id: opportunity.content_opportunity_id, rationale: opportunity.market_pattern.description });
  const learningRef = createSourceReference({ source_module: 'performance_learning_intelligence', reference_type: 'learning_insight', reference_id: insight.insight_id, rationale: `Aprendizaje propio (muestra sintética, confianza ${insight.confidence}): ${insight.evidence}` });

  // --- 2. ContentExperiment (una sola variable) ---
  const experiment = createContentExperiment({
    variable: 'hook', control: 'statement', variant: 'question', success_metric: 'completion_rate',
    hypothesis_reference: insight.insight_id, expected_signal: 'ABOVE_BASELINE',
    sample_requirement: 'Mínimo 5 publicaciones reales adicionales por variante antes de concluir.',
  });
  log(`\n--- 2. ContentExperiment: variable="${experiment.variable}" control="${experiment.control}" variant="${experiment.variant}" ---`);

  // --- 3. ContentStrategy ---
  const strategy = createContentStrategy({
    objective: 'Explorar contenido educativo original para TéDivina combinando un patrón de mercado, un patrón de contenido externo y aprendizaje propio — nunca copiando ninguno de los tres.',
    product_ref: PRIMARY_PRODUCT_CONTEXT.product_name,
    content_pillars: ['EDUCATION', 'PRODUCT_CONTEXT'],
    market_pattern_refs: [marketRef],
    viral_pattern_refs: [viralRef],
    learning_refs: [learningRef],
    recommended_formats: ['slideshow', 'talking_head'],
    recommended_hooks: ['priorizar pruebas con hook de pregunta (aprendizaje propio de baja confianza, muestra sintética)'],
    recommended_angles: ['educación', 'transparencia de ingredientes'],
    experiments: [experiment.experiment_id],
    constraints: [
      'No copiar títulos, guiones ni frases largas de fuentes externas (PATTERN != COPY).',
      'No inventar ingredientes, beneficios, resultados, certificaciones ni estudios no documentados en el catálogo.',
      'Todo claim externo permanece UNVERIFIED con requires_human_review=true.',
    ],
  });
  log(`\n--- 3. ContentStrategy creada: ${strategy.strategy_id} ---`);
  log(`  objective: ${strategy.objective}`);
  log(`  source_references: ${strategy.source_references.length} (1 por módulo)`);

  // --- 4. Batch de ContentItems (§14: máx 5, 2 formatos, 2 hooks, 2 ángulos) ---
  const BATCH = [
    { platform: 'instagram', format: 'slideshow', hook: 'pregunta', angle: 'educación' },
    { platform: 'instagram', format: 'talking_head', hook: 'pregunta', angle: 'transparencia de ingredientes' },
    { platform: 'youtube_shorts', format: 'slideshow', hook: 'estadística', angle: 'educación' },
    { platform: 'youtube_shorts', format: 'talking_head', hook: 'estadística', angle: 'transparencia de ingredientes' },
    { platform: 'instagram', format: 'slideshow', hook: 'pregunta', angle: 'transparencia de ingredientes' },
  ].slice(0, 5);

  const generator = new RuleBasedContentGenerator();
  const store = new ContentStrategyStore(join(DATA_DIR, 'intelligence'));
  store.save('content_strategy', strategy);
  store.save('content_experiment', experiment);

  // Ejemplo textual REAL de la fuente externa que inspiró el patrón "pregunta"
  // (Fase 9/11: "Do Detox Teas Really Work?") — se pasa al generador
  // EXCLUSIVAMENTE para que el guard PATTERN != COPY pueda verificar que el
  // resultado NUNCA lo reproduce, nunca para que el generador lo use como
  // insumo de redacción.
  const EXTERNAL_EXAMPLE_TEXT = 'Do Detox Teas Really Work?';

  const items = [];
  const drafts = [];
  log(`\n--- 4. Generando ${BATCH.length} ContentItems + ContentDrafts ---`);
  for (const spec of BATCH) {
    const item = createContentItem({
      platform: spec.platform, format: spec.format, pillar: 'EDUCATION',
      objective: strategy.objective, hook: spec.hook, angle: spec.angle,
      core_message: `Comunicar, con hechos reales del catálogo, la etapa de ${PRIMARY_PRODUCT_CONTEXT.problem}.`,
      structure: 'hook -> problema -> ingredientes reales -> cta suave',
      cta: 'Conoce más sobre TéDivina en el catálogo oficial.',
      product_ref: strategy.product_ref,
      source_references: strategy.source_references,
      experiment_id: experiment.experiment_id,
      production_status: 'DRAFT',
    });
    store.save('content_item', item);
    items.push(item);

    const generated = generator.generate({ patternName: spec.hook, productContext: PRIMARY_PRODUCT_CONTEXT, angle: spec.angle, externalExampleText: EXTERNAL_EXAMPLE_TEXT });
    const draft = createContentDraft({
      content_item: item,
      hook: generated.hook,
      body: generated.body,
      caption: generated.hook,
      generation_method: generated.generation_method,
      externalExampleTexts: [EXTERNAL_EXAMPLE_TEXT],
    });
    store.save('content_draft', draft);
    drafts.push(draft);

    log(`  [${spec.platform}/${spec.format}/hook:${spec.hook}] "${generated.hook}"`);
  }

  // --- 5. ContentPlan (agrupa los items del batch) ---
  const plan = createContentPlan({
    product_ref: strategy.product_ref, objective: strategy.objective, content_pillars: strategy.content_pillars,
    experiments: [experiment.experiment_id], content_items: items.map((i) => i.content_item_id),
    source_references: strategy.source_references,
  });
  store.save('content_plan', plan);
  log(`\n--- 5. ContentPlan: ${plan.content_items.length} items agrupados ---`);

  // --- 6. Trazabilidad de ejemplo: "¿por qué fue creado?" para el primer draft ---
  const exampleDraft = drafts[0];
  const exampleItem = items[0];
  log(`\n--- 6. Trazabilidad de ejemplo (draft[0]) ---`);
  log(`  ContentDraft ${exampleDraft.draft_id}`);
  log(`  → ContentItem ${exampleItem.content_item_id} (hook:${exampleItem.hook}, angle:${exampleItem.angle})`);
  log(`  → Strategy ${strategy.strategy_id}`);
  for (const ref of exampleDraft.source_references) log(`    → [${ref.source_module}] ${ref.reference_id} — ${ref.rationale}`);

  // --- 7. Exportación ---
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'content_strategy.json'), JSON.stringify(strategy, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content_experiment.json'), JSON.stringify(experiment, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content_plan.json'), JSON.stringify(plan, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content_items.json'), JSON.stringify(items, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'content_drafts.json'), JSON.stringify(drafts, null, 2), 'utf8');

  const summary = {
    strategy_id: strategy.strategy_id,
    plan_id: plan.plan_id,
    items_count: items.length,
    drafts_count: drafts.length,
    all_production_status: [...new Set(items.map((i) => i.production_status))],
    max_status_reached: 'DRAFT', // nunca REVIEW_REQUIRED/APPROVED/READY_TO_PUBLISH en este script automático
    generation_method: 'rule_based_template',
    llm_real_used: false,
    primary_product_context: PRIMARY_PRODUCT_CONTEXT.product_name,
    external_sources_referenced: strategy.source_references.length,
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
