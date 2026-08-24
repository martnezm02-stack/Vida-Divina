// hypothesisTesting.js — Fase 5: AI-Assisted Customer Research +
// Hypothesis-Driven Creative Testing, MODE B (HYPOTHESIS_TESTING).
//
// DECISIÓN ARQUITECTÓNICA (Fase 12 del encargo, documentada aquí tal como
// se pidió): de las 3 opciones evaluadas -- (A) reutilizar CreativeCell con
// metadata de modo, (B) un tipo de candidato separado, (C) una capa de
// experimentación separada encima de Creative Intelligence -- se eligió
// (C). Motivo real, verificado antes de escribir código: createPersona()
// exige 3-5 verbatimPhrases con sourceCitation real (assertVerbatimPhrases,
// persona.js), y createPain() exige verbatimQuote + sourcePlatform reales
// (pain.js) -- ambos constructores RECHAZAN estructuralmente cualquier
// intento de construir una Persona/Pain sin evidencia real detrás. Una
// hipótesis de marketing, por definición, no tiene verbatims reales --
// reutilizar esos constructores habría exigido fabricar evidencia falsa
// (prohibido) o debilitar esas validaciones (fuera de alcance, romper
// Creative Intelligence existente). Por eso HYPOTHESIS_TESTING vive en un
// módulo separado (KNOWLEDGE vs. EXPERIMENTATION), que SÍ reutiliza lo que
// es seguro reutilizar: AWARENESS_STAGES/assertValidAwarenessStage
// (awareness.js), FORMAT_LIBRARY (format.js), y el mismo formato de gate
// legado/nuevo de Fase 4D (assertValidGateValue/getGateStatusValue,
// cycleOutput.schema.js) -- nunca duplicados.
//
// Este módulo NUNCA importa ni llama a createPersona/createPain/
// createAngle/createCreativeCell -- una PersonaHypothesis/PainHypothesis/
// CreativeVariant nunca puede confundirse estructuralmente con una
// Persona/Pain/CreativeCell real (formas distintas, campos distintos,
// nunca los mismos nombres de función).

import { randomUUID } from 'node:crypto';
import { assertValidAwarenessStage } from './awareness.js';
import { FORMAT_LIBRARY } from './format.js';
import { assertValidGateValue } from '../schemas/cycleOutput.schema.js';

export const RESEARCH_MODES = Object.freeze(['EVIDENCE_BASED', 'HYPOTHESIS_TESTING']);

// De dónde puede nutrirse una hipótesis (Fase 10 del encargo) -- nunca
// CUSTOMER_EVIDENCE ni CUSTOMER_RESEARCH: eso es exactamente lo que
// distingue una hipótesis de conocimiento validado.
//
// 'MARKETING_PRINCIPLE' (Fase 16, aditivo): un principio de metodología
// publicitaria reutilizable (ver creative-intelligence/src/
// marketingPlaybook.js — capa METHODOLOGY), ej. "probar un ángulo de
// conveniencia". Estructuralmente distinto de 'MARKET_EVIDENCE' (que
// implica una observación real de mercado/competidores) y de
// 'PRODUCT_FACT' (un dato real del producto) -- un MARKETING_PRINCIPLE
// nunca afirma nada sobre el producto ni sobre el cliente, solo nombra la
// estrategia metodológica que se está probando. El significado de las 3
// categorías existentes no cambia.
export const HYPOTHESIS_BASIS_TYPES = Object.freeze(['PRODUCT_FACT', 'MARKET_EVIDENCE', 'BRAND_CONTEXT', 'MARKETING_PRINCIPLE']);

export const DISCLAIMER_PERSONA_HYPOTHESIS = 'Esta Persona es una hipótesis de marketing para testing y NO representa conocimiento validado del cliente.';
export const DISCLAIMER_PAIN_HYPOTHESIS = 'Este Pain es una hipótesis de marketing para testing y NO representa conocimiento validado del cliente.';

