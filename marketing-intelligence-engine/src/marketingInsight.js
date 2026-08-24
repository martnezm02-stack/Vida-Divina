// marketingInsight.js — Contrato MarketingInsight (Fase 2). Conclusión
// analítica derivada de datos YA existentes (Performance Analysis +
// Attribution) -- nunca una entidad de datos primarios propia.
//
// Fase 2 del encargo pide explícitamente "NO dupliques PerformanceInsight
// si puede extenderse correctamente". No puede: PerformanceInsight
// (content-strategy/src/performanceAnalysis/performanceInsight.js) no
// tiene relatedProductIds/relatedCampaignIds/attributionSummary/
// recommendationReady, y su "confidence" nunca es UNKNOWN (necesario aquí
// para insights comerciales sin evidencia de atribución). MarketingInsight
// es la capa que se sienta ENCIMA de PerformanceInsight y AttributionRecord
// -- casi siempre ENVUELVE uno o combina varios, nunca recalcula patrones
// que Performance Analysis/Attribution ya calcularon (ver
// performanceIntelligence.js, productIntelligence.js, etc.).
//
// confidence reutiliza EXACTAMENTE los dos vocabularios ya existentes en el
// proyecto -- no se crea un tercer modelo:
//   - content-strategy/src/performanceAnalysis/confidence.js -> LOW/MEDIUM/HIGH
//   - attribution-engine/src/attributionConfidence.js -> HIGH/MEDIUM/LOW/UNKNOWN
// La unión de ambos es exactamente HIGH/MEDIUM/LOW/UNKNOWN (Fase 12 del
// encargo). Cada insight usa el nivel que YA trae su fuente (PerformanceInsight
// o AttributionRecord) -- este contrato solo valida que sea uno de los
// cuatro, nunca lo recalcula.

import { randomUUID } from 'node:crypto';

export const MARKETING_CONFIDENCE_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);

const CAUSAL_PHRASES = [/\bcausa\b/i, /\bgarantiza\b/i, /\bhace que\b/i, /\bconvierte mejor\b/i, /\bpor eso funciona\b/i];

function assertNoCausalLanguage(text, field) {
  for (const pattern of CAUSAL_PHRASES) {
    if (pattern.test(text)) {
      throw new Error(`MarketingInsight: "${field}" contiene lenguaje causal prohibido (coincide con ${pattern}) — solo se describe asociación observada, nunca causalidad.`);
    }
  }
}

function assertStringArray(value, field) {
  if (!Array.isArray(value)) throw new Error(`MarketingInsight: "${field}" debe ser un arreglo (puede estar vacío, ej. relatedCampaignIds hoy).`);
}

/**
 * @param {{
 *   scope:string, platform:string|null, category:string, insightType:string,
 *   title:string, summary:string, evidence:object, metrics?:object,
 *   benchmark?:number|null, delta?:number|null, confidence:string,
 *   evidenceCount:number, relatedContentIds:string[], relatedPublicationIds?:string[],
 *   relatedProductIds?:string[], relatedCampaignIds?:string[],
 *   attributionSummary?:object|null, recommendationReady?:boolean, source?:string,
 * }} fields
 */
export function createMarketingInsight(fields) {
  const {
    scope, platform = null, category, insightType, title, summary,
    evidence, metrics = {}, benchmark = null, delta = null,
    confidence, evidenceCount, relatedContentIds,
    relatedPublicationIds = relatedContentIds,
    relatedProductIds = [], relatedCampaignIds = [],
    attributionSummary = null, recommendationReady = true,
    source = 'marketing_intelligence_engine',
  } = fields;

  if (!scope) throw new Error('MarketingInsight: "scope" es obligatorio (ej. "instagram:product=TéDivina (N=6)").');
  if (!category) throw new Error('MarketingInsight: "category" es obligatorio.');
  if (!insightType) throw new Error('MarketingInsight: "insightType" es obligatorio.');
  if (!title) throw new Error('MarketingInsight: "title" es obligatorio.');
  if (!summary) throw new Error('MarketingInsight: "summary" es obligatorio.');
  assertNoCausalLanguage(summary, 'summary');
  if (!evidence || typeof evidence !== 'object') throw new Error('MarketingInsight: "evidence" es obligatorio (objeto) — nunca un insight sin registrar en qué se basó.');
  if (!MARKETING_CONFIDENCE_LEVELS.includes(confidence)) throw new Error(`MarketingInsight: "confidence" inválida "${confidence}" (válidas: ${MARKETING_CONFIDENCE_LEVELS.join(', ')}).`);
  if (typeof evidenceCount !== 'number' || evidenceCount < 1) throw new Error('MarketingInsight: "evidenceCount" debe ser >= 1 — ningún insight sin evidencia real.');
  assertStringArray(relatedContentIds, 'relatedContentIds');
  if (relatedContentIds.length === 0) throw new Error('MarketingInsight: "relatedContentIds" debe ser un arreglo no vacío — trazabilidad hacia PublishedContent real.');
  assertStringArray(relatedPublicationIds, 'relatedPublicationIds');
  assertStringArray(relatedProductIds, 'relatedProductIds');
  assertStringArray(relatedCampaignIds, 'relatedCampaignIds');

  return Object.freeze({
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    scope,
    platform,
    category,
    insightType,
    title,
    summary,
    evidence: Object.freeze({ ...evidence }),
    metrics: Object.freeze({ ...metrics }),
    benchmark,
    delta,
    confidence,
    evidenceCount,
    relatedContentIds: Object.freeze([...relatedContentIds]),
    relatedPublicationIds: Object.freeze([...relatedPublicationIds]),
    relatedProductIds: Object.freeze([...relatedProductIds]),
    relatedCampaignIds: Object.freeze([...relatedCampaignIds]),
    attributionSummary: attributionSummary ? Object.freeze({ ...attributionSummary }) : null,
    // Fase 13 — RECOMMENDATION READY: el dato queda estructurado para que
    // una fase FUTURA (Learning / Strategy Feedback) pueda consumirlo. Esta
    // fase nunca ejecuta ninguna acción a partir de él.
    recommendationReady,
    source,
  });
}

/**
 * Fase 11 — Data Quality / Risk signal. Documenta explícitamente por qué
 * una categoría/scope NO produjo un MarketingInsight, para nunca confundir
 * "no hay evidencia" con "el contenido funciona mal". No se persiste (es
 * parte de la respuesta del servicio, igual que analyzePerformance() ya
 * devuelve status:"INSUFFICIENT_DATA" inline sin crear una entidad nueva).
 */
export function createDataQualitySignal({ category, scope, platform = null, reason, explanation }) {
  if (!category) throw new Error('DataQualitySignal: "category" es obligatorio.');
  if (!reason) throw new Error('DataQualitySignal: "reason" es obligatorio.');
  if (!explanation) throw new Error('DataQualitySignal: "explanation" es obligatorio.');
  return Object.freeze({ category, scope: scope ?? null, platform, reason, explanation });
}
