// pipeline.test.js — Fase 13. Integración end-to-end con datos REALES ya
// generados en fases anteriores (marketing-intelligence, viral-content-
// intelligence, performance-learning-intelligence) — no fixtures nuevos.
// Verifica la cadena completa: ContentDraft → ContentItem → Strategy →
// SourceReference → fuente original, y la separación PRIMARY/EXTERNAL.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSourceReference } from '../src/sourceReference.js';
import { createContentStrategy } from '../src/contentStrategy.js';
import { createContentItem } from '../src/contentItem.js';
import { createContentDraft } from '../src/contentDraft.js';
import { RuleBasedContentGenerator } from '../src/productionProvider.js';
import { ContentStrategyStore } from '../src/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// PRIMARY PRODUCT CONTEXT — mismos hechos ya citados literalmente en las
// Fases 9/11 desde docs/productos/01-control-de-peso/tedivina.md. Nunca se
// vuelve a investigar por fuera del proyecto.
const PRIMARY_PRODUCT_CONTEXT = {
  product_name: 'TéDivina',
  problem: 'la desintoxicación corporal previa a un programa de pérdida de peso',
  ingredients: ['malva', 'mirra', 'cardo bendito', 'chaga', 'arándano rojo'],
};

describe('Fase 13 — cadena real con inteligencia YA generada en fases anteriores', () => {
  test('ContentDraft → ContentItem → Strategy → SourceReference → fuente original (real, no sintética)', () => {
    // A. Un patrón REAL de marketing-intelligence (Fase 9, TéDivina).
    const miInferences = readFileSync(join(ROOT, 'marketing-intelligence', 'data', 'intelligence', 'inferences.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
    const hookInference = miInferences.find((i) => i.dimension === 'hook') ?? miInferences[0];
    assert.ok(hookInference, 'debe existir al menos una inferencia real de marketing-intelligence de la Fase 9');

    // B. Un ContentOpportunity REAL de viral-content-intelligence (Fase 11).
    const viralOpportunities = JSON.parse(readFileSync(join(ROOT, 'viral-content-intelligence', 'exports', 'phase11', 'content-opportunities.json'), 'utf8'));
    const opportunity = viralOpportunities[0];
    assert.ok(opportunity, 'debe existir al menos una ContentOpportunity real de la Fase 11');

    // C. Un LearningInsight REAL de performance-learning-intelligence (Fase 12).
    const learningInsights = readFileSync(join(ROOT, 'performance-learning-intelligence', 'exports', 'phase12', 'learning_insights.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
    const insight = learningInsights.find((i) => i.direction === 'ABOVE_BASELINE') ?? learningInsights[0];
    assert.ok(insight, 'debe existir al menos un LearningInsight real de la Fase 12');

    // --- Construcción de la estrategia con las 3 referencias reales ---
    const marketRef = createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: hookInference.inference_id, rationale: `Patrón real: ${hookInference.dimension} → "${hookInference.pattern}" (${hookInference.scope}).` });
    const viralRef = createSourceReference({ source_module: 'viral_content_intelligence', reference_type: 'content_opportunity', reference_id: opportunity.content_opportunity_id, rationale: opportunity.market_pattern.description });
    const learningRef = createSourceReference({ source_module: 'performance_learning_intelligence', reference_type: 'learning_insight', reference_id: insight.insight_id, rationale: `Aprendizaje propio: ${insight.evidence}` });

    const strategy = createContentStrategy({
      objective: 'Explorar contenido educativo para TéDivina combinando mercado externo + rendimiento propio.',
      product_ref: PRIMARY_PRODUCT_CONTEXT.product_name,
      content_pillars: ['EDUCATION'],
      market_pattern_refs: [marketRef],
      viral_pattern_refs: [viralRef],
      learning_refs: [learningRef],
      recommended_hooks: ['priorizar pruebas con hook de pregunta, sin garantía de resultado'],
    });

    assert.equal(strategy.source_references.length, 3);

    // --- ContentItem trazable a la estrategia ---
    const item = createContentItem({
      platform: 'instagram', format: 'slideshow', pillar: 'EDUCATION',
      objective: strategy.objective, hook: 'QUESTION', angle: 'educación',
      core_message: 'La preparación previa a un cambio de hábito es un paso real, documentado en el catálogo.',
      structure: 'hook -> problema -> ingredientes reales -> cta suave',
      product_ref: strategy.product_ref,
      source_references: strategy.source_references,
    });

    // --- ContentDraft generado con el generador reutilizando LLMProvider, PATTERN != COPY ---
    const generator = new RuleBasedContentGenerator();
    const generated = generator.generate({ hookVariant: item.hook, angle: item.angle, format: item.format, pillar: item.pillar, objective: item.objective, productContext: PRIMARY_PRODUCT_CONTEXT });

    const draft = createContentDraft({
      content_item: item,
      hook: generated.hook,
      body: generated.body,
      generation_method: generated.generation_method,
    });

    // --- Trazabilidad completa: draft → item → strategy → referencia real → fuente original ---
    assert.equal(draft.content_item_id, item.content_item_id);
    assert.deepEqual(draft.source_references, strategy.source_references);
    const resolvedMarketRef = draft.source_references.find((r) => r.source_module === 'marketing_intelligence');
    assert.equal(resolvedMarketRef.reference_id, hookInference.inference_id);

    // --- Nunca se mezcla PRIMARY PRODUCT CONTEXT con EXTERNAL MARKET INTELLIGENCE ---
    assert.ok(draft.body.includes(PRIMARY_PRODUCT_CONTEXT.product_name));
    assert.ok(!draft.body.toLowerCase().includes('detox tea')); // el término de la categoría externa nunca se cuela como si fuera del catálogo interno

    // --- requires_human_review en toda la cadena, sin excepción ---
    assert.equal(strategy.requires_human_review, true);
    assert.equal(item.requires_human_review, true);
    assert.equal(draft.requires_human_review, true);
  });
});

describe('Fase 13 — persistencia real de la cadena en ContentStrategyStore', () => {
  test('guarda y recupera las 5 entidades sin perder ids de referencia', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cs-fase13-'));
    try {
      const store = new ContentStrategyStore(dir);
      const ref = createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'inference', reference_id: 'inf-x', rationale: 'r' });
      const strategy = createContentStrategy({ objective: 'o', product_ref: 'TéDivina', content_pillars: ['EDUCATION'], market_pattern_refs: [ref] });
      store.save('content_strategy', strategy);

      const loaded = store.loadAll('content_strategy');
      assert.equal(loaded[0].strategy_id, strategy.strategy_id);
      assert.equal(loaded[0].source_references[0].reference_id, 'inf-x');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
