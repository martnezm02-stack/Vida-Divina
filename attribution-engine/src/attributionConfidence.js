// attributionConfidence.js — Fase 12. El proyecto YA tiene un
// confidence.js (content-strategy/src/performanceAnalysis/confidence.js,
// Performance Analysis Engine) pero clasifica un dominio distinto —
// consistencia estadística de un patrón de PERFORMANCE contra un
// benchmark (evidenceCount + delta%). La confianza de ATRIBUCIÓN depende
// de la CALIDAD del vínculo comercial encontrado, no de una muestra
// estadística — por eso es una regla nueva, deliberadamente simple y
// determinista, no una extensión de aquella. Nunca se presenta como
// probabilidad estadística (§12 del encargo).

export const ATTRIBUTION_CONFIDENCE_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);

const STRONG_SIGNALS = Object.freeze(['trackingId', 'ctaId', 'utm', 'explicitEvent']);

/**
 * @param {{attributionType: 'DIRECT'|'INDIRECT'|'ASSISTED'|'UNKNOWN', evidence: object}} params
 */
export function classifyAttributionConfidence({ attributionType, evidence = {} }) {
  if (attributionType === 'UNKNOWN') return 'UNKNOWN';

  const strongSignalCount = STRONG_SIGNALS.filter((f) => evidence[f]).length;

  if (attributionType === 'DIRECT') {
    // Dos o más señales directas coincidentes (ej. trackingId Y utm) —
    // identificadores redundantes que se refuerzan entre sí.
    return strongSignalCount >= 2 ? 'HIGH' : 'MEDIUM';
  }
  if (attributionType === 'ASSISTED') return 'MEDIUM'; // evidencia parcial pero consistente (campaignId compartido)
  return 'LOW'; // INDIRECT — señal estructural débil (solo coincidencia de producto)
}
