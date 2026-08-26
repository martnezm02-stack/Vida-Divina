// hypothesisCopyProvider.js — Fase de Creative Quality: genera copy REAL,
// social-native y estructuralmente distinto para UNA CreativeVariant de
// hipótesis. Provider separado de copyGenerationProvider.js#DeterministicCopyProvider
// a propósito: ese sigue siendo exclusivamente el de EVIDENCE_BASED -- este
// consume el vocabulario de creative-intelligence/src/marketingPlaybook.js
// (METHODOLOGY), nunca lo reimplementa.
//
// CORRECCIÓN DE ROOT CAUSE (auditoría de Creative Quality, benchmark real
// Ripped Capsules): la versión anterior de este archivo hacía que
// "mechanism" y "productReveal" citaran AMBAS el mismo campo
// (facts.beneficios, vía buildMechanismStatement combinando
// ingredientes+beneficios) -- el mismo claim aparecía dos veces en la
// misma pieza. Corregido aquí de forma estructural, no cosmética: cada
// sección de copy usa un campo fuente DISTINTO y disjunto --
// 'mechanism' usa EXCLUSIVAMENTE facts.ingredientes,
// 'productReveal' usa EXCLUSIVAMENTE facts.beneficios,
// 'problem' usa EXCLUSIVAMENTE facts.problema.
// Ninguna sección reutiliza el campo fuente de otra en la misma pieza --
// verificado también por creativeQualityGate.js#checkStructuralSameness
// como red de seguridad adicional, no como único mecanismo.
//
// copyStyle (Fase de Creative Quality) ahora SÍ afecta la redacción real
// (antes, TONE_BY_ANGLE se calculaba pero nunca se usaba -- "dead
// metadata"). El "tone" expuesto en el resultado ya no es un valor
// calculado por separado: es SIEMPRE deriveToneLabel(copyStyle), por
// construcción no puede divergir de lo que el copy realmente hace.
//
// Mismos guards que DeterministicCopyProvider, reutilizados sin duplicar:
// assertNoForbiddenProductClaims (hyperframesRenderer.js) +
// assertBrandAvoidCompliance (brandVisualSystem.js).

import { assertNoForbiddenProductClaims } from '../../video-production/src/hyperframesRenderer.js';
import { assertBrandAvoidCompliance } from './brandVisualSystem.js';
import {
  renderHook, copyStructureFor, renderCopyStyleSection, buildCta, deriveToneLabel,
} from '../../creative-intelligence/src/marketingPlaybook.js';

// Formatos de la Format Library que no implican video/voiceover -- el resto
// (POV, walk-and-talk, skit, TikTok-style, podcast, VSL, etc.) sí.
const STATIC_FORMATS = Object.freeze(['Static comparison frames']);

// Mapeo sección de CopyStructure -> campo fuente REAL y ÚNICO de Product
// Facts que la alimenta. Disjunto por diseño (Parte 3 de la corrección) --
// ninguna sección comparte campo fuente con otra.
const SOURCE_FIELD_BY_SECTION = Object.freeze({
  problem: 'problema',
  mechanism: 'ingredientes',
  productReveal: 'beneficios',
});

function limpiar(texto) {
  return String(texto ?? '').trim().replace(/\.+$/, '');
}

/**
 * Construye UNA sección real de copy, o null si el campo fuente
 * correspondiente no existe (nunca inventa un fragmento faltante -- se
 * omite la sección, igual que el resto del proyecto omite lo que no está
 * documentado). Devuelve también el "sourceField" real usado, para que
 * creativeQualityGate.js pueda verificar que ninguna sección repite el
 * campo fuente de otra.
 */
function buildSection(section, copyStyleId, facts, nombreComercial) {
  const sourceField = SOURCE_FIELD_BY_SECTION[section];
  const fragment = sourceField ? facts[sourceField] : null;
  if (!fragment?.trim()) return null;
  const text = renderCopyStyleSection(section, copyStyleId, fragment, nombreComercial);
  return { section, sourceField, text };
}

// Bridge de campaña (Creative Strategy Engine, 2026-08-24): awareness
// stages de funnel medio/tardío (Solution/Product/Most Aware) omiten a
// propósito la sección "problem" (COPY_STRUCTURE_BY_AWARENESS -- ya
// conocen el problema, no hace falta re-agitarlo). Sin esto, una campaña
// real con esos awareness stages no tenía NINGÚN canal para que el
// territorio de campaña llegara al cuerpo del copy (root cause real
// confirmado: variantes B/C/D del benchmark, 0/100 de relevancia real).
// Nunca re-agita el problema (respeta el diseño real del funnel) -- solo
// sitúa a la audiencia real, una frase corta y neutra.
function buildCampaignBridgeLine(campaignIntent) {
  if (!campaignIntent) return null;
  return `Pensado para ${limpiar(campaignIntent.targetAudience)} interesados en ${limpiar(campaignIntent.campaignTerritory)}.`;
}

// Tipos de hook que NUNCA citan pain/territoryFragment (pattern-interrupt
// deliberadamente agnóstico de tema, ver renderHook() en
// marketingPlaybook.js) -- SOLO estos necesitan el bridge de campaña; los
// demás (verbal/pov/question/problem_recognition/curiosity/demonstration)
// ya citan el territorio real dentro del hook mismo, y agregar TAMBIÉN un
// bridge con el mismo territorio colisionaría con
// creativeQualityGate.js#checkHookRepetition (root cause real encontrado
// durante la validación de esta fase).
const HOOK_IDS_SIN_TERRITORIO = Object.freeze(['visual', 'pattern_interrupt', 'contrarian', 'text_on_screen']);

