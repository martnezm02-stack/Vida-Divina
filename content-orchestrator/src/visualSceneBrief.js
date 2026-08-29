// visualSceneBrief.js — Corrección "Diversidad Visual" (2026-08-28). Root
// cause real del bug observado en el E2E (Cápsulas Venus): treatment.
// describe() (visualTreatments.js) devuelve el MISMO subject/cameraDirection
// para TODA la pieza (diseñado para diferenciar VARIANTES de un batch, no
// ESCENAS dentro de la misma variante) -- creativeDirector.js solo añadía
// scene.narration al final, así que escenas con distinto narrativeStage
// (HOOK/STORY/PRODUCT/CTA...) terminaban con pose/encuadre/composición
// idénticos.
//
// Este módulo añade la capa que faltaba: UNA acción/encuadre/composición
// real por escena, determinista (tabla real por narrativeStage + rotación
// determinista cuando dos escenas comparten stage), SIN tocar
// visualTreatments.js/assignVisualTreatment() (eso sigue siendo la
// diversidad real ENTRE variantes) ni inventar sujeto/género/entorno nuevos
// (esos siguen viniendo, sin cambios, de visualContinuityContext.js --
// regla no negociable: "MISMA mujer, MISMO contexto global, ACCIONES
// diferentes").

function limpiar(texto) {
  return String(texto ?? '').trim();
}

// Vocabulario real de encuadre/ángulo (Paso 8 del encargo) -- nunca
// aleatorio: cada narrativeStage usa un subconjunto real y coherente con su
// función narrativa (ver BRIEF_BY_STAGE abajo), nunca el catálogo completo.
const SHOT_TYPES = Object.freeze(['medium wide', 'wide', 'medium shot', 'medium close-up', 'close-up']);
const CAMERA_ANGLES = Object.freeze(['frontal', 'three-quarter angle', 'side angle', 'over-the-shoulder']);

/**
 * Tabla real determinista: por cada narrativeStage real (ver
 * creativeStructureEngine.js -- vocabulario completo de las 8 estructuras
 * reales), DOS variantes reales (acción + encuadre + composición +
 * posición corporal + interacción + props) para que, si dos escenas
 * comparten el mismo stage, la segunda no repita la primera (Paso 4/9 del
 * encargo: "diversidad sin romper continuidad"). "occurrence" real (0/1..)
 * elige la variante -- 0 = primary, >=1 = alternate (cíclico).
 */
