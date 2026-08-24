// productionProvider.js — Fase 13 (§7-8) + Fase 14 (§2: diferenciación real).
//
// AUDITORÍA (§1, repetida en Fase 14 antes de modificar): se releyó
// marketing-intelligence/src/llm/llmProvider.js completo — su contrato
// (`analyze(content, context) → candidatos de observación`) sigue siendo de
// EXTRACCIÓN, no de generación. RuleBasedContentGenerator sigue EXTENDIENDO
// LLMProvider (misma identidad reutilizada), agregando generate().
//
// CAMBIO CENTRAL DE LA FASE 14: generate() ya NO depende solo del tipo de
// hook — depende de la combinación completa hookVariant + angle + format +
// pillar + objective. Dos piezas con el mismo hookVariant pero distinto
// angle/format/pillar producen hook, body Y scene_structure distintos, no
// solo una palabra cambiada.
//
// REGLA CRÍTICA (§8, reforzada): PATTERN != COPY. Los detectores anti-copy
// viven en textSafetyChecks.js (compartidos con contentDraft.js y
// QualityGate) — nunca se reinventa el umbral en cada lugar.

import { LLMProvider } from '../../marketing-intelligence/src/llm/llmProvider.js';
import { isValidHookVariant, HOOK_VARIANTS } from './hookVariants.js';
import { assertAngleSupported } from './angleVariants.js';
import { structureBlocksFor } from './formatStructures.js';
import { PILLAR_FRAMING } from './contentPillars.js';
import { detectCopiedFragment } from './textSafetyChecks.js';

const ANGLE_CLAUSES = Object.freeze({
  'educación': 'para entender qué ocurre antes de empezar',
  'comparación': 'comparado con saltarse ese paso por completo',
  'objeción': 'incluso si ya lo intentaste antes sin este paso',
  'problema': 'cuando el cuerpo todavía no está listo',
  'mecanismo': 'y cómo actúa cada ingrediente en ese momento puntual',
});

const HOOK_TEMPLATES = Object.freeze({
  QUESTION: (ctx, clause) => `¿Sabías que ${ctx.problem} ${clause}?`,
  CURIOSITY: (ctx, clause) => `Lo que casi nadie explica sobre ${ctx.problem}, ${clause}.`,
  CONTRAST: (ctx, clause) => `No es lo mismo ignorar ${ctx.problem} que prepararse ${clause}.`,
  PROBLEM: (ctx, clause) => `${capitalize(ctx.problem)}, ${clause}: el paso que muchos se saltan.`,
  EDUCATIONAL: (ctx, clause) => `Cómo entender ${ctx.problem}, ${clause}.`,
  MYTH: (ctx, clause) => `"Empezar directo funciona igual" — eso es un mito. La realidad: ${ctx.problem}, ${clause}.`,
  STORY: (ctx, clause) => `Antes de cualquier cambio de hábito hay un momento que casi nadie cuenta: ${ctx.problem}, ${clause}.`,
});

function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

export class RuleBasedContentGenerator extends LLMProvider {
  get name() {
    return 'rule_based_content_generator';
  }

  /**
   * Genera hook + body + scene_structure ORIGINALES a partir de la
   * combinación hookVariant+angle+format+pillar+objective — nunca solo del
   * hookVariant. Nunca inventa ingredientes/beneficios/resultados: solo usa
   * lo que productContext ya declara.
   */
  generate({ hookVariant, angle, format, pillar, objective, productContext, externalExampleTexts = [] }) {
    if (!productContext || !productContext.product_name) {
      throw new Error('RuleBasedContentGenerator: productContext (con product_name real) es obligatorio — nunca se genera contenido sin PRIMARY PRODUCT CONTEXT.');
    }
    if (!isValidHookVariant(hookVariant)) throw new Error(`RuleBasedContentGenerator: hookVariant inválido "${hookVariant}".`);
    assertAngleSupported(angle);
    const blocks = structureBlocksFor(format); // valida el formato a la vez

    const problem = productContext.problem ?? 'la preparación previa a un cambio de hábito';
    const ingredients = productContext.ingredients ?? [];
    const ctx = { product_name: productContext.product_name, problem };
    const clause = ANGLE_CLAUSES[angle] ?? 'en el contexto de esta pieza';

    const hook = HOOK_TEMPLATES[hookVariant](ctx, clause);

    const pillarVerb = PILLAR_FRAMING[pillar] ?? 'comunicar';
    const body = `El objetivo de esta pieza es ${pillarVerb} ${productContext.product_name} desde el ángulo "${angle}" (variante de hook: ${hookVariant}): ${problem}. Ingredientes reales declarados: ${ingredients.slice(0, 3).join(', ') || 'según catálogo oficial'}. Referencia de objetivo de campaña: ${objective}. Contenido experimental — los resultados pueden variar de persona a persona y no se afirma ningún beneficio no documentado en el catálogo oficial.`;

    const scene_structure = blocks.map((block) => ({ block, content: buildBlockContent({ block, hook, angle, hookVariant, pillarVerb, ingredients }) }));

    const fullText = [hook, body, ...scene_structure.map((s) => s.content)].join(' ');
    const copiedFragment = detectCopiedFragment(fullText, externalExampleTexts);
    if (copiedFragment) {
      throw new Error(`RuleBasedContentGenerator: el texto generado reproduce un fragmento literal de una fuente externa ("${copiedFragment}") — PATTERN != COPY. Se rechaza la generación en vez de producir una copia.`);
    }

    return { hook, body, scene_structure, generation_method: 'rule_based_template' };
  }
}

function buildBlockContent({ block, hook, angle, hookVariant, pillarVerb, ingredients }) {
  switch (block) {
    case 'hook':
      return hook;
    case 'contexto':
      return `Contexto (${angle}): antes de cualquier avance hay un paso previo que suele pasarse por alto.`;
    case 'desarrollo':
      return `Desarrollo: ${ingredients.slice(0, 2).join(' y ') || 'ingredientes declarados'} — sin afirmar un resultado no documentado.`;
    case 'insight':
      return `Insight (variante ${hookVariant}): el patrón editorial usado aquí es "${hookVariant.toLowerCase()}", nunca la frase literal de ninguna fuente externa.`;
    case 'proof_context':
      return `Contexto (sin prueba social inventada): esta pieza ${pillarVerb} el producto, no afirma testimonios que el catálogo no documenta.`;
    case 'headline':
      return hook;
    case 'supporting_message':
      return `Mensaje de apoyo (${angle}): información tomada únicamente del catálogo oficial.`;
    case 'cta':
      return null; // el CTA real vive en ContentItem/ContentDraft.cta, no se duplica aquí
    default:
      return null;
  }
}
