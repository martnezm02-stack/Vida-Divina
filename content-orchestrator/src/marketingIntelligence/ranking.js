// ranking.js — Marketing Intelligence: intelligenceScore determinista
// (sección 13 del encargo). Etiqueta relativa para ORDENAR resultados
// existentes, no una métrica científica -- nunca se presenta como
// probabilidad de éxito real ni se usa para autorizar nada por sí sola.

import { classifySignalStaleness } from './staleness.js';
import { marketingIntelligenceRankingConfig } from './rankingConfig.js';
import { PRODUCT_CATEGORY, PRODUCT_SPECIFIC_CATEGORIES } from './productCatalog.js';

export const SIGNAL_STRENGTH_SCORE = Object.freeze({ HIGH: 1.0, MEDIUM: 0.6, LOW: 0.3 });

// GENERAL se usa dos veces con sentido distinto: como fit real de una señal
// transversal (sección 18), y como valor NEUTRO por defecto cuando la
// consulta no tiene un producto objetivo (no hay "ajuste" que evaluar).
export const PRODUCT_FIT_SCORE = Object.freeze({
  DIRECT_PRODUCT: 1.0, CATEGORY: 0.6, GENERAL: 0.3, NOT_RELEVANT: 0,
});

export const STALENESS_RECENCY_SCORE = Object.freeze({ ACTIVE: 1.0, STALE: 0.5, ARCHIVED: 0.15 });

/**
 * Determina la relación entre una señal y un producto SIN inventar
 * ninguna relación que no exista en los datos (sección 18):
 *  - DIRECT_PRODUCT: la señal ya tiene ese productId exacto.
 *  - CATEGORY: la señal no tiene productId, pero su category coincide con
 *    la categoría de ese producto (ej. una tendencia de "café funcional"
 *    aplica a los 4 productos de la categoría cafe-divina).
 *  - GENERAL: la señal es transversal por diseño (sin productId, y su
 *    category -si tiene- no es una de las 5 categorías específicas de
 *    producto -- ej. regulatorio, marca, contenido-hooks).
 *  - NOT_RELEVANT: la señal pertenece a OTRO producto u OTRA categoría
 *    específica de producto -- se excluye, nunca se fuerza una relación.
 */
export function determineProductFit(signal, productId) {
  if (!productId) return 'GENERAL';
  if (signal.productId) return signal.productId === productId ? 'DIRECT_PRODUCT' : 'NOT_RELEVANT';

  const productCategory = PRODUCT_CATEGORY[productId] ?? null;
  if (!signal.category) return 'GENERAL';
  if (signal.category === productCategory) return 'CATEGORY';
  if (PRODUCT_SPECIFIC_CATEGORIES.includes(signal.category)) return 'NOT_RELEVANT';
  return 'GENERAL';
}

/**
 * intelligenceScore en [0, 1], determinista: mismos inputs -> mismo
 * resultado siempre (no hay aleatoriedad ni llamada externa). `now` es
 * inyectable para tests reproducibles.
 */
export function computeIntelligenceScore(signal, { productId = null, now = Date.now() } = {}) {
  const weights = marketingIntelligenceRankingConfig;

  const productFit = productId ? determineProductFit(signal, productId) : 'GENERAL';
  const relevance = productId ? PRODUCT_FIT_SCORE[productFit] : 1; // sin producto objetivo, la relevancia ya la decidió el filtro previo.
  const confidence = signal.confidence; // NUNCA se recalcula -- viene ya fijado por evidenceLevel (schema.js).
  const staleness = classifySignalStaleness(signal, now);
  const recency = STALENESS_RECENCY_SCORE[staleness];
  const signalStrength = SIGNAL_STRENGTH_SCORE[signal.signalStrength] ?? SIGNAL_STRENGTH_SCORE.LOW;
  const productFitScore = PRODUCT_FIT_SCORE[productFit] ?? PRODUCT_FIT_SCORE.GENERAL;

  const score = (
    relevance * weights.relevanceWeight
    + confidence * weights.confidenceWeight
    + recency * weights.recencyWeight
    + signalStrength * weights.signalStrengthWeight
    + productFitScore * weights.productFitWeight
  );

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

/** Orden determinista: score descendente, empate por título ascendente (nunca por orden de inserción en disco). */
export function compareByScoreThenTitle(a, b) {
  return (b.intelligenceScore - a.intelligenceScore) || a.title.localeCompare(b.title);
}