const BRIEF_BY_STAGE = Object.freeze({
  HOOK: [
    {
      narrativePurpose: 'HOOK', action: 'llega al espacio y capta la atención inicial con un gesto natural',
      shotType: 'medium wide', cameraAngle: 'frontal',
      composition: 'personaje desplazado hacia un lado del encuadre, espacio visible alrededor',
      bodyPosition: 'de pie, recién llegando', interaction: 'mira brevemente hacia cámara', props: Object.freeze([]),
    },
    {
      narrativePurpose: 'HOOK', action: 'se detiene un instante, algo real llama su atención',
      shotType: 'wide', cameraAngle: 'three-quarter angle',
      composition: 'personaje pequeño dentro del encuadre, contexto amplio visible',
      bodyPosition: 'de pie, girada hacia un lado', interaction: 'reacciona a su entorno', props: Object.freeze([]),
    },
  ],
  QUESTION: 'HOOK',
  MYTH: 'HOOK',
  PROBLEM: [
    {
      narrativePurpose: 'PROBLEM', action: 'trabaja frente a la computadora, revisa documentos con cansancio sutil',
      shotType: 'medium close-up', cameraAngle: 'three-quarter angle',
      composition: 'ángulo lateral, foco en expresión y detalle de la tarea',
      bodyPosition: 'sentada, inclinada hacia el escritorio', interaction: 'con documentos/computadora', props: Object.freeze(['documentos', 'computadora']),
    },
    {
      narrativePurpose: 'PROBLEM', action: 'se frota los ojos un momento, pausa breve en medio de la tarea',
      shotType: 'close-up', cameraAngle: 'side angle',
      composition: 'primer plano del rostro, escritorio desenfocado al fondo',
      bodyPosition: 'sentada, apoyada sobre el escritorio', interaction: 'gesto de incomodidad sutil', props: Object.freeze(['escritorio']),
    },
  ],
  REALITY: 'PROBLEM',
  SOLUTION: [
    {
      narrativePurpose: 'SOLUTION', action: 'encuentra un momento de alivio, cambia de postura con más soltura',
      shotType: 'medium shot', cameraAngle: 'frontal',
      composition: 'personaje centrado, entorno visible en profundidad',
      bodyPosition: 'incorporándose, más relajada', interaction: 'con su espacio de trabajo', props: Object.freeze([]),
    },
    {
      narrativePurpose: 'SOLUTION', action: 'retoma la actividad con energía renovada',
      shotType: 'medium wide', cameraAngle: 'over-the-shoulder',
      composition: 'plano compartido entre personaje y su entorno inmediato',
      bodyPosition: 'de pie o girándose hacia el espacio', interaction: 'con su entorno', props: Object.freeze([]),
    },
  ],
  BENEFIT: 'SOLUTION',
  RESULT: 'SOLUTION',
  SOCIAL_PROOF: 'SOLUTION',
  INSIGHT: 'SOLUTION',
  PROOF: 'EDUCATION',
  OBJECTION: 'PROBLEM',
  EDUCATION: [
    {
      narrativePurpose: 'EDUCATION', action: 'explica u observa algo con atención, gesto de descubrimiento',
      shotType: 'medium close-up', cameraAngle: 'frontal',
      composition: 'personaje centrado, elemento explicado visible en el encuadre',
      bodyPosition: 'sentada o de pie, atenta', interaction: 'señala o examina algo cercano', props: Object.freeze([]),
    },
    {
      narrativePurpose: 'EDUCATION', action: 'muestra el detalle que estaba explicando, más cerca de cámara',
      shotType: 'close-up', cameraAngle: 'three-quarter angle',
      composition: 'primer plano del elemento, personaje parcialmente visible',
      bodyPosition: 'inclinada hacia el elemento', interaction: 'sostiene o señala el elemento', props: Object.freeze([]),
    },
  ],
  DEMONSTRATION: [
    {
      narrativePurpose: 'DEMONSTRATION', action: 'demuestra en la práctica cómo se usa o integra en su rutina',
      shotType: 'medium shot', cameraAngle: 'side angle',
      composition: 'plano que incluye manos/acción y contexto real',
      bodyPosition: 'sentada o de pie, manos activas', interaction: 'realiza una acción concreta con las manos', props: Object.freeze([]),
    },
    {
      narrativePurpose: 'DEMONSTRATION', action: 'continúa la demostración desde otro ángulo, más cerca del detalle',
      shotType: 'medium close-up', cameraAngle: 'over-the-shoulder',
      composition: 'foco en la acción de las manos, personaje parcialmente visible',
      bodyPosition: 'inclinada hacia la acción', interaction: 'manipula el elemento real', props: Object.freeze([]),
    },
  ],
  STORY: [
    {
      narrativePurpose: 'STORY', action: 'continúa su actividad, transición natural hacia el siguiente momento del día',
      shotType: 'medium shot', cameraAngle: 'side angle',
      composition: 'personaje centrado, entorno visible en profundidad',
      bodyPosition: 'de pie o en movimiento leve', interaction: 'con su entorno cotidiano', props: Object.freeze([]),
    },
    {
      narrativePurpose: 'STORY', action: 'se traslada a otra parte del mismo espacio, distinta actividad',
      shotType: 'medium wide', cameraAngle: 'three-quarter angle',
      composition: 'personaje desplazado hacia un lado, nuevo detalle del entorno visible',
      bodyPosition: 'caminando o cambiando de posición', interaction: 'con un elemento distinto del entorno', props: Object.freeze([]),
    },
  ],
  PRODUCT: [
    {
      narrativePurpose: 'PRODUCT_REVEAL', action: 'toma el producto real y lo presenta naturalmente hacia cámara',
      shotType: 'medium shot, product-focused', cameraAngle: 'frontal',
      composition: 'producto en primer plano secundario, rostro visible',
      bodyPosition: 'sentada o de pie, brazo extendido hacia el producto', interaction: 'sostiene y muestra el producto', props: Object.freeze(['producto']),
    },
    {
      narrativePurpose: 'PRODUCT_REVEAL', action: 'integra el producto real a su rutina de forma natural',
      shotType: 'medium close-up, product-focused', cameraAngle: 'three-quarter angle',
      composition: 'producto y rostro compartiendo el encuadre',
      bodyPosition: 'sentada, sosteniendo el producto cerca del cuerpo', interaction: 'usa o guarda el producto', props: Object.freeze(['producto']),
    },
  ],
  CTA: [
    {
      narrativePurpose: 'CTA', action: 'se dirige directo a cámara para cerrar el mensaje',
      shotType: 'medium close-up', cameraAngle: 'frontal',
      composition: 'personaje centrado, encuadre cerrado',
      bodyPosition: 'de pie o sentada, mirando a cámara', interaction: 'habla directo a cámara', props: Object.freeze([]),
    },
    {
      narrativePurpose: 'CTA', action: 'cierra con un gesto cálido hacia cámara',
      shotType: 'close-up', cameraAngle: 'frontal',
      composition: 'primer plano del rostro, fondo simple',
      bodyPosition: 'de pie o sentada, cercana a cámara', interaction: 'sonríe o asiente hacia cámara', props: Object.freeze([]),
    },
  ],
});

