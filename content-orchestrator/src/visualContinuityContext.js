// visualContinuityContext.js — Corrección integral "Crear contenido"
// (2026-08-28), Paso 8/9/10 del encargo. Contexto visual global real, UNA
// vez por Creative Variant, que creativeDirector.js debe propagar TAL CUAL
// a todas las escenas -- root cause real del bug observado ("una escena
// muestra un hombre y otra una mujer"): treatment.describe() (ver
// visualTreatments.js) recibía "audience"/"territory" recomputados con
// fallbacks distintos en cada llamada (campaignIntent?.targetAudience,
// territory cayendo a scene.narration -- que SÍ varía por escena), nunca
// un sujeto/entorno fijado una sola vez para toda la pieza.
//
// Extracción determinista por palabras clave (MISMO criterio real ya
// usado en creativeStructureEngine.js#matchByInstruction) -- nunca IA,
// nunca inventa un campo que el texto no sugiere (queda null real).

function limpiar(texto) {
  return String(texto ?? '').toLowerCase().trim();
}

function contains(texto, palabras) {
  return palabras.some((p) => texto.includes(p));
}

const GENDER_FEMALE_WORDS = ['mujer', 'mujeres', 'femenina', 'femenino', 'female', 'woman', 'women', 'ella', 'chica'];
const GENDER_MALE_WORDS = ['hombre', 'hombres', 'masculino', 'masculina', 'male', 'man', 'men', 'él ', 'chico'];

function detectSubjectGender(texto) {
  const female = contains(texto, GENDER_FEMALE_WORDS);
  const male = contains(texto, GENDER_MALE_WORDS);
  if (female && !male) return 'female';
  if (male && !female) return 'male';
  return null; // ambiguo o no mencionado -- nunca se asume.
}

// subjectAgeRange: categoría real, en inglés (mismo vocabulario que el
// resto del encargo -- "subjectAgeRange = adult / 40+", Paso 8). El
// AJUSTE DE GÉNERO (adulta/adulto) se construye aparte, en
// ageAdjective(), solo para el texto real que ve treatment.describe().
const AGE_PATTERNS = [
  { re: /\b(\d{2})\s*(?:años|years|\+)/, category: (m) => `${m[1]}+` },
  { re: /\badolescente|teen(ager)?\b/, category: () => 'teen' },
  { re: /\bjoven|young adult\b/, category: () => 'young adult' },
  { re: /\badult[ao]s?|adult\b/, category: () => 'adult' },
  { re: /\bmayor(es)?|senior|tercera edad\b/, category: () => 'senior' },
];

function detectAgeRange(texto) {
  for (const { re, category } of AGE_PATTERNS) {
    const m = texto.match(re);
    if (m) return category(m);
  }
  return null;
}

// Adjetivo en español, concordado con subjectGender real cuando existe --
// nunca "mujer adult" (categoría en inglés pegada tal cual al sustantivo
// en español).
function ageAdjective(ageRange, subjectGender) {
  if (!ageRange) return null;
  const femenino = subjectGender === 'female';
  if (/^\d{2}\+$/.test(ageRange)) return `de ${ageRange} años`;
  const MAP = {
    teen: femenino ? 'adolescente' : 'adolescente',
    'young adult': femenino ? 'joven adulta' : 'joven adulto',
    adult: femenino ? 'adulta' : 'adulto',
    senior: femenino ? 'mayor' : 'mayor',
  };
  return MAP[ageRange] ?? null;
}

const ENVIRONMENT_WORDS = Object.freeze([
  { match: ['oficina', 'office'], label: 'oficina moderna' },
  { match: ['gimnasio', 'gym'], label: 'gimnasio moderno' },
  { match: ['cocina', 'kitchen'], label: 'cocina de casa' },
  { match: ['casa', 'hogar', 'home'], label: 'ambiente hogareño' },
  { match: ['consultorio', 'clínica', 'clinic'], label: 'consultorio/clínica' },
  { match: ['aire libre', 'exterior', 'parque', 'outdoor', 'park'], label: 'exteriores' },
  { match: ['calle', 'ciudad', 'street', 'city'], label: 'entorno urbano' },
]);

function detectEnvironment(texto) {
  const found = ENVIRONMENT_WORDS.find((e) => contains(texto, e.match));
  return found?.label ?? null;
}

// wardrobe (Corrección "Diversidad Visual", 2026-08-28, Paso 2 del
// encargo): derivado del MISMO entorno real ya detectado arriba -- nunca
// una heurística nueva independiente (un entorno de oficina real sugiere
// vestuario profesional real; gimnasio, ropa deportiva real). Ausente del
// texto -- null real, nunca inventado.
const WARDROBE_BY_ENVIRONMENT_MATCH = Object.freeze([
  { match: ['oficina', 'office'], label: 'ropa profesional / blazer neutro' },
  { match: ['gimnasio', 'gym'], label: 'ropa deportiva' },
  { match: ['cocina', 'kitchen', 'casa', 'hogar', 'home'], label: 'ropa casual de casa' },
  { match: ['consultorio', 'clínica', 'clinic'], label: 'uniforme/bata clínica' },
]);

