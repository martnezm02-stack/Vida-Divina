// creativeStructureEngine.js — Creative Structure Engine (Video + Carrusel).
// Capa nueva entre Creative Strategy (campaignIntent.js/hypothesisCreativeEngine.js)
// y Scene Planner/Carousel Compositor: decide la ESTRUCTURA NARRATIVA de una
// pieza (qué función cumple cada escena/slide -- HOOK/STORY/EDUCATION/
// PRODUCT/CTA/etc.), nunca QUÉ se dice (eso ya lo decidió el copy real,
// hypothesisCopyProvider.js/copyGenerationProvider.js) ni CÓMO se ve
// (Creative Director/Visual Director, creativeDirector.js).
//
// REGLA CENTRAL: la estructura HOOK -> PRODUCTO -> CTA deja de ser el único
// patrón posible -- es una entre 8 estructuras reales del catálogo
// (STRUCTURE_CATALOG), elegida por señales reales (instrucción explícita del
// usuario > CampaignIntent > Creative Variant > plataforma/contentType >
// default), nunca inventada por escena/slide individual.
//
// Este archivo NUNCA genera copy, imágenes, video ni audio -- solo define
// estructura narrativa (stages) y la alinea al número real de escenas/slides
// que Scene Planner/Carousel Compositor ya construyeron a partir del copy
// real (nunca al revés: la estructura nunca fuerza un número de escenas que
// el copy real no tiene).

function limpiar(texto) {
  return String(texto ?? '').trim();
}

/** Vocabulario cerrado de funciones narrativas reales -- toda estructura del catálogo usa un subconjunto de estas. */
export const NARRATIVE_STAGES = Object.freeze([
  'HOOK', 'PROBLEM', 'INSIGHT', 'STORY', 'EDUCATION', 'DEMONSTRATION', 'SOLUTION',
  'PRODUCT', 'BENEFIT', 'PROOF', 'OBJECTION', 'SOCIAL_PROOF', 'CTA', 'QUESTION', 'MYTH', 'REALITY',
]);

export const CONTENT_TYPES = Object.freeze(['VIDEO', 'CAROUSEL']);