// emotionalState (Corrección "Flujo creativo integral", 2026-08-28, Paso 6
// del encargo): UNA fuente real por narrativePurpose -- nunca duplicado en
// cada una de las 16 entradas de arriba (DRY real).
const EMOTIONAL_STATE_BY_PURPOSE = Object.freeze({
  HOOK: 'curiosidad, atención inicial',
  PROBLEM: 'incomodidad sutil, cansancio',
  SOLUTION: 'alivio, energía renovada',
  EDUCATION: 'atención, descubrimiento',
  DEMONSTRATION: 'concentración, confianza práctica',
  STORY: 'naturalidad, cotidianidad',
  PRODUCT_REVEAL: 'confianza, cercanía',
  CTA: 'calidez, cercanía final',
});

// sceneNarrativeContext (Corrección "Corrección integral del flujo de
// Crear contenido", 2026-08-28, Paso 10/11 del encargo): "qué parte de la
// historia representa" esta escena real -- UNA fuente real por
// narrativePurpose (mismo criterio DRY real que EMOTIONAL_STATE_BY_PURPOSE
// arriba), genérico por diseño (nunca inventa detalle específico del
// producto/instrucción que esta tabla no puede conocer) -- el detalle real
// específico de la instrucción del usuario sigue viviendo en
// narrativeIntent (visualContinuityContext.js), nunca duplicado aquí.
const NARRATIVE_ARC_CONTEXT_BY_PURPOSE = Object.freeze({
  HOOK: 'inicio de la historia -- presenta al protagonista y la situación inicial',
  PROBLEM: 'la situación inicial afecta su rutina o bienestar',
  SOLUTION: 'transición hacia un estado más positivo',
  EDUCATION: 'explicación o descubrimiento relevante para la historia',
  DEMONSTRATION: 'demostración práctica dentro de la historia',
  STORY: 'continuación natural de la rutina/historia',
  PRODUCT_REVEAL: 'integración del producto en la rutina de forma natural',
  CTA: 'cierre de la historia y llamado a la acción',
});

// Alias reales (Paso 7 del encargo: vocabulario más amplio de
// narrativeStage que las 8 estructuras reales de creativeStructureEngine.js
// ya usan) -- apuntan a la tabla real de arriba, nunca duplican contenido.
function resolveStageEntries(stage) {
  const direct = BRIEF_BY_STAGE[stage];
  if (Array.isArray(direct)) return direct;
  if (typeof direct === 'string') return BRIEF_BY_STAGE[direct];
  return BRIEF_BY_STAGE.STORY; // fallback real y coherente, nunca "sin acción".
}

