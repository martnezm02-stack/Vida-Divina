// visualTreatments.js — Creative Director (2026-08-27). Biblioteca real de
// Visual Treatments: 10 formas reales, mutuamente distintas, de poner en
// escena la MISMA campaña (Paso 2 del encargo Creative Director). Cada
// treatment declara CÓMO se ve una escena (sujeto/entorno/cámara/luz/
// movimiento/tono/overlay) -- nunca decide QUÉ decir (eso ya lo resolvió
// campaignIntent.js/hypothesisCreativeEngine.js) ni QUÉ producto mostrar
// (eso lo decide creativeDirector.js consultando productRawAssets reales,
// nunca este archivo).
//
// Distinto de VISUAL_STYLES (creative-intelligence/src/marketingPlaybook.js,
// 5 estilos ya usados por hypothesisCreativeEngine.js#buildVisualDirection
// para la FICHA de dirección visual por variante) -- este archivo NO lo
// reemplaza ni lo duplica: sigue siendo la fuente real de
// sceneDescription/cameraDirection "clásicos" a nivel de VariantBlueprint.
// VISUAL_TREATMENTS es una capa nueva y más granular, pensada para asignar
// un tratamiento por ESCENA/VARIANTE dentro de un batch real, con
// diversidad garantizada entre variantes (Paso 3 del encargo).

import { createHash } from 'node:crypto';

function limpiar(texto) {
  return String(texto ?? '').trim();
}

function describeBase({
  subject, environment, cameraDirection, lightingDirection, moodDirection, motionDirection, textOverlayIntent,
}) {
  return Object.freeze({
    subject, environment, cameraDirection, lightingDirection, moodDirection, motionDirection, textOverlayIntent,
  });
}