// Catálogo real -- máximo 8 estructuras reutilizables (Paso 3 del encargo:
// "NO crear decenas de templates"). "keywords" son señales REALES de
// instrucción explícita del usuario (Paso 7 del encargo) -- nunca se
// inventa una coincidencia, solo se detectan patrones de texto reales.
export const STRUCTURE_CATALOG = Object.freeze([
  Object.freeze({
    structureId: 'HOOK_PROBLEM_SOLUTION_PRODUCT_CTA',
    label: 'Hook → Problema → Solución → Producto → CTA',
    stages: Object.freeze(['HOOK', 'PROBLEM', 'SOLUTION', 'PRODUCT', 'CTA']),
    contentTypes: Object.freeze(['VIDEO', 'CAROUSEL']),
    objective: 'conversión directa a partir de un problema real de la audiencia',
    keywords: Object.freeze([/problema/i, /soluci[oó]n/i, /\bdolor\b/i, /dificultad/i]),
  }),
  Object.freeze({
    structureId: 'HOOK_STORY_PRODUCT_CTA',
    label: 'Hook → Historia → Producto → CTA',
    stages: Object.freeze(['HOOK', 'STORY', 'PRODUCT', 'CTA']),
    contentTypes: Object.freeze(['VIDEO', 'CAROUSEL']),
    objective: 'conectar por narrativa/lifestyle antes de mostrar el producto',
    keywords: Object.freeze([/entrenando/i, /gimnasio/i, /rutina/i, /lifestyle/i, /d[ií]a a d[ií]a/i, /de forma natural/i]),
  }),
  Object.freeze({
    structureId: 'HOOK_EDUCATION_PRODUCT_CTA',
    label: 'Hook → Educación → Producto → CTA',
    stages: Object.freeze(['HOOK', 'EDUCATION', 'PRODUCT', 'CTA']),
    contentTypes: Object.freeze(['VIDEO', 'CAROUSEL']),
    objective: 'educar sobre un tema antes de introducir el producto',
    keywords: Object.freeze([/explicar/i, /aprende/i, /tres (razones|aspectos|beneficios|cosas)/i, /c[oó]mo funciona/i, /importantes? para/i]),
  }),
  Object.freeze({
    structureId: 'HOOK_DEMONSTRATION_PRODUCT_CTA',
    label: 'Hook → Demostración → Producto → CTA',
    stages: Object.freeze(['HOOK', 'DEMONSTRATION', 'PRODUCT', 'CTA']),
    contentTypes: Object.freeze(['VIDEO']),
    objective: 'mostrar el uso real del producto',
    keywords: Object.freeze([/c[oó]mo se usa/i, /demostrac/i, /paso a paso/i, /tutorial/i]),
  }),
  Object.freeze({
    structureId: 'HOOK_INSIGHT_BENEFIT_PRODUCT_CTA',
    label: 'Hook → Insight → Beneficio → Producto → CTA',
    stages: Object.freeze(['HOOK', 'INSIGHT', 'BENEFIT', 'PRODUCT', 'CTA']),
    contentTypes: Object.freeze(['VIDEO', 'CAROUSEL']),
    objective: 'revelar una idea no obvia que conecta con un beneficio real',
    keywords: Object.freeze([/sab[ií]as que/i, /\binsight\b/i, /dato curioso/i]),
  }),
  Object.freeze({
    structureId: 'MYTH_REALITY_PRODUCT_CTA',
    label: 'Mito → Realidad → Producto → CTA',
    stages: Object.freeze(['MYTH', 'REALITY', 'PRODUCT', 'CTA']),
    contentTypes: Object.freeze(['VIDEO', 'CAROUSEL']),
    objective: 'corregir una creencia equivocada de la audiencia',
    keywords: Object.freeze([/\bmito\b/i, /\bfalso\b/i, /cre(e|é)s que/i, /no es cierto/i]),
  }),
  Object.freeze({
    structureId: 'QUESTION_EDUCATION_PRODUCT_CTA',
    label: 'Pregunta → Educación → Producto → CTA',
    stages: Object.freeze(['QUESTION', 'EDUCATION', 'PRODUCT', 'CTA']),
    contentTypes: Object.freeze(['VIDEO', 'CAROUSEL']),
    objective: 'abrir con una pregunta real de la audiencia para generar curiosidad',
    keywords: Object.freeze([/te has preguntado/i, /por qu[eé]\b.*\?/i, /\?\s*$/]),
  }),
  Object.freeze({
    structureId: 'STORY_INSIGHT_PRODUCT_CTA',
    label: 'Historia → Insight → Producto → CTA',
    stages: Object.freeze(['STORY', 'INSIGHT', 'PRODUCT', 'CTA']),
    contentTypes: Object.freeze(['VIDEO', 'CAROUSEL']),
    objective: 'narrativa personal que revela un insight antes del producto',
    keywords: Object.freeze([/mi historia/i, /les cuento/i, /me pas[oó]/i, /quiero contar una experiencia/i]),
  }),
]);

// Backward compatibility (Paso 20 del encargo): proyectos/llamadas
// existentes que nunca pasan "creativeStructure" siguen produciendo,
// EXPLÍCITAMENTE etiquetados como legacy -- nunca un vacío silencioso.
export const LEGACY_STRUCTURE = Object.freeze({
  structureId: 'LEGACY_HOOK_CONTEXT_PRODUCT_CTA',
  label: 'Hook → Contexto → Producto → CTA (legacy)',
  stages: Object.freeze(['HOOK', 'PROBLEM', 'PRODUCT', 'CTA']),
  contentTypes: Object.freeze(['VIDEO', 'CAROUSEL']),
  objective: 'compatibilidad retroactiva -- mismo patrón fijo que el sistema usaba antes del Creative Structure Engine',
  keywords: Object.freeze([]),
});