// visualIntent (scenePlanner.js, derivado de section.type) y narrativeStage
// (creativeStructureEngine.js, alineado al número real de escenas vía
// alignStagesToCount()) son señales reales INDEPENDIENTES -- alinear los
// stages de una estructura de 4 a un Scene Plan de 3 escenas puede
// "perder" la etiqueta real "PRODUCT" del stage (ver alignStagesToCount()),
// pero visualIntent="PRODUCT_REVEAL" (derivado directo de section.type)
// SIEMPRE es correcto y nunca se pierde. Prioriza visualIntent para
// HOOK/PRODUCT/CTA (inequívocos); usa narrativeStage para el resto
// (AUDIENCE_CONTEXT), que es donde el vocabulario real más rico
// (PROBLEM/STORY/SOLUTION/EDUCATION/...) sí aporta.
function resolveSceneStageKey(scene) {
  if (scene.visualIntent === 'PRODUCT_REVEAL') return 'PRODUCT';
  if (scene.visualIntent === 'CTA_BRAND') return 'CTA';
  if (scene.visualIntent === 'CONCEPT_OPENING') return 'HOOK';
  return scene.narrativeStage ?? 'STORY';
}

/**
 * Restricciones reales de continuidad (Paso 1 del encargo: "continuity
 * Constraints") -- documentan, en texto plano auditable, qué NO debe
 * cambiar entre escenas (Paso 5: nunca género/edad/identidad/ropa/entorno
 * "solo para generar variedad"). Mismo valor real para TODAS las escenas.
 */
function buildContinuityConstraints(context) {
  const partes = [];
  if (context.subjectGender) partes.push(`mismo género real del personaje: ${context.subjectGender}`);
  if (context.subjectAgeRange) partes.push(`mismo rango de edad real: ${context.subjectAgeRange}`);
  if (context.wardrobe) partes.push(`mismo vestuario real: ${context.wardrobe}`);
  if (context.environment) partes.push(`mismo entorno base real: ${context.environment}`);
  partes.push('misma identidad visual del personaje en todas las escenas -- nunca cambia solo para generar variedad');
  return Object.freeze(partes);
}

/**
 * Construye UN Visual Scene Brief real por escena del Scene Plan real --
 * nunca un segundo sistema de escenas (Paso 1 del encargo): consume
 * scene.narrativeStage/sceneId ya decididos por scenePlanner.js/
 * creativeStructureEngine.js, nunca reinventa estructura.
 *
 * @param {{scenes: object[], visualContinuityContext: object}} args
 * @returns {object[]} un brief real por escena, mismo orden/longitud que "scenes".
 */
export function buildVisualSceneBriefs({ scenes, visualContinuityContext }) {
  const continuityConstraints = buildContinuityConstraints(visualContinuityContext ?? {});
  const occurrenceByStage = new Map();
  const briefs = [];

  for (const scene of scenes) {
    const stage = resolveSceneStageKey(scene);
    const entries = resolveStageEntries(stage);
    const occurrence = occurrenceByStage.get(stage) ?? 0;
    occurrenceByStage.set(stage, occurrence + 1);
    let entry = entries[occurrence % entries.length];

    // Regla de diversidad (Paso 4 del encargo): si, aun así, esta escena
    // real quedó IDÉNTICA (misma acción+encuadre) a la escena real
    // inmediata anterior (dos narrativeStage distintos que, por tabla,
    // coincidieran) -- se fuerza la variante alterna real del MISMO stage,
    // nunca se deja una repetición real consecutiva.
    const previous = briefs[briefs.length - 1];
    if (previous && previous.action === entry.action && previous.shotType === entry.shotType) {
      entry = entries[(occurrence + 1) % entries.length];
    }

    briefs.push(Object.freeze({
      ...entry,
      emotionalState: EMOTIONAL_STATE_BY_PURPOSE[entry.narrativePurpose] ?? 'natural',
      sceneNarrativeContext: NARRATIVE_ARC_CONTEXT_BY_PURPOSE[entry.narrativePurpose] ?? null,
      lighting: null, // el Creative Director real (creativeDirector.js) ya aporta lightingDirection del treatment -- este campo se completa allí, nunca duplicado aquí.
      continuityConstraints,
    }));
  }

  return Object.freeze(briefs);
}

export const SCENE_BRIEF_SHOT_TYPES = SHOT_TYPES;
export const SCENE_BRIEF_CAMERA_ANGLES = CAMERA_ANGLES;
