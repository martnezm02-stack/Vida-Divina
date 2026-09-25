// signalRecorder.ts — RelevanceDecision -> signals (MI-1), reutilizando
// EXACTAMENTE el mismo upsertSignal() que ya usa MI-4
// (detection/signalDetection.ts) para señales de frecuencia -- ninguna
// tabla nueva, ningún segundo mecanismo de upsert/idempotencia.
//
// Idempotencia: signal_key incluye un fingerprint determinista del
// contenido observable que sustentó la decisión (nunca un timestamp ni un
// contador) -- reprocesar EXACTAMENTE el mismo cambio produce el MISMO
// signal_key y por lo tanto actualiza la MISMA fila (nunca duplica); un
// cambio real distinto más adelante (métricas distintas, campos distintos)
// produce un fingerprint distinto y por lo tanto una signal nueva,
// preservando la trazabilidad de cada evento real.
import { createHash } from "node:crypto";
import { upsertSignal } from "../detection";
import type { Signal } from "../types";
import type { ChangeContext, RelevanceDecision } from "./types";

// upsertSignal() (MI-4) traza items vía la tabla signal_items (join,
// multi-item -- ver detection/signalDetection.ts), NUNCA vía la columna
// signals.item_id (que queda NULL para este tipo de signal). Para
// recuperar la trazabilidad de una signal producida por este módulo, usar
// listItemsForSignal(signal.id) (detection/index.ts), no
// listSignalsForItem(itemId) (que consulta signals.item_id directamente y
// nunca encontraría estas filas).

export const RELEVANCE_SIGNAL_TYPE_PREFIX = "RELEVANCE_";

function fingerprint(context: ChangeContext): string {
  // Solo lo observable que pudo influir en la decisión -- nunca provenance/
  // rationale (texto libre, no determinista entre providers) forma parte
  // del fingerprint.
  const material = JSON.stringify({
    change_type: context.change_type,
    content: context.content,
    updated_fields: context.updated_fields ?? null,
    metrics_observed: context.metrics_observed,
    metrics_delta: context.metrics_delta ?? null,
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

/**
 * Persiste una RelevanceDecision como signal -- IGNORE nunca genera una
 * signal (una categoría "no merece atención" no es, por definición, algo
 * que vigilar). Devuelve null en ese caso, nunca una fila vacía/placeholder.
 */
export function recordRelevanceSignal(context: ChangeContext, decision: RelevanceDecision): Signal | null {
  if (decision.decision === "IGNORE") return null;

  return upsertSignal({
    project_id: context.project.id,
    signal_type: `${RELEVANCE_SIGNAL_TYPE_PREFIX}${context.change_type}`,
    signal_key: `item:${context.item.id}:${fingerprint(context)}`,
    title: `${context.change_type} relevante (${decision.decision}) en item ${context.item.id}${context.actor?.handle ? ` de @${context.actor.handle}` : ""}`,
    description: decision.rationale,
    strength: decision.confidence,
    detected_at: context.provenance.runCheckedAt,
    itemIds: [context.item.id],
    metadata: {
      change_type: context.change_type,
      relevance: decision.decision,
      confidence: decision.confidence,
      provider: decision.provider,
      evidence: decision.evidence,
      provenance: decision.provenance,
      watchlist_id: context.watchlist?.id ?? null,
      source: context.source,
    },
  });
}
