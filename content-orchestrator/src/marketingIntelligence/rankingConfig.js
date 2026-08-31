// rankingConfig.js — Marketing Intelligence: única fuente de pesos de
// ranking (sección 14 del encargo: "no repartir pesos por múltiples
// archivos"). Cambiar el ranking de TODO el módulo significa editar
// SOLO este archivo.
//
// intelligenceScore = relevance*relevanceWeight + confidence*confidenceWeight
//   + recency*recencyWeight + signalStrength*signalStrengthWeight
//   + productFit*productFitWeight
// (cada componente ya normalizado a 0..1 antes de aplicar el peso -- ver
// ranking.js). Los 5 pesos suman 1.0 por diseño, no por casualidad.

export const marketingIntelligenceRankingConfig = Object.freeze({
  relevanceWeight: 0.30,
  confidenceWeight: 0.25,
  recencyWeight: 0.15,
  signalStrengthWeight: 0.15,
  productFitWeight: 0.15,
});
