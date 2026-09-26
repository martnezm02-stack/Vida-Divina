// qualificationRecorder.ts — QualificationDecision -> signals (MI-1),
// reutilizando EXACTAMENTE el mismo upsertSignal() que ya usa MI-4 y
// relevance/signalRecorder.ts -- ninguna tabla nueva, ningún segundo
// mecanismo de upsert/idempotencia.
//
// A diferencia de relevance/signalRecorder.ts (que nunca persiste IGNORE),
// aquí SIEMPRE se persiste: RELEVANT/IRRELEVANT/UNCERTAIN son las tres
// igualmente informativas para separar raw evidence de qualified
// intelligence -- no hay una cuarta categoría "sin señal" que omitir.
//
// Idempotencia: signal_type es una constante ESTABLE (nunca incluye la
// decisión -- error real detectado durante la validación: si el
// signal_type cambiara con la decisión, re-calificar un item que cambia
// de categoría entre corridas rompería el upsert-by-(type,key) de
// upsertSignal -- que busca por project_id+signal_type+signal_key -- y
// dejaría una fila vieja huérfana en vez de actualizarla). La decisión
// vive SOLO en metadata.decision. signal_key = "item:<id>" -- re-calificar
// el MISMO item, con cualquier decisión, siempre actualiza la MISMA fila.
import { upsertSignal, listItemsForSignal } from "../detection";
import { listSignalsByProject } from "../signals";
import type { Signal } from "../types";
import type { QualificationContext, QualificationDecision } from "./types";

export const QUALIFICATION_SIGNAL_TYPE = "QUALIFICATION";

export function recordQualificationSignal(context: QualificationContext, decision: QualificationDecision): Signal {
  return upsertSignal({
    project_id: context.project.id,
    signal_type: QUALIFICATION_SIGNAL_TYPE,
    signal_key: `item:${context.item.id}`,
    title: `Qualification: ${decision.decision} (item ${context.item.id}${context.actor?.handle ? `, @${context.actor.handle}` : ""})`,
    description: decision.rationale,
    strength: decision.confidence,
    detected_at: Math.floor(Date.now() / 1000),
    itemIds: [context.item.id],
    metadata: {
      decision: decision.decision,
      confidence: decision.confidence,
      provider: decision.provider,
      evidence: decision.evidence,
      provenance: decision.provenance,
      brand: context.brand.name,
    },
  });
}

/**
 * item_id -> decisión de qualification más reciente, dentro de un
 * proyecto. listSignalsByProject ya ordena por detected_at DESC -- se
 * recorre en ese orden y solo se fija la PRIMERA (más reciente) decisión
 * vista por item, para tolerar cualquier fila duplicada/huérfana que
 * pudiera existir de una corrida anterior con un bug ya corregido.
 */
export function getQualificationByItemId(projectId: number): Map<number, "RELEVANT" | "IRRELEVANT" | "UNCERTAIN"> {
  const signals = listSignalsByProject(projectId).filter((s) => s.signal_type === QUALIFICATION_SIGNAL_TYPE);
  const result = new Map<number, "RELEVANT" | "IRRELEVANT" | "UNCERTAIN">();
  for (const signal of signals) {
    if (!signal.metadata_json) continue;
    let decision: string | undefined;
    try {
      decision = (JSON.parse(signal.metadata_json) as { decision?: string }).decision;
    } catch {
      continue;
    }
    if (decision !== "RELEVANT" && decision !== "IRRELEVANT" && decision !== "UNCERTAIN") continue;
    for (const itemId of listItemsForSignal(signal.id)) {
      if (!result.has(itemId)) result.set(itemId, decision);
    }
  }
  return result;
}