const ALL_STRUCTURES = Object.freeze([...STRUCTURE_CATALOG, LEGACY_STRUCTURE]);

function findStructure(structureId) {
  return ALL_STRUCTURES.find((s) => s.structureId === structureId) ?? null;
}

/** Máximo 8 estructuras compatibles con este contentType (Paso 10 del encargo: "no mostrar 30 estructuras"). Nunca incluye LEGACY_STRUCTURE (esa es solo un fallback interno, no una opción real que el usuario elija). */
export function listCompatibleStructures({ contentType }) {
  const compatibles = STRUCTURE_CATALOG.filter((s) => s.contentTypes.includes(contentType));
  return compatibles.length > 0 ? compatibles : [...STRUCTURE_CATALOG];
}

function matchByInstruction(userInstruction, compatibles) {
  const texto = limpiar(userInstruction);
  if (!texto) return null;
  return compatibles.find((s) => s.keywords.some((re) => re.test(texto))) ?? null;
}

function matchByCampaignIntent(campaignIntent, compatibles) {
  if (!campaignIntent) return null;
  const { awarenessStage, campaignObjective } = campaignIntent;
  const buscar = (id) => compatibles.find((s) => s.structureId === id) ?? null;
  if (awarenessStage === 'Unaware') return buscar('QUESTION_EDUCATION_PRODUCT_CTA');
  if (awarenessStage === 'Problem Aware' && campaignObjective === 'conversion') return buscar('HOOK_PROBLEM_SOLUTION_PRODUCT_CTA');
  if (campaignObjective === 'launch') return buscar('HOOK_INSIGHT_BENEFIT_PRODUCT_CTA');
  if (campaignObjective === 'engagement') return buscar('HOOK_STORY_PRODUCT_CTA');
  return null;
}

const STRUCTURE_ID_BY_COPY_STYLE = Object.freeze({
  STORYTELLING: 'HOOK_STORY_PRODUCT_CTA',
  EDUCATIONAL: 'HOOK_EDUCATION_PRODUCT_CTA',
  POV: 'STORY_INSIGHT_PRODUCT_CTA',
  DIRECT_RESPONSE: 'HOOK_PROBLEM_SOLUTION_PRODUCT_CTA',
  LIFESTYLE: 'HOOK_STORY_PRODUCT_CTA',
  UGC_CONVERSATIONAL: 'HOOK_PROBLEM_SOLUTION_PRODUCT_CTA',
});

function matchByCreativeVariant(creativeVariant, compatibles) {
  const copyStyle = creativeVariant?.copyStyle ?? creativeVariant?.creativeVariant?.copyStyle ?? null;
  const structureId = copyStyle ? STRUCTURE_ID_BY_COPY_STYLE[copyStyle] : null;
  return structureId ? (compatibles.find((s) => s.structureId === structureId) ?? null) : null;
}

function matchByPlatformContentType(contentType, compatibles) {
  if (contentType === 'CAROUSEL') return compatibles.find((s) => s.structureId === 'HOOK_EDUCATION_PRODUCT_CTA') ?? compatibles[0] ?? null;
  return null;
}

/**
 * Recomienda una estructura real -- prioridad real (Paso 8 del encargo):
 * 1. userInstruction explícita, 2. CampaignIntent, 3. Creative Variant,
 * 4. plataforma/contentType, 5. default (primera estructura del catálogo
 * compatible). NUNCA decide por Product Knowledge todavía (ningún criterio
 * real de negocio distingue estructura por producto en este catálogo) --
 * queda documentado como paso saltado, no simulado.
 *
 * @param {{userInstruction?:?string, campaignIntent?:?object, creativeVariant?:?object, productFacts?:?object, platform?:?string, contentType?:string, angle?:?string, hook?:?string}} args
 */
