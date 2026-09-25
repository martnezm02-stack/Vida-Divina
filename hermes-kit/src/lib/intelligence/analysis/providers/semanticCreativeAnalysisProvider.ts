// semanticCreativeAnalysisProvider.ts — Semantic Creative Analysis (MI-3).
//
// Complementa a creativeAnalysisProvider (que solo REORGANIZA campos ya
// observados, nunca infiere nada -- ver su propio docstring: "un futuro
// provider respaldado por LLM sí podría poblarlo"). Este SÍ interpreta el
// texto observado de cada item para derivar los elementos creativos que
// ningún adapter puede poblar de forma determinista:
//
//   hook, problem/pain, angle, promise, mechanism, offer, cta
//     -> seleccionados como SUBCADENAS LITERALES del texto observado
//        (nunca reescritos/generados) vía DecisionProvider.classify().
//   narrative (reutiliza el campo `style`), target audience (reutiliza
//   `audience`)
//     -> clasificados contra un conjunto pequeño y explícito de categorías,
//        también vía classify().
//
// FACT vs INFERENCE (mismo contrato que cualquier AnalysisProvider, ver
// analysis/types.ts): `observed` es el texto/metadata YA guardado, sin
// tocar. `inferred` es la interpretación semántica, con su propia
// confianza -- nunca se mezcla con observed. Un elemento que el contenido
// disponible no sustente queda null -- nunca se inventa para completar el
// esquema (ni la primera frase se vuelve automáticamente "hook", ni una
// mención de producto se vuelve automáticamente "mechanism").
//
// JEV se usa aquí SOLO para clasificación/selección (classify(), elegir
// entre candidatos reales o "ninguno") -- nunca como generador narrativo
// libre. Cuando JEV no está configurado o falla, cada elemento cae a un
// fallback local deliberadamente conservador (ver deterministicFallback):
// nunca al patrón "deterministicDecisionProvider.classify()" (que
// devuelve la PRIMERA opción por defecto -- exactamente el anti-patrón
// "toda primera frase es el hook" que este módulo debe evitar).
//
// Vendor-agnostic: opera sobre IntelligenceItemWithDerived ya normalizado
// -- ninguna lógica específica de Instagram/TikTok/Meta Ads aquí.
import type { AnalysisProvider, AnalysisProviderOutput, AnalysisRequest } from "../types";
import type { IntelligenceItemWithDerived } from "../../types";
import type { DecisionProvider } from "../../decision";
import { createJevDecisionProvider } from "../../decision";
import { updateIntelligenceItem } from "../../items";

/** Elementos que se seleccionan como subcadena literal del texto observado. */
const SPAN_ELEMENTS = [
  {
    key: "hook",
    label: "Hook",
    description:
      "La frase o idea inicial diseñada para captar la atención en los primeros segundos/líneas.",
  },
  {
    key: "problem",
    label: "Problem/Pain",
    description: "El problema, dolor o frustración del público que el contenido nombra o implica directamente.",
  },
  {
    key: "angle",
    label: "Angle",
    description:
      "El ángulo o enfoque narrativo distintivo (p.ej. testimonio, comparación, urgencia, autoridad) tal como aparece en el texto.",
  },
  {
    key: "promise",
    label: "Promise",
    description: "El resultado o beneficio concreto que el contenido promete lograr.",
  },
  {
    key: "mechanism",
    label: "Mechanism",
    description:
      "El método, ingrediente o proceso específico que el contenido presenta como la razón por la que funciona.",
  },
  {
    key: "offer",
    label: "Offer",
    description: "La oferta comercial concreta (precio, descuento, bundle, prueba) si el contenido la menciona.",
  },
  {
    key: "cta",
    label: "CTA",
    description: "El llamado a la acción explícito dirigido a la audiencia.",
  },
] as const;
type SpanElementKey = (typeof SPAN_ELEMENTS)[number]["key"];

/** Elementos que se clasifican contra categorías fijas (no son una subcadena). */
const NARRATIVE_LABELS = [
  "testimonio / experiencia personal",
  "antes y después",
  "demostración de producto",
  "autoridad / experto explica",
  "oferta / promoción directa",
  "educativo / informativo",
  "humor / entretenimiento",
] as const;

const AUDIENCE_LABELS = [
  "mujeres adultas interesadas en salud y bienestar",
  "hombres adultos interesados en rendimiento físico",
  "adultos mayores preocupados por su salud",
  "padres/madres de familia",
  "audiencia general sin segmento claro en el texto",
] as const;

const NONE_LABEL = "(ninguna de las anteriores / no determinable con el contenido disponible)";

export const SEMANTIC_CREATIVE_ELEMENTS = [
  ...SPAN_ELEMENTS.map((e) => e.key),
  "narrative",
  "target_audience",
] as const;
export type SemanticCreativeElement = (typeof SEMANTIC_CREATIVE_ELEMENTS)[number];