/**
 * @param {object} args
 * @param {{id:string, hook:string, angle:string, awareness:string, format:string, copyStyle:string, ctaStrategy:string}} args.blueprint — VARIANT_BLUEPRINTS entry real (marketingPlaybook.js).
 * @param {string} args.painHookFragment — fragmento CORTO de encuadre de dolor, ya reencuadrado por PERSONA_FRAMINGS#buildPainHookFragment (o por el territorio real de campaña) -- nunca el painPoint completo de la PainHypothesis (ese lleva su propio andamiaje "Hipótesis: podría importar..." + cita literal, no apto para un hook publicitario).
 * @param {{nombreComercial:string, problema:?string, beneficios:?string, ingredientes:?string}} args.facts — Product-Grounded Evidence real, ya extraído (o effectiveFacts con "problema" real de campaña -- ver hypothesisCreativeEngine.js).
 * @param {object|null} [args.campaignIntent] — CampaignIntent real (campaignIntent.js), o null para el comportamiento preexistente (sin campaña).
 * @returns {{hook:string, headline:string, primaryText:string, cta:string, tone:string, copyStyle:string, voiceover:?string[], script:?string[], bodyLines:string[], sectionsUsed:Array<{section:string,sourceField:string}>, missingFields:string[]}}
 */
export function generateVariantCopy({
  blueprint, painHookFragment, facts, campaignIntent = null,
}) {
  if (!blueprint?.hook || !blueprint?.awareness || !blueprint?.format || !blueprint?.copyStyle || !blueprint?.ctaStrategy) {
    throw new Error('generateVariantCopy: "blueprint" debe incluir "hook"/"awareness"/"format"/"copyStyle"/"ctaStrategy" reales.');
  }
  if (!painHookFragment?.trim()) throw new Error('generateVariantCopy: "painHookFragment" es obligatorio.');
  if (!facts?.nombreComercial?.trim()) throw new Error('generateVariantCopy: "facts.nombreComercial" es obligatorio.');

  // Nombre visible (UX cleanup, 2026-08-26): el copy real (hook/cuerpo/CTA
  // -- lo que el cliente lee/escucha) usa el nombre visible/comercial
  // corto, nunca el nombre técnico completo del catálogo (ver
  // productFactsLoader.js#nombreVisible) -- facts.nombreComercial sigue
  // intacto para matching/trazabilidad en el resto del sistema.
  const displayName = facts.nombreVisible?.trim() || facts.nombreComercial;

  // Fragmento corto para el HOOK (solo ingredientes, nunca la frase
  // combinada de buildMechanismStatement) -- un hook debe ser breve; el
  // mecanismo completo va en la sección "mechanism" del cuerpo.
  const shortMechanismFragment = limpiar(facts.ingredientes) || limpiar(facts.beneficios);

  const hook = renderHook(blueprint.hook, {
    painFragment: painHookFragment,
    mechanismFragment: shortMechanismFragment,
    nombreComercial: displayName,
    territoryFragment: campaignIntent?.campaignTerritory ?? null,
  });
  const cta = buildCta(blueprint.ctaStrategy, displayName);
  const tone = deriveToneLabel(blueprint.copyStyle);

  const structure = copyStructureFor(blueprint.awareness);
  const sectionResults = structure
    .filter((section) => section !== 'hook' && section !== 'cta')
    .map((section) => buildSection(section, blueprint.copyStyle, facts, displayName))
    .filter(Boolean);

  // Bridge de campaña SOLO si esta estructura real omite "problem" Y el
  // hook de este blueprint no citó ya el territorio real (ver comentario
  // arriba) -- nunca duplica la sección real cuando ya existe.
  const necesitaBridge = !structure.includes('problem') && HOOK_IDS_SIN_TERRITORIO.includes(blueprint.hook);
  const bridgeLine = necesitaBridge ? buildCampaignBridgeLine(campaignIntent) : null;
  if (bridgeLine) sectionResults.unshift({ section: 'campaignBridge', sourceField: 'campaignTerritory', text: bridgeLine });

  const bodyLines = sectionResults.map((s) => s.text);
  const sectionsUsed = Object.freeze(sectionResults.map((s) => Object.freeze({ section: s.section, sourceField: s.sourceField })));

  // El hook SIEMPRE encabeza el primaryText -- realismo (un "primary text"
  // real de Meta ads suele abrir con el hook) y también porque dos
  // blueprints pueden compartir awareness stage/estructura; el hook, que sí
  // es distinto por diseño (renderHook()/HOOK_STRATEGIES/copyStyle), es lo
  // que garantiza que el primaryText de cada variante también sea único.
  const primaryText = [hook, ...bodyLines, cta].join(' ');
  const isStatic = STATIC_FORMATS.includes(blueprint.format);

  const allText = [hook, ...bodyLines, cta].join(' \n ');
  assertNoForbiddenProductClaims(allText, `generateVariantCopy: variante ${blueprint.id}`);
  assertBrandAvoidCompliance(allText, `generateVariantCopy: variante ${blueprint.id}`);

  return Object.freeze({
    hook,
    headline: hook,
    primaryText,
    cta,
    tone,
    copyStyle: blueprint.copyStyle,
    voiceover: isStatic ? null : Object.freeze([hook, ...bodyLines]),
    script: isStatic ? null : Object.freeze([hook, ...bodyLines]),
    bodyLines: Object.freeze([...bodyLines]),
    sectionsUsed,
    missingFields: Object.freeze([]),
  });
}
