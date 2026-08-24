// store.js — PerformanceLearningStore (Fase 12, §10).
//
// Append-only JSONL, un archivo por tipo. Deliberadamente NO reutiliza
// IntelligenceStore de marketing-intelligence: aunque la forma de la clase
// es análoga, las entidades son conceptualmente distintas (contenido PROPIO
// de Vida Divina, no RAW de terceros) — mismo criterio que website-intelligence
// usó en la Fase 8 para justificar su propio WebsiteRawStore en vez de
// reutilizar el RawStore de marketing-intelligence. Nunca se mezcla con
// ningún otro store existente.
//
// Trazabilidad completa garantizada por construcción: cada tipo posterior
// en la cadena SIEMPRE lleva el/los id(s) del tipo anterior (content_id en
// todos, performance_observation_id en signals, signal_id/insight_id en las
// etapas siguientes) — nunca se pierde el content_id de origen.

import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = Object.freeze({
  published_content: 'published_content.jsonl',
  performance_observation: 'performance_observations.jsonl',
  performance_signal: 'performance_signals.jsonl',
  learning_insight: 'learning_insights.jsonl',
  learning_hypothesis: 'learning_hypotheses.jsonl',
  // attribution_record — Attribution Engine (Fase 7 del roadmap de negocio).
  // Reutiliza este mismo store append-only en vez de crear un
  // AttributionStore paralelo (regla explícita de esa fase: "no crear
  // storage duplicado, extender el existente").
  attribution_record: 'attribution_records.jsonl',
  // marketing_insight — Marketing Intelligence Engine (Fase 8 del roadmap de
  // negocio, §15: "REGLA CRÍTICA: reutiliza PerformanceLearningStore... NO
  // crear otro storage independiente"). Misma regla ya aplicada a
  // attribution_record arriba.
  marketing_insight: 'marketing_insights.jsonl',
  // learning_record / strategy_feedback — Learning & Strategy Feedback
  // Engine (Fase 9 del roadmap de negocio, §16: misma regla de reutilizar
  // este store en vez de crear LearningStore/StrategyStore/RecommendationStore
  // paralelos). NO es lo mismo que "learning_insight" (arriba, Fase 12):
  // learning_insight es una entidad CURADA manualmente (evidence/pattern
  // redactados por un humano/proceso externo, ver
  // performance-learning-intelligence/src/learningInsight.js); learning_record
  // es MECÁNICA (generada automáticamente por learning-strategy-engine/ a
  // partir de MarketingInsight/PerformanceInsight/AttributionRecord ya
  // existentes) -- mismo criterio de no-duplicación ya documentado en
  // marketing-intelligence-engine/src/marketingInsight.js para
  // PerformanceInsight vs MarketingInsight. Ambas conviven, nunca se
  // mezclan.
  learning_record: 'learning_records.jsonl',
  strategy_feedback: 'strategy_feedback.jsonl',
  // content_plan — Content Planning & Execution (Fase 12 del roadmap de
  // negocio, §12: "reutilizar PerformanceLearningStore... NO crear
  // ContentPlanStore separado"). NO es el mismo ContentPlan que
  // content-strategy/src/contentPlan.js (Fase 13 de ese módulo, otro store
  // -- ContentStrategyStore): ese exige content_items/content_pillars ya
  // creados en el pipeline paralelo ContentStrategy->ContentItem->
  // ContentDraft, nunca conectado al Content Generation Engine real. Este
  // ContentPlan es el de la fase 12: conecta StrategyDecision real ->
  // buildCreativeProposal real (content-orchestrator) -> ejecución, mismo
  // criterio de no-duplicación ya aplicado a learning_record vs
  // learning_insight en la Fase 9.
  content_plan: 'content_plans.jsonl',
  // strategy_decision — Strategy Decision Engine (Fase 10 del roadmap de
  // negocio, §20: misma regla de reutilizar este store en vez de crear
  // StrategyDecisionStore). Evalúa StrategyFeedback (arriba) con reglas
  // determinísticas y produce ACCEPT/REJECT/DEFER -- nunca ejecuta la
  // decisión (executionStatus siempre "NOT_EXECUTED" en esta fase).
  strategy_decision: 'strategy_decisions.jsonl',
  // auto_publish_config — Real Asset Generation + Controlled Auto-Publish
  // (Fase 13 del roadmap de negocio, Parte 6: "única fuente de verdad...
  // NO duplicar en varios módulos"). Append-only: cada activación/
  // desactivación agrega un registro nuevo (nunca muta el anterior) --
  // "actual" = el más reciente por createdAt. Esto da auditoría completa
  // gratis (quién activó/desactivó y cuándo, Parte 22) sin un mecanismo
  // aparte.
  auto_publish_config: 'auto_publish_configs.jsonl',
});

export class PerformanceLearningStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
  }

  _path(kind) {
    if (!FILES[kind]) throw new Error(`PerformanceLearningStore: tipo desconocido "${kind}" (válidos: ${Object.keys(FILES).join(', ')})`);
    return join(this.baseDir, FILES[kind]);
  }

  save(kind, entry) {
    appendFileSync(this._path(kind), JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  }

  loadAll(kind) {
    const path = this._path(kind);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  }
}