export const VISUAL_TREATMENTS = Object.freeze({
  LIFESTYLE: {
    id: 'LIFESTYLE',
    label: 'Lifestyle',
    describe: ({ audience, territory }) => describeBase({
      subject: `${limpiar(audience)}, en un momento cotidiano real conectado con ${limpiar(territory)}`,
      environment: 'Espacio de vida real, luminoso, cuidado pero no artificial (hogar, exterior urbano tranquilo).',
      cameraDirection: 'Plano medio, cámara estática, ligera profundidad de campo.',
      lightingDirection: 'Luz natural cálida de interior o exterior.',
      moodDirection: 'Aspiracional, cercano, auténtico -- nunca una escena de estudio impersonal.',
      motionDirection: 'Movimiento lento y fluido, sin cortes bruscos.',
      textOverlayIntent: 'Tipografía grande y espaciada, aparición suave (fade in).',
    }),
  },
  UGC: {
    id: 'UGC',
    label: 'UGC',
    describe: ({ audience, territory }) => describeBase({
      subject: `${limpiar(audience)} grabándose a sí misma/o, estilo contenido generado por usuario, hablando sobre ${limpiar(territory)}`,
      environment: 'Ambiente doméstico real, sin producción de estudio.',
      cameraDirection: 'Cámara en mano o estilo selfie, encuadre cercano.',
      lightingDirection: 'Luz natural de interior, sin iluminación de estudio.',
      moodDirection: 'Espontáneo, cercano, sin pulir -- estética nativa de redes, no publicitaria.',
      motionDirection: 'Movimiento leve e imperfecto de cámara en mano, sin estabilización de estudio.',
      textOverlayIntent: 'Texto mínimo, estilo subtítulo casual, aparece y desaparece rápido.',
    }),
  },
  FITNESS_GYM: {
    id: 'FITNESS_GYM',
    label: 'Fitness / Gym',
    describe: ({ audience, territory }) => describeBase({
      subject: `${limpiar(audience)} entrenando con energía en un gimnasio moderno, en el contexto de ${limpiar(territory)}`,
      environment: 'Gimnasio contemporáneo real: equipos visibles, espacio amplio, sin marcas ajenas dominantes.',
      cameraDirection: 'Encuadre dinámico, ligero movimiento que acompaña el esfuerzo físico.',
      lightingDirection: 'Luz industrial cálida o luz natural de ventanal amplio.',
      moodDirection: 'Energético, disciplinado, vital.',
      motionDirection: 'Movimiento con ritmo, cortes marcados por el esfuerzo físico.',
      textOverlayIntent: 'Texto corto, tipo etiqueta de rendimiento, alineado al ritmo del movimiento.',
    }),
  },
  PRODUCT_DEMO: {
    id: 'PRODUCT_DEMO',
    label: 'Product Demo',
    describe: ({ audience, territory }) => describeBase({
      subject: `Demostración práctica de uso relacionada con ${limpiar(territory)}, protagonizada por ${limpiar(audience)}`,
      environment: 'Superficie limpia y funcional (cocina, mesa de trabajo), luz uniforme.',
      cameraDirection: 'Encuadre cercano sobre las manos/acción, cámara estática.',
      lightingDirection: 'Luz uniforme y difusa, sin sombras duras.',
      moodDirection: 'Claro, práctico, informativo.',
      motionDirection: 'Movimiento natural de manos, cámara estática.',
      textOverlayIntent: 'Texto numerado breve (estilo paso a paso), sincronizado con la acción.',
    }),
  },
  MORNING_ROUTINE: {
    id: 'MORNING_ROUTINE',
    label: 'Morning Routine',
    describe: ({ audience, territory }) => describeBase({
      subject: `${limpiar(audience)} en su rutina matutina real, en el contexto de ${limpiar(territory)}`,
      environment: 'Cocina o espacio doméstico luminoso, hora de la mañana.',
      cameraDirection: 'Plano medio a cercano, cámara estática o leve movimiento de acompañamiento.',
      lightingDirection: 'Luz cálida de mañana entrando por una ventana.',
      moodDirection: 'Tranquilo, ritual, esperanzador -- inicio de un buen día.',
      motionDirection: 'Movimiento lento y fluido, sin cortes bruscos.',
      textOverlayIntent: 'Tipografía suave, aparición gradual.',
    }),
  },
  CINEMATIC: {
    id: 'CINEMATIC',
    label: 'Product Cinematic',
    describe: ({ territory }) => describeBase({
      subject: `Composición cinematográfica y premium centrada en el producto real, en torno a ${limpiar(territory)}`,
      environment: 'Fondo controlado, minimalista, alto contraste, sin elementos que distraigan.',
      cameraDirection: 'Encuadre cuidado, cámara estática o movimiento lento tipo dolly.',
      lightingDirection: 'Iluminación de estudio dramática y controlada, con reflejos definidos.',
      moodDirection: 'Premium, aspiracional, editorial.',
      motionDirection: 'Movimiento mínimo y deliberado, ritmo pausado.',
      textOverlayIntent: 'Tipografía elegante y espaciada, aparición lenta.',
    }),
  },
  EDUCATIONAL: {
    id: 'EDUCATIONAL',
    label: 'Educational',
    describe: ({ territory }) => describeBase({
      subject: `Explicación clara y visual relacionada con ${limpiar(territory)}`,
      environment: 'Fondo limpio y neutro, estilo editorial.',
      cameraDirection: 'Encuadre cenital o frontal, cámara estática.',
      lightingDirection: 'Luz uniforme y difusa, sin sombras duras.',
      moodDirection: 'Curioso, claro, confiable.',
      motionDirection: 'Cámara estática, foco progresivo hacia el elemento explicado.',
      textOverlayIntent: 'Etiquetas de texto claras, tipo infografía, alineadas a cada elemento mostrado.',
    }),
  },
  SOCIAL_CASUAL: {
    id: 'SOCIAL_CASUAL',
    label: 'Social / Casual',
    describe: ({ audience, territory }) => describeBase({
      subject: `Momento espontáneo y cotidiano de ${limpiar(audience)}, relacionado con ${limpiar(territory)}`,
      environment: 'Entorno social real (calle, café, espacio compartido), sin producción de estudio.',
      cameraDirection: 'Encuadre relajado, cámara en mano ligera.',
      lightingDirection: 'Luz natural de exterior o interior cotidiano.',
      moodDirection: 'Orgánico, relajado, genuino.',
      motionDirection: 'Movimiento natural, sin coreografía visible.',
      textOverlayIntent: 'Texto casual, tipo caption de red social.',
    }),
  },
  PRODUCT_HUMAN: {
    id: 'PRODUCT_HUMAN',
    label: 'Product + Human',
    describe: ({ audience, territory }) => describeBase({
      subject: `${limpiar(audience)} interactuando de forma natural con el producto real, en el contexto de ${limpiar(territory)}`,
      environment: 'Espacio real cotidiano, foco compartido entre la persona y el producto.',
      cameraDirection: 'Plano medio, encuadre que incluye tanto a la persona como el producto en su mano.',
      lightingDirection: 'Luz natural equilibrada.',
      moodDirection: 'Cercano, confiable, humano.',
      motionDirection: 'Movimiento suave, sin cortes bruscos.',
      textOverlayIntent: 'Texto breve de acompañamiento, no invasivo.',
    }),
  },
  TALKING_HEAD: {
    id: 'TALKING_HEAD',
    label: 'Talking Head',
    describe: ({ audience, territory }) => describeBase({
      subject: `${limpiar(audience)} hablando directo a cámara sobre ${limpiar(territory)}`,
      environment: 'Fondo simple y cuidado, sin distracciones visuales.',
      cameraDirection: 'Encuadre frontal a la altura de los ojos, cámara estática.',
      lightingDirection: 'Luz frontal suave, tipo entrevista.',
      moodDirection: 'Directo, confiable, personal.',
      motionDirection: 'Cámara estática, sin movimiento de escena.',
      textOverlayIntent: 'Subtítulos sincronizados con la voz, estilo entrevista.',
    }),
  },
});