function assertValidBasis(basis, { evidenceIndex = null } = {}) {
  if (!Array.isArray(basis) || basis.length === 0) {
    throw new Error('Hypothesis: "basis" es obligatorio y debe tener al menos 1 elemento real -- nunca una hipótesis sin fundamento declarado (Product Fact, Market Evidence o Brand Context).');
  }
  basis.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Hypothesis: basis[${index}] debe ser un objeto { type, ref, detail }.`);
    }
    if (!HYPOTHESIS_BASIS_TYPES.includes(entry.type)) {
      throw new Error(`Hypothesis: basis[${index}].type inválido "${entry.type}" (válidos: ${HYPOTHESIS_BASIS_TYPES.join(', ')}). CUSTOMER_EVIDENCE/CUSTOMER_RESEARCH nunca son una base válida de hipótesis -- eso sería evidencia real, no una hipótesis.`);
    }
    if (!entry.detail?.trim?.()) {
      throw new Error(`Hypothesis: basis[${index}].detail es obligatorio -- nunca una base sin contenido real citable (ej. el texto real del Product Fact o Market Evidence).`);
    }
    // Requisito 9: si basis cita un evidenceId real de Market Evidence, y
    // se proveyó un evidenceIndex para verificarlo, debe existir de verdad
    // -- nunca se fabrica un evidenceId.
    if (entry.type === 'MARKET_EVIDENCE' && entry.ref && evidenceIndex) {
      const found = evidenceIndex.get(entry.ref);
      if (!found) {
        throw new Error(`Hypothesis: basis[${index}] cita el evidenceId "${entry.ref}" como MARKET_EVIDENCE, pero no existe en el evidenceIndex provisto -- no se puede fundamentar una hipótesis en evidencia que no existe.`);
      }
    }
  });
}

/**
 * PersonaHypothesis — Mode B. Estructuralmente distinta de Persona real
 * (persona.js): sin verbatimPhrases, sin evidenceIds, sin confidence
 * CUSTOMER_VALIDATED posible (el campo ni siquiera existe aquí). "status"
 * y "mode" son fijos, nunca parámetros -- ninguna PersonaHypothesis puede
 * declararse a sí misma como otra cosa.
 */
export function createPersonaHypothesis({ name, lifeSituation, relationshipToProblem, basis, evidenceIndex = null }) {
  if (!name?.trim()) throw new Error('PersonaHypothesis: "name" es obligatorio.');
  if (!lifeSituation?.trim()) throw new Error('PersonaHypothesis: "lifeSituation" es obligatorio.');
  if (!relationshipToProblem?.trim()) throw new Error('PersonaHypothesis: "relationshipToProblem" es obligatorio.');
  assertValidBasis(basis, { evidenceIndex });

  return Object.freeze({
    personaHypothesisId: randomUUID(),
    mode: 'HYPOTHESIS_TESTING',
    status: 'HYPOTHESIS',
    name,
    lifeSituation,
    relationshipToProblem,
    basis: Object.freeze(basis.map((b) => Object.freeze({ ...b }))),
    disclaimer: DISCLAIMER_PERSONA_HYPOTHESIS,
    createdAt: new Date().toISOString(),
  });
}

/** PainHypothesis — Mode B. Sin verbatimQuote/sourcePlatform (a diferencia de Pain real, pain.js) -- una hipótesis no tiene cita real de cliente. */
export function createPainHypothesis({ personaHypothesisId, painPoint, basis, evidenceIndex = null }) {
  if (!personaHypothesisId?.trim()) throw new Error('PainHypothesis: "personaHypothesisId" es obligatorio -- toda hipótesis de Pain pertenece a una PersonaHypothesis real.');
  if (!painPoint?.trim()) throw new Error('PainHypothesis: "painPoint" es obligatorio.');
  assertValidBasis(basis, { evidenceIndex });

  return Object.freeze({
    painHypothesisId: randomUUID(),
    mode: 'HYPOTHESIS_TESTING',
    status: 'HYPOTHESIS',
    personaHypothesisId,
    painPoint,
    basis: Object.freeze(basis.map((b) => Object.freeze({ ...b }))),
    disclaimer: DISCLAIMER_PAIN_HYPOTHESIS,
    createdAt: new Date().toISOString(),
  });
}

/**
 * CreativeVariant — una combinación completa y ejecutable de
 * Persona/Pain-hipótesis + angle + hook + format, lista para producción
 * experimental. Reutiliza AWARENESS_STAGES/FORMAT_LIBRARY reales -- nunca
 * un vocabulario paralelo.
 */
export function createCreativeVariant({
  variantId = randomUUID(),
  personaHypothesisId,
  painHypothesisId,
  awareness,
  angleText,
  hook,
  format,
  mechanism,
}) {
  if (!personaHypothesisId?.trim()) throw new Error('CreativeVariant: "personaHypothesisId" es obligatorio.');
  if (!painHypothesisId?.trim()) throw new Error('CreativeVariant: "painHypothesisId" es obligatorio.');
  assertValidAwarenessStage(awareness);
  if (!angleText?.trim()) throw new Error('CreativeVariant: "angleText" es obligatorio.');
  if (!hook?.trim()) throw new Error('CreativeVariant: "hook" es obligatorio.');
  if (!FORMAT_LIBRARY.includes(format)) {
    throw new Error(`CreativeVariant: "format" inválido "${format}" (válidos: ${FORMAT_LIBRARY.join(', ')}) -- nunca un formato inventado fuera de la Format Library real.`);
  }
  if (!mechanism?.trim()) throw new Error('CreativeVariant: "mechanism" es obligatorio.');

  return Object.freeze({
    variantId,
    mode: 'HYPOTHESIS_TESTING',
    status: 'HYPOTHESIS',
    personaHypothesisId,
    painHypothesisId,
    awareness,
    angleText,
    hook,
    format,
    mechanism,
    createdAt: new Date().toISOString(),
  });
}

/** Firma estructural de una variante (angle+hook+format) -- usada solo para exigir diversidad real entre variantes, nunca para decidir cuál "gana". */
function variantSignature(variant) {
  return `${variant.angleText}::${variant.hook}::${variant.format}`;
}

const DEFAULT_MIN_VARIANTS = 2;

/**
 * Experiment — el contenedor de un conjunto de CreativeVariants
 * deliberadamente distintas para un producto real, más el gate de
 * aprobación humana (mismo formato legado/nuevo de Fase 4D, reutilizado,
 * nunca duplicado) antes de poder considerarse listo para producción
 * experimental real.
 *
 * @param {{
 *   experimentId?: string,
 *   productBasis: Array<{type:string, ref?:string, detail:string}>, // Fase 10: Product Facts reales del producto (provistos por quien llama -- este módulo nunca lee docs/productos/, mantiene el aislamiento ya documentado en README.md)
 *   variants: object[], // CreativeVariant[], ver createCreativeVariant()
 *   minVariants?: number,
 *   gateStatus?: object, // { [gateName]: 'PENDING'|'APPROVED'|'REJECTED' | {status, reviewedBy?, reviewedAt?} }
 * }}
 */
export function createExperiment({
  experimentId = randomUUID(),
  productBasis,
  variants,
  minVariants = DEFAULT_MIN_VARIANTS,
  gateStatus = { strategyApproval: 'PENDING' },
}) {
  if (!experimentId?.trim()) throw new Error('Experiment: "experimentId" es obligatorio.');
  assertValidBasis(productBasis);
  if (!Array.isArray(variants) || variants.length < minVariants) {
    throw new Error(`Experiment: se requieren al menos ${minVariants} CreativeVariant reales y deliberadamente distintas -- HYPOTHESIS_TESTING existe para dar a la plataforma publicitaria diversidad suficiente para explorar, nunca una sola variante por defecto.`);
  }
  const signatures = new Set(variants.map(variantSignature));
  if (signatures.size !== variants.length) {
    throw new Error('Experiment: al menos 2 variantes son idénticas (mismo angle+hook+format) -- las variantes deben ser realmente diferentes, no copias con distinto id.');
  }
  for (const v of variants) {
    if (v.mode !== 'HYPOTHESIS_TESTING' || v.status !== 'HYPOTHESIS') {
      throw new Error('Experiment: toda variante debe tener mode:"HYPOTHESIS_TESTING" y status:"HYPOTHESIS" -- nunca una variante que se presente como conocimiento validado.');
    }
  }
  if (!gateStatus || typeof gateStatus !== 'object' || Array.isArray(gateStatus)) {
    throw new Error('Experiment: "gateStatus" debe ser un objeto { [gateName]: status } -- mismo contrato que CycleOutput.gateStatus (Fase 4B/4D).');
  }
  for (const [gate, value] of Object.entries(gateStatus)) {
    assertValidGateValue(gate, value);
  }

  return Object.freeze({
    experimentId,
    mode: 'HYPOTHESIS_TESTING',
    productBasis: Object.freeze(productBasis.map((b) => Object.freeze({ ...b }))),
    variants: Object.freeze(variants.map((v) => Object.freeze({ ...v }))),
    gateStatus: Object.freeze({ ...gateStatus }),
    createdAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------
// MODE A (EVIDENCE_BASED) -- Fase 3 + Fase 9 (INSUFFICIENT_EVIDENCE).
// No sintetiza narrativa (nombre/lifeSituation): eso sigue exigiendo
// juicio humano (o un motor de IA real, fuera de alcance de esta fase,
// mismo criterio ya documentado en marketing-intelligence/src/pipeline/
// hypothesis.js -- "plantillas deterministas, sin modelo de IA todavía").
// Esta función solo agrega + valida evidencia real, y produce un DRAFT
// citable -- nunca construye una Persona/Pain real por sí sola (eso sigue
// pasando por personaStage.js/painStage.js, sin cambios).
// ---------------------------------------------------------------------

export const DEFAULT_MIN_CUSTOMER_EVIDENCE_RECORDS = 3;

/**
 * Analiza cuánta evidencia real de CUSTOMER_EVIDENCE existe en un
 * evidenceIndex (ver orchestrator/stages/evidenceIndex.js) y responde con
 * honestidad: INSUFFICIENT_EVIDENCE si no alcanza el mínimo real (Requisito
 * 1/9 del framework: 3-5 verbatims, mismo umbral que persona.js), o un
 * DRAFT real (nunca inventado) listo para que un humano lo convierta en un
 * personaCandidate/painCandidate real vía personaStage.js/painStage.js.
 */
export function analyzeCustomerEvidence({ evidenceIndex, minRecords = DEFAULT_MIN_CUSTOMER_EVIDENCE_RECORDS }) {
  const customerEntries = [...evidenceIndex.values()].filter((e) => e.domain === 'CUSTOMER_EVIDENCE');
  if (customerEntries.length < minRecords) {
    return Object.freeze({
      status: 'INSUFFICIENT_EVIDENCE',
      mode: 'EVIDENCE_BASED',
      availableCustomerEvidenceCount: customerEntries.length,
      minRequired: minRecords,
      reason: `Se requieren al menos ${minRecords} registros reales de CUSTOMER_EVIDENCE para producir un borrador -- solo hay ${customerEntries.length}. No se inventa evidencia adicional; considera HYPOTHESIS_TESTING mientras tanto.`,
    });
  }
  return Object.freeze({
    status: 'DRAFT',
    mode: 'EVIDENCE_BASED',
    evidenceIds: Object.freeze(customerEntries.map((e) => e.record.evidenceId)),
    verbatimQuotes: Object.freeze(customerEntries.map((e) => Object.freeze({ evidenceId: e.record.evidenceId, verbatimQuote: e.record.verbatimQuote, sourcePlatform: e.record.sourcePlatform }))),
    disclaimer: 'Este borrador cita evidencia real de CUSTOMER_EVIDENCE y requiere revisión humana (construir el personaCandidate/painCandidate real vía personaStage.js/painStage.js) antes de convertirse en una Persona/Pain validada. Nunca es CUSTOMER_VALIDATED por sí solo.',
  });
}
