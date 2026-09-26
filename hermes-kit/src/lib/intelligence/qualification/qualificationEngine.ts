// qualificationEngine.ts — evaluateContentQualification(context,
// decisionProvider) -> QualificationDecision.
//
// Reutiliza el DecisionProvider YA existente (decision/types.ts, sin
// tocar) -- mismo idioma de fallback que relevance/relevanceEngine.ts
// (evaluateChangeRelevance): si decisionProvider es null, o si
// .classify() lanza, se usa el fallback determinista, con la degradación
// siempre visible en provenance.provider ("fallback:deterministic"),
// nunca disfrazada de JEV. No es una copia de relevanceEngine.ts: esa
// función responde "¿este cambio ya detectado merece atención?" (requiere
// ChangeContext/watchlist/metrics_delta); esta responde "¿este item
// recién recuperado pertenece genuinamente a la marca investigada?" --
// una pregunta distinta, evaluable sin watchlist ni historial.
import type { DecisionProvider } from "../decision";
import { QUALIFICATION_CATEGORIES } from "./types";
import type { BrandDescriptor, QualificationContext, QualificationDecision } from "./types";

function normalizeToken(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/[^a-z0-9]/g, "");
}

function fieldsToCheck(context: QualificationContext): Array<{ field: string; value: string | null }> {
  return [
    { field: "actor.handle", value: context.actor?.handle ?? null },
    { field: "actor.display_name", value: context.actor?.display_name ?? null },
    { field: "item.source_metadata_page_name", value: context.item.source_metadata_page_name },
    { field: "item.description_snippet", value: context.item.description_snippet },
    { field: "item.canonical_url", value: context.item.canonical_url },
  ];
}

/**
 * Evidencia determinista, ANCLADA en tokens compactos de marca -- nunca
 * substring genérico contra una palabra corta. "vidadivina.oficial" vs
 * "bibliadivina.oficial" NO coinciden aquí: el token "vidadivina" no es un
 * substring de "bibliadivinaoficial" normalizado, aunque ambos contengan
 * "divina" -- exactamente la distinción que el caso real exige.
 */
function findBrandTokenMatch(
  context: QualificationContext,
  brand: BrandDescriptor
): { field: string; token: string } | null {
  const fields = fieldsToCheck(context);
  for (const { field, value } of fields) {
    if (!value) continue;
    const normalized = normalizeToken(value);
    const match = brand.brandTokens.find((t) => normalized.includes(normalizeToken(t)));
    if (match) return { field, token: match };
  }
  return null;
}

/** Look-alike CONOCIDO (p.ej. "divina" sola) presente sin ningún brandToken -- evidencia de que es una entidad distinta, no simple ausencia de información. */
function findLookalikeTokenMatch(
  context: QualificationContext,
  brand: BrandDescriptor
): { field: string; token: string } | null {
  if (!brand.lookalikeTokens || brand.lookalikeTokens.length === 0) return null;
  const fields = fieldsToCheck(context);
  for (const { field, value } of fields) {
    if (!value) continue;
    const normalized = normalizeToken(value);
    const match = brand.lookalikeTokens.find((t) => normalized.includes(normalizeToken(t)));
    if (match) return { field, token: match };
  }
  return null;
}

function deterministicQualificationFallback(context: QualificationContext, reason: string): QualificationDecision {
  const base = { provider: "fallback:deterministic", provenance: { reason } };
  const brandMatch = findBrandTokenMatch(context, context.brand);

  if (brandMatch) {
    return {
      ...base,
      decision: "RELEVANT",
      confidence: 0.8,
      rationale: `El campo "${brandMatch.field}" contiene el token de marca "${brandMatch.token}" -- identidad de marca confirmada por evidencia textual directa.`,
      evidence: { matched_field: brandMatch.field, matched_token: brandMatch.token },
    };
  }

  const lookalikeMatch = findLookalikeTokenMatch(context, context.brand);
  if (lookalikeMatch) {
    return {
      ...base,
      decision: "IRRELEVANT",
      confidence: 0.6,
      rationale: `El campo "${lookalikeMatch.field}" contiene "${lookalikeMatch.token}" (patrón conocido de confusión superficial con "${context.brand.name}") pero SIN ningún token de marca anclado -- evidencia de que es una entidad distinta, no la marca investigada.`,
      evidence: { lookalike_field: lookalikeMatch.field, lookalike_token: lookalikeMatch.token },
    };
  }

  return {
    ...base,
    decision: "UNCERTAIN",
    confidence: 0.3,
    rationale: `Sin coincidencia de ningún token de marca de "${context.brand.name}" ni de un patrón de confusión conocido -- evidencia insuficiente para decidir, nunca se asume RELEVANT por defecto.`,
    evidence: {},
  };
}

export async function evaluateContentQualification(
  context: QualificationContext,
  decisionProvider: DecisionProvider | null
): Promise<QualificationDecision> {
  if (decisionProvider) {
    try {
      const result = await decisionProvider.classify({
        subject: context,
        labels: QUALIFICATION_CATEGORIES,
        context: {
          instructions:
            `Evalúa si este item recuperado pertenece GENUINAMENTE a la marca/entidad "${context.brand.name}", ` +
            "usando únicamente la evidencia observable en `subject` (actor, page_name, texto, URL). " +
            "Una coincidencia superficial de texto (p.ej. una palabra parecida en un handle) NO es evidencia de identidad de marca. " +
            "Si la evidencia no permite decidir con confianza, responde UNCERTAIN -- nunca asumas RELEVANT por defecto.",
        },
      });
      return {
        decision: result.label as QualificationDecision["decision"],
        confidence: result.confidence.value,
        rationale: `Clasificado por ${decisionProvider.name} a partir de la evidencia observable del item.`,
        evidence: { actor: context.actor, item: context.item },
        provider: decisionProvider.name,
        provenance: result.confidence.provenance ?? null,
      };
    } catch (err) {
      return deterministicQualificationFallback(
        context,
        `${decisionProvider.name} falló o no está configurado: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return deterministicQualificationFallback(context, "sin DecisionProvider inyectado");
}