export function recommendStructure({
  userInstruction = null, campaignIntent = null, creativeVariant = null, productFacts = null,
  platform = null, contentType = 'VIDEO', angle = null, hook = null,
}) {
  if (!CONTENT_TYPES.includes(contentType)) {
    throw new Error(`recommendStructure: "contentType" debe ser uno de ${CONTENT_TYPES.join(', ')} (recibido "${contentType}").`);
  }
  const compatibles = listCompatibleStructures({ contentType });
  const cadena = [
    { source: 'userInstruction', match: matchByInstruction(userInstruction, compatibles), detalle: `la instrucción del usuario ("${limpiar(userInstruction)}") sugiere este enfoque narrativo` },
    { source: 'campaignIntent', match: matchByCampaignIntent(campaignIntent, compatibles), detalle: 'el objetivo/etapa de conciencia de esta campaña sugiere este enfoque' },
    { source: 'creativeVariant', match: matchByCreativeVariant(creativeVariant, compatibles), detalle: 'el estilo de copy de esta variante sugiere este enfoque' },
    { source: 'platform/contentType', match: matchByPlatformContentType(contentType, compatibles), detalle: `es el enfoque recomendado por defecto para ${contentType === 'CAROUSEL' ? 'carrusel' : 'video'}` },
  ];
  const encontrada = cadena.find((c) => c.match);
  const elegida = encontrada?.match ?? compatibles[0];
  const recommendationReason = encontrada
    ? `Recomendada por ${encontrada.source}: ${encontrada.detalle}.`
    : `Recomendada por defecto: ${elegida.objective}.`;

  return Object.freeze({
    structureId: elegida.structureId,
    label: elegida.label,
    stages: Object.freeze([...elegida.stages]),
    objective: elegida.objective,
    recommendationReason,
    matchedBy: encontrada?.source ?? 'default',
  });
}

/**
 * Aplica la selección manual del usuario (Paso 9 del encargo: "el usuario
 * puede seleccionar otra") sobre una recomendación ya calculada -- nunca
 * recalcula la recomendación en sí (esa sigue siendo la real de
 * recommendStructure(), preservada en recommendationReason para lineage).
 */
export function selectStructure({ selectedStructureId = null, recommendation, contentType = 'VIDEO' }) {
  if (!recommendation) throw new Error('selectStructure: "recommendation" es obligatoria (ver recommendStructure()).');
  if (!selectedStructureId || selectedStructureId === recommendation.structureId) {
    return Object.freeze({ ...recommendation, selectionMode: 'automatic' });
  }
  const encontrada = findStructure(selectedStructureId);
  if (!encontrada) throw new Error(`selectStructure: "selectedStructureId" ("${selectedStructureId}") no existe en el catálogo real del Creative Structure Engine.`);
  if (!encontrada.contentTypes.includes(contentType)) {
    throw new Error(`selectStructure: la estructura "${encontrada.structureId}" no es compatible con contentType "${contentType}".`);
  }
  return Object.freeze({
    structureId: encontrada.structureId,
    label: encontrada.label,
    stages: Object.freeze([...encontrada.stages]),
    objective: encontrada.objective,
    recommendationReason: recommendation.recommendationReason,
    matchedBy: recommendation.matchedBy,
    selectionMode: 'user_selected',
  });
}

/**
 * Alinea una secuencia de stages (de una estructura del catálogo) a un
 * número real de escenas/slides -- reutilizada IDÉNTICA por
 * scenePlanner.js (video) y carouselCompositor.js (carrusel), Paso 26 del
 * encargo ("sin duplicar lógica"). Ancla siempre el primer y último stage
 * (apertura/cierre real de la pieza); el resto se recorta o se repite
 * cíclicamente -- NUNCA inventa un stage fuera de NARRATIVE_STAGES ni
 * cambia el número real de escenas/slides que el copy ya determinó.
 */