function detectWardrobe(texto) {
  const found = WARDROBE_BY_ENVIRONMENT_MATCH.find((w) => contains(texto, w.match));
  return found?.label ?? null;
}

/**
 * Punto de entrada único (Paso 8 del encargo). SOLO analiza
 * "userInstruction" real -- CampaignIntent tiene su PROPIO camino real ya
 * existente (campaignIntent?.targetAudience/campaignTerritory, usado
 * directo por creativeDirector.js cuando no hay contexto real) que este
 * módulo nunca debe reprocesar ni mezclar: hacerlo cambiaría el
 * comportamiento de llamadores existentes que YA pasan un CampaignIntent
 * real sin userInstruction (ej. "Sugerir variantes" con brief de
 * campaña), rompiendo la compatibilidad hacia atrás del Paso 31.
 * productFacts solo aporta productRules, nunca sujeto/entorno.
 *
 * @param {{userInstruction?:?string, campaignIntent?:?object, productFacts?:?object}} args
 */
export function buildVisualContinuityContext({ userInstruction = null, campaignIntent = null, productFacts = null } = {}) {
  const texto = limpiar(userInstruction);
  if (!texto) {
    return Object.freeze({
      subjectGender: null, subjectAgeRange: null, subjectDescription: null,
      wardrobe: null, hairstyle: null, environment: null, visualStyle: null,
      recurringProps: Object.freeze([]), productRules: Object.freeze({ nombreVisible: productFacts?.nombreVisible ?? productFacts?.nombreComercial ?? null }),
      // characterContinuityRequired (Paso 2 del encargo "Diversidad
      // Visual"): false real -- sin userInstruction real no hay contexto
      // real que exigir entre escenas (compatibilidad hacia atrás exacta,
      // Paso 31).
      characterContinuityRequired: false,
    });
  }

  const subjectGender = detectSubjectGender(texto);
  const subjectAgeRange = detectAgeRange(texto);
  const environment = detectEnvironment(texto);
  const wardrobe = detectWardrobe(texto);

  const generoTexto = subjectGender === 'female' ? 'mujer' : subjectGender === 'male' ? 'hombre' : null;
  const adjetivoEdad = ageAdjective(subjectAgeRange, subjectGender);
  const sujeto = [generoTexto ?? (adjetivoEdad ? 'persona' : null), adjetivoEdad].filter(Boolean).join(' ') || null;
  // CampaignIntent (cuando lo hay junto a userInstruction) enriquece el
  // sujeto real detectado -- nunca lo sustituye ni activa nada por sí
  // solo (ver arriba: sin userInstruction real, esta función ya retornó).
  const subjectDescriptionParts = [sujeto, campaignIntent?.targetAudience ?? null].filter(Boolean);
  const subjectDescription = subjectDescriptionParts.length ? subjectDescriptionParts.join(', ') : null;

  return Object.freeze({
    subjectGender, subjectAgeRange, subjectDescription,
    // hairstyle/visualStyle/recurringProps: sin heurística real todavía
    // (ningún criterio confiable en texto libre corto) -- null real, nunca
    // inventado (Paso 8: "cuando corresponda").
    wardrobe, hairstyle: null,
    environment,
    visualStyle: null,
    recurringProps: Object.freeze([]),
    productRules: Object.freeze({ nombreVisible: productFacts?.nombreVisible ?? productFacts?.nombreComercial ?? null }),
    // characterContinuityRequired (Paso 2 del encargo "Diversidad Visual"):
    // true real en cuanto hay AL MENOS una señal real de identidad/entorno
    // detectada -- es la bandera real que le dice a creativeDirector.js que
    // debe propagar ESTE contexto (y no el fallback por-escena) a todas
    // las escenas.
    characterContinuityRequired: Boolean(subjectGender || subjectAgeRange || environment),
  });
}

/**
 * "audience" real que treatment.describe() (visualTreatments.js) debe usar
 * -- MISMO valor para TODAS las escenas de la pieza (Paso 9: "el contexto
 * global debe propagarse a TODAS las escenas"). Con subjectDescription
 * real, gana sobre el fallback genérico preexistente; sin él, preserva
 * EXACTAMENTE el comportamiento anterior (compatibilidad hacia atrás,
 * Paso 31 -- ningún llamador que no pasa userInstruction ve un cambio).
 */
export function resolveContinuityAudience(context, fallbackAudience) {
  return context?.subjectDescription ?? fallbackAudience;
}

/**
 * "territory" real -- mismo criterio: con "environment" real detectado,
 * gana sobre el fallback (que antes de esta corrección variaba POR ESCENA,
 * root cause real del entorno inconsistente); sin él, preserva el
 * fallback preexistente tal cual.
 */
export function resolveContinuityTerritory(context, fallbackTerritory) {
  return context?.environment ?? fallbackTerritory;
}