/** Divide el texto observado en candidatos que son subcadenas LITERALES -- nunca reescritas. */
function splitCandidates(text: string): string[] {
  return text
    .split(/(?<=[.!?¡¿])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Fallback determinista MUY conservador cuando no hay DecisionProvider
// configurado o falla: solo CTA se detecta (frase explícita observable en
// el texto -- un hecho casi tan directo como una cita, no una inferencia
// libre). Todo lo demás queda null a propósito.
const CTA_TRIGGERS = [
  "compra ahora",
  "compra aquí",
  "escríbenos",
  "escribe",
  "agenda",
  "reserva",
  "link en bio",
  "link in bio",
  "shop now",
  "regístrate",
  "desliza",
  "envía",
  "manda mensaje",
  "contáctanos",
  "da click",
  "haz clic",
  "pide informes",
  "compra ya",
];

function deterministicCtaFallback(candidates: string[]): string | null {
  const match = candidates.find((c) => CTA_TRIGGERS.some((t) => c.toLowerCase().includes(t)));
  return match ?? null;
}

async function classifySpan(
  decisionProvider: DecisionProvider,
  elementLabel: string,
  elementDescription: string,
  candidates: string[],
  fullText: string
): Promise<{ value: string | null; confidence: number | null }> {
  const labels = [...candidates, NONE_LABEL];
  const result = await decisionProvider.classify({
    subject: fullText,
    labels,
    context:
      `Elemento creativo a identificar: ${elementLabel}. ${elementDescription} ` +
      `Elige EXACTAMENTE una de las frases dadas (cópiala tal cual, no la reescribas). ` +
      `Si ninguna frase representa claramente este elemento, elige "${NONE_LABEL}".`,
  });
  if (!result || result.label === NONE_LABEL) {
    return { value: null, confidence: result?.confidence?.value ?? null };
  }
  return { value: result.label, confidence: result.confidence?.value ?? null };
}

async function classifyCategory(
  decisionProvider: DecisionProvider,
  elementLabel: string,
  elementDescription: string,
  categoryLabels: readonly string[],
  fullText: string
): Promise<{ value: string | null; confidence: number | null }> {
  const labels = [...categoryLabels, NONE_LABEL];
  const result = await decisionProvider.classify({
    subject: fullText,
    labels,
    context:
      `Elemento a clasificar: ${elementLabel}. ${elementDescription} ` +
      `Si el contenido disponible no da señal suficiente, elige "${NONE_LABEL}" -- nunca adivines.`,
  });
  if (!result || result.label === NONE_LABEL) {
    return { value: null, confidence: result?.confidence?.value ?? null };
  }
  return { value: result.label, confidence: result.confidence?.value ?? null };
}

interface ItemSemanticResult {
  elements: Partial<Record<SemanticCreativeElement, string | null>>;
  confidences: Partial<Record<SemanticCreativeElement, number | null>>;
  degraded: boolean; // true si algún elemento cayó al fallback determinista (JEV no disponible/falló)
}

async function analyzeItemText(
  decisionProvider: DecisionProvider | null,
  text: string
): Promise<ItemSemanticResult> {
  const candidates = splitCandidates(text);
  const elements: ItemSemanticResult["elements"] = {};
  const confidences: ItemSemanticResult["confidences"] = {};
  let degraded = decisionProvider === null;

  if (candidates.length === 0) {
    for (const e of SPAN_ELEMENTS) elements[e.key] = null;
    elements.narrative = null;
    elements.target_audience = null;
    return { elements, confidences, degraded: true };
  }

  for (const e of SPAN_ELEMENTS) {
    if (decisionProvider) {
      try {
        const { value, confidence } = await classifySpan(decisionProvider, e.label, e.description, candidates, text);
        elements[e.key] = value;
        confidences[e.key] = confidence;
        continue;
      } catch {
        degraded = true; // JEV no configurado / falló -- cae a fallback, nunca rompe el análisis
      }
    }
    // Fallback determinista: solo CTA tiene una señal textual explícita
    // defendible; el resto queda null a propósito (nunca se inventa).
    elements[e.key] = e.key === "cta" ? deterministicCtaFallback(candidates) : null;
    confidences[e.key] = null;
  }

  if (decisionProvider) {
    try {
      const narrative = await classifyCategory(
        decisionProvider,
        "Narrative/Format",
        "El formato narrativo que usa el contenido.",
        NARRATIVE_LABELS,
        text
      );
      elements.narrative = narrative.value;
      confidences.narrative = narrative.confidence;
    } catch {
      degraded = true;
      elements.narrative = null;
    }
    try {
      const audience = await classifyCategory(
        decisionProvider,
        "Target Audience",
        "A quién parece estar dirigido el contenido, según lo que el texto realmente dice.",
        AUDIENCE_LABELS,
        text
      );
      elements.target_audience = audience.value;
      confidences.target_audience = audience.confidence;
    } catch {
      degraded = true;
      elements.target_audience = null;
    }
  } else {
    elements.narrative = null;
    elements.target_audience = null;
  }

  return { elements, confidences, degraded };
}

/**
 * Crea un SemanticCreativeAnalysisProvider respaldado por el
 * DecisionProvider dado (JEV real, un doble de test, o `null` para forzar
 * siempre el fallback determinista conservador). `analyze()` nunca lanza
 * por un fallo de JEV -- degrada elemento por elemento.
 */
export function createSemanticCreativeAnalysisProvider(
  decisionProvider: DecisionProvider | null
): AnalysisProvider {
  return {
    name: `semantic-creative${decisionProvider ? `/${decisionProvider.name}` : "/deterministic-fallback"}`,

    async analyze(items: IntelligenceItemWithDerived[], _request: AnalysisRequest): Promise<AnalysisProviderOutput> {
      const observedItems: Record<number, unknown> = {};
      const inferredItems: Record<number, unknown> = {};
      const confidenceSamples: number[] = [];
      let anyDegraded = false;

      for (const item of items) {
        const text = (item.description ?? "").trim();
        observedItems[item.id] = {
          source_text: item.description ?? null,
          content_type: item.content_type,
          media_type: item.media_type,
          format: item.format,
        };

        if (!text) {
          inferredItems[item.id] = {
            elements: Object.fromEntries(SEMANTIC_CREATIVE_ELEMENTS.map((k) => [k, null])),
            confidences: {},
            reason: "sin texto observado (description vacío) -- nada que interpretar",
          };
          continue;
        }

        const { elements, confidences, degraded } = await analyzeItemText(decisionProvider, text);
        if (degraded) anyDegraded = true;
        for (const v of Object.values(confidences)) {
          if (typeof v === "number") confidenceSamples.push(v);
        }
        inferredItems[item.id] = { elements, confidences };
      }

      const avgConfidence =
        confidenceSamples.length > 0
          ? confidenceSamples.reduce((a, b) => a + b, 0) / confidenceSamples.length
          : null;

      return {
        observed: { items: observedItems },
        inferred: { items: inferredItems, degraded_to_fallback: anyDegraded },
        confidence: avgConfidence,
        model: decisionProvider?.name ?? null,
      };
    },
  };
}

/** Instancia lista para usar, respaldada por JEV real (degrada solo internamente si no está configurado). */
export const semanticCreativeAnalysisProvider = createSemanticCreativeAnalysisProvider(createJevDecisionProvider());

export interface ApplySemanticCreativeAnalysisResult {
  updatedItemIds: number[];
  skippedItemIds: number[]; // ya tenían el campo observado -- nunca se sobrescribe un hecho con una inferencia
}

/**
 * Escribe los elementos inferidos de vuelta sobre `intelligence_items`
 * (vía updateIntelligenceItem, el camino de enriquecimiento MI-3 ya
 * existente) SOLO para columnas que hoy están NULL en cada item -- nunca
 * sobrescribe un valor ya observado/establecido. hook/angle/problem/
 * mechanism/promise/cta/offer escriben su propia columna; narrative
 * reutiliza `style`; target_audience reutiliza `audience` (ambas ya
 * existentes en el esquema, sin duplicar el modelo).
 *
 * Esta es la integración mínima para que MI-4 (que lee item.hook/angle/
 * cta/... directamente, ver detection/featureExtraction.ts) pueda detectar
 * patrones semánticos con el Pattern Detection YA existente -- sin
 * reimplementar nada de MI-4.
 */
export function applySemanticCreativeAnalysis(
  items: IntelligenceItemWithDerived[],
  inferredByItemId: Record<number, { elements?: Partial<Record<SemanticCreativeElement, string | null>> }>
): ApplySemanticCreativeAnalysisResult {
  const updatedItemIds: number[] = [];
  const skippedItemIds: number[] = [];

  const COLUMN_ELEMENTS: readonly SpanElementKey[] = SPAN_ELEMENTS.map((e) => e.key);

  for (const item of items) {
    const result = inferredByItemId[item.id];
    if (!result?.elements) continue;

    const update: Record<string, string> = {};
    for (const key of COLUMN_ELEMENTS) {
      const value = result.elements[key];
      if (value && !item[key]) update[key] = value;
    }
    if (result.elements.narrative && !item.style) update.style = result.elements.narrative;
    if (result.elements.target_audience && !item.audience) update.audience = result.elements.target_audience;

    if (Object.keys(update).length > 0) {
      updateIntelligenceItem(item.id, update);
      updatedItemIds.push(item.id);
    } else {
      skippedItemIds.push(item.id);
    }
  }

  return { updatedItemIds, skippedItemIds };
}