export const VISUAL_TREATMENT_IDS = Object.freeze(Object.keys(VISUAL_TREATMENTS));

export function assertValidVisualTreatment(treatmentId) {
  if (!VISUAL_TREATMENT_IDS.includes(treatmentId)) {
    throw new Error(`visualTreatments: "${treatmentId}" no es un VisualTreatment válido (${VISUAL_TREATMENT_IDS.join(', ')}).`);
  }
}

// Afinidad real por palabra clave del brief -- NO decide el tratamiento por
// sí sola (eso rompería la diversidad real entre variantes, Paso 3: "no
// crear diversidad superficial"), solo reordena qué tratamientos quedan
// PRIMERO en la rotación real cuando el territorio/audiencia de la campaña
// los hace más pertinentes ("coherente con la campaña", Paso 3).
const KEYWORD_AFFINITY = Object.freeze([
  { pattern: /gimnasio|entrenar|entrenamiento|fitness|ejercicio|m[uú]sculo|fuerza|rendimiento f[ií]sico/i, treatmentId: 'FITNESS_GYM' },
  { pattern: /ma[nñ]ana|rutina matutina|despertar|desayuno/i, treatmentId: 'MORNING_ROUTINE' },
  { pattern: /oficina|trabajo|escritorio|reuni[oó]n|productividad/i, treatmentId: 'SOCIAL_CASUAL' },
  { pattern: /ingredientes?|f[oó]rmula|compuesto|nutrientes?/i, treatmentId: 'EDUCATIONAL' },
]);

/**
 * Orden real de tratamientos para UNA campaña real: prioriza (sin excluir
 * al resto) los tratamientos con afinidad real de palabra clave, y rota el
 * resto de forma determinista según un hash real del campaignId/brief real
 * -- así campañas distintas no arrancan siempre en el mismo tratamiento
 * (Paso 3), pero la MISMA campaña siempre produce el MISMO orden real
 * (reproducible, auditable).
 */
export function batchTreatmentOrder({ campaignIntent = null, campaignId = null } = {}) {
  const order = [...VISUAL_TREATMENT_IDS];
  const briefText = campaignIntent
    ? [campaignIntent.campaignTerritory, campaignIntent.targetAudience, campaignIntent.problemOrNeed].filter(Boolean).join(' ')
    : '';
  const afinidad = new Set(KEYWORD_AFFINITY.filter((k) => k.pattern.test(briefText)).map((k) => k.treatmentId));

  const seedSource = limpiar(campaignId) || briefText || 'default-visual-treatment-seed';
  const hash = createHash('sha256').update(seedSource, 'utf8').digest();
  const offset = hash[0] % order.length;
  const rotated = [...order.slice(offset), ...order.slice(0, offset)];

  return Object.freeze([
    ...rotated.filter((id) => afinidad.has(id)),
    ...rotated.filter((id) => !afinidad.has(id)),
  ]);
}

/**
 * Asigna UN VisualTreatment real por variante -- garantiza que, dentro de
 * un mismo batch (variantIndex 0..9), ninguna de las 10 variantes reales
 * repita tratamiento (Paso 3: "no permitir que todas las variantes de una
 * campaña utilicen el mismo tratamiento"); a partir de la variante #11
 * (poco común -- ver MAX_VARIANT_COUNT en hypothesisCreativeEngine.js), la
 * rotación real vuelve a empezar, nunca lanza ni bloquea la generación.
 *
 * @param {{variantIndex:number, campaignIntent?:?object, campaignId?:?string}} args
 */
export function assignVisualTreatment({ variantIndex, campaignIntent = null, campaignId = null }) {
  if (!Number.isInteger(variantIndex) || variantIndex < 0) {
    throw new Error(`assignVisualTreatment: "variantIndex" debe ser un entero >= 0 (recibido ${variantIndex}).`);
  }
  const order = batchTreatmentOrder({ campaignIntent, campaignId });
  const treatmentId = order[variantIndex % order.length];
  return VISUAL_TREATMENTS[treatmentId];
}
