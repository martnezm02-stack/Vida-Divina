// evidenceAssessment.ts — Determina si la evidencia ya existente en el
// Store alcanza para responder una Research Query, o si falta
// cantidad/frescura -- función pura, sin I/O.
import type { IntelligenceItemWithDerived } from "../types";

export interface EvidenceAssessmentOptions {
  minItems: number;
  /** Ventana de frescura en segundos. Ausente = no se exige. */
  freshnessWindowSeconds?: number;
  /** Inyectable para tests deterministas; default Date.now(). */
  now?: number;
}

export interface EvidenceAssessment {
  sufficient: boolean;
  reason: string | null;
  itemCount: number;
  mostRecentLastSeenAt: number | null;
}

export function assessEvidence(
  items: IntelligenceItemWithDerived[],
  options: EvidenceAssessmentOptions
): EvidenceAssessment {
  const itemCount = items.length;
  const mostRecentLastSeenAt = itemCount > 0 ? Math.max(...items.map((i) => i.last_seen_at)) : null;

  if (itemCount < options.minItems) {
    return {
      sufficient: false,
      reason: `Solo se encontraron ${itemCount} item(s) en el Store para esta consulta; se requieren al menos ${options.minItems}.`,
      itemCount,
      mostRecentLastSeenAt,
    };
  }

  if (options.freshnessWindowSeconds !== undefined && mostRecentLastSeenAt !== null) {
    const now = options.now ?? Math.floor(Date.now() / 1000);
    const age = now - mostRecentLastSeenAt;
    if (age > options.freshnessWindowSeconds) {
      return {
        sufficient: false,
        reason: `La evidencia más reciente tiene ${age}s de antigüedad, supera la ventana de frescura configurada (${options.freshnessWindowSeconds}s).`,
        itemCount,
        mostRecentLastSeenAt,
      };
    }
  }

  return { sufficient: true, reason: null, itemCount, mostRecentLastSeenAt };
}