export function alignStagesToCount(stages, count) {
  if (!Array.isArray(stages) || stages.length === 0) throw new Error('alignStagesToCount: "stages" debe ser un arreglo no vacío.');
  if (!(Number.isInteger(count) && count >= 1)) throw new Error('alignStagesToCount: "count" debe ser un entero >= 1.');
  if (stages.length === count) return [...stages];
  if (count === 1) return [stages[0]];

  const first = stages[0];
  const last = stages[stages.length - 1];
  const middleSource = stages.slice(1, -1);
  const middleCount = count - 2;
  if (middleCount <= 0) return count === 2 ? [first, last] : Array(count).fill(first);

  let middle;
  if (middleSource.length === 0) {
    middle = Array(middleCount).fill(first === last ? first : 'PRODUCT');
  } else if (middleCount <= middleSource.length) {
    middle = [];
    for (let i = 0; i < middleCount; i += 1) {
      middle.push(middleSource[Math.floor((i * middleSource.length) / middleCount)]);
    }
  } else {
    middle = [];
    for (let i = 0; i < middleCount; i += 1) middle.push(middleSource[i % middleSource.length]);
  }
  return [first, ...middle, last];
}

/**
 * Punto de entrada único del Creative Structure Engine (Paso 1 del
 * encargo). Combina recomendación + selección manual real en UN objeto
 * `creativeStructure` (esquema del Paso 2) -- SIN alinear todavía al
 * número real de escenas/slides (eso lo decide scenePlanner.js/
 * carouselCompositor.js con el conteo real que solo ELLOS conocen, tras
 * consumir el copy real).
 *
 * @param {{
 *   userInstruction?:?string, campaignIntent?:?object, creativeVariant?:?object, productFacts?:?object,
 *   platform?:?string, contentType?:string, angle?:?string, hook?:?string, selectedStructureId?:?string,
 * }} args
 */
export function buildCreativeStructure({
  userInstruction = null, campaignIntent = null, creativeVariant = null, productFacts = null,
  platform = null, contentType = 'VIDEO', angle = null, hook = null, selectedStructureId = null,
}) {
  const recommendation = recommendStructure({ userInstruction, campaignIntent, creativeVariant, productFacts, platform, contentType, angle, hook });
  const selection = selectStructure({ selectedStructureId, recommendation, contentType });

  return Object.freeze({
    structureId: selection.structureId,
    contentType,
    objective: selection.objective,
    stages: selection.stages,
    label: selection.label,
    recommendedSceneCount: contentType === 'VIDEO' ? selection.stages.length : null,
    recommendedSlideCount: contentType === 'CAROUSEL' ? selection.stages.length : null,
    rationale: selection.recommendationReason,
    recommendedStructure: Object.freeze({ structureId: recommendation.structureId, label: recommendation.label, stages: recommendation.stages, rationale: recommendation.recommendationReason }),
    selectedStructure: Object.freeze({ structureId: selection.structureId, label: selection.label, stages: selection.stages }),
    selectionMode: selection.selectionMode,
    recommendationReason: selection.recommendationReason,
  });
}

/**
 * Vista previa real para la UI (Paso 9/10/16 del encargo): "Estructura
 * sugerida" + hasta 8 opciones reales compatibles (recomendada primero) --
 * ANTES de producir nada, para que el usuario pueda "Cambiar estructura"
 * sin gastar un render real.
 */
export function previewStructureOptions({
  userInstruction = null, campaignIntent = null, creativeVariant = null, productFacts = null,
  platform = null, contentType = 'VIDEO', angle = null, hook = null,
}) {
  const recommendation = recommendStructure({ userInstruction, campaignIntent, creativeVariant, productFacts, platform, contentType, angle, hook });
  const compatibles = listCompatibleStructures({ contentType });
  const resto = compatibles
    .filter((s) => s.structureId !== recommendation.structureId)
    .map((s) => Object.freeze({ structureId: s.structureId, label: s.label, stages: Object.freeze([...s.stages]), objective: s.objective }));
  const options = Object.freeze([
    Object.freeze({ structureId: recommendation.structureId, label: recommendation.label, stages: recommendation.stages, objective: recommendation.objective, recommended: true }),
    ...resto.slice(0, 7),
  ]);
  return Object.freeze({ recommended: recommendation, options });
}
