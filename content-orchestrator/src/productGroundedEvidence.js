// productGroundedEvidence.js — Fase 20: Product-Grounded Creative
// Intelligence, un camino DELIBERADAMENTE SEPARADO del ya existente
// (Persona + Pain + CreativeCell, ver creative-intelligence/src/persona.js
// y pain.js).
//
// CAUSA RAÍZ (verificada leyendo el código real, no asumida):
// createPersona() exige "verbatimPhrases" (3-5 citas reales con
// sourceCitation) y createPain() exige "verbatimQuote" + "sourcePlatform"
// -- ambas funciones LANZAN si faltan. Los propios comentarios lo declaran
// regla no negociable ("un Pain SIN verbatimQuote y sourcePlatform no es
// un Pain real — es una suposición"). createCreativeCell() exige
// personaId + painId reales. Por diseño, NINGUNA CreativeCell puede
// existir sin evidencia real de cliente -- no es una limitación de este
// archivo, es el mecanismo de integridad central del framework.
//
// Este módulo NUNCA construye una Persona, un Pain ni una CreativeCell.
// NUNCA llama a cycleOrchestrator. Es un camino ADITIVO y honesto:
// organiza los hechos reales YA existentes de un producto
// (docs/productos/, vía productFactsLoader.js -- reutilizado tal cual,
// nunca duplicado) en un objeto explícito que declara su propio tipo de
// evidencia (PRODUCT_EVIDENCE, nunca CUSTOMER_EVIDENCE) y sus límites
// reales -- para que un humano pueda escribir copy real con esa
// información, o para que buildCreativeProposal() la adjunte cuando no
// hay CreativeCell real disponible. No genera hook/script/cta -- "el
// motor nunca redacta el guion" (regla no negociable del proyecto) aplica
// aquí con más razón todavía: sin persona/pain reales, generar copy
// simulando una dirección estratégica sería exactamente inventar un
// "cliente quiere/necesita" sin evidencia, prohibido explícitamente en
// esta fase.

import { loadProductFacts } from './productFactsLoader.js';

export const PRODUCT_EVIDENCE_TYPE = 'PRODUCT_EVIDENCE';
export const PRODUCT_GROUNDED_CONFIDENCE = 'PROVISIONAL'; // nunca CUSTOMER_VALIDATED -- no hay cliente real detrás.

const CAMPO_A_TIPO = Object.freeze({
  'Nombre comercial': 'PRODUCT_FACT',
  'Categoría': 'PRODUCT_FACT',
  'Ingredientes principales': 'PRODUCT_FACT',
  'Presentación': 'PACKAGING_FACT',
  'Problema que ayuda a resolver': 'PRODUCT_FACT',
  'Beneficios': 'MARKETING_CLAIM', // texto de venta ya redactado en la ficha -- se conserva como claim, nunca como hecho médico.
  'Objetivo principal': 'MARKETING_CLAIM',
  'Modo de uso': 'PACKAGING_FACT',
  'Público objetivo': 'PRODUCT_FACT',
});

/**
 * Construye la evidencia real Product-Grounded de un producto real -- o
 * null si el producto no tiene hechos reales (mismo criterio ya usado en
 * todo el proyecto: nunca se inventa lo que falta).
 *
 * @param {string} productId
 * @returns {{
 *   productId: string, nombreComercial: string|null, evidenceType: 'PRODUCT_EVIDENCE',
 *   confidence: 'PROVISIONAL',
 *   sourceEvidence: Array<{type: string, field: string, value: string, source: string}>,
 *   limitations: string[],
 * }|null}
 */
export function buildProductGroundedEvidence(productId) {
  let facts;
  try {
    facts = loadProductFacts(productId);
  } catch {
    return null; // sin hechos reales -- nunca se inventa evidencia de producto.
  }

  const sourceEvidence = Object.entries(facts.camposReales).map(([campo, valor]) => ({
    type: CAMPO_A_TIPO[campo] ?? 'PRODUCT_FACT',
    field: campo,
    value: valor,
    source: facts.sourcePath,
  }));

  return Object.freeze({
    productId,
    nombreComercial: facts.nombreComercial,
    evidenceType: PRODUCT_EVIDENCE_TYPE,
    confidence: PRODUCT_GROUNDED_CONFIDENCE,
    sourceEvidence: Object.freeze(sourceEvidence),
    limitations: Object.freeze([
      'Sin evidencia real de cliente (CUSTOMER_RESEARCH) -- no se puede afirmar qué persona compra este producto, qué dolor resuelve en la práctica, ni qué resultado espera un cliente real.',
      'Los campos "Beneficios"/"Objetivo principal" son texto de venta ya redactado por Vida Divina (MARKETING_CLAIM) -- nunca se reescriben aquí como hechos médicos verificados.',
      'Este objeto nunca produce hook/script/cta -- "el motor nunca redacta el guion" (regla no negociable del proyecto). Un humano debe escribir el copy real usando esta evidencia como referencia, igual que ya hace el formulario "Crear" existente.',
    ]),
  });
}
