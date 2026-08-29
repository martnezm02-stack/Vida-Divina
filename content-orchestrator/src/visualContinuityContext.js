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

// contains() — Corrección "Corrección integral del flujo de Crear
// contenido" (2026-08-28, Paso 7/8 del encargo). ANTES: texto.includes(p)
// era un substring DESNUDO -- root cause real confirmado del bug
// reportado (Problema 2): "posteriormente" contiene "men" y "de manera
// natural" contiene "man", así que CUALQUIER instrucción real con esas
// palabras (comunes en español) marcaba male=true y cancelaba
// female=true en detectSubjectGender(), degradando "mujer adulta" a
// "persona adulto". Ahora exige límite de palabra real consciente de
// acentos españoles (JS \b nativo NO reconoce "é/í/ó/ú/á/ñ" como
// caracter de palabra -- "\bél\b" nunca matchea "él" real) -- nunca un
// segundo motor de NLP, mismo espíritu determinista de siempre.
function contains(texto, palabras) {
  return palabras.some((p) => {
    const escaped = p.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-záéíóúñü])${escaped}([^a-záéíóúñü]|$)`, 'i');
    return re.test(texto);
  });
}

const GENDER_FEMALE_WORDS = ['mujer', 'mujeres', 'femenina', 'femenino', 'female', 'woman', 'women', 'ella', 'chica'];
const GENDER_MALE_WORDS = ['hombre', 'hombres', 'masculino', 'masculina', 'male', 'man', 'men', 'él', 'chico'];

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
      narrativeIntent: null,
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
    // narrativeIntent (Paso 6 del encargo): "qué historia se quiere
    // contar" -- EXACTAMENTE el texto real de userInstruction (trim, sin
    // resumir/reinterpretar): resumir de forma determinista sin un motor
    // de lenguaje nuevo arriesgaría alterar el significado real que el
    // usuario ya escribió (Paso 30: "no inventar"); el texto real del
    // usuario YA ES la fuente de verdad narrativa completa. Nunca se trata
    // como claim de marketing (Paso 6: "no convertirlo en claim") -- solo
    // se usa para auditar cobertura real (instructionCoverageScore) y
    // como contexto real legible en el prompt/preview.
    narrativeIntent: userInstruction?.trim() || null,
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

// Instruction Coverage / Prompt Gate (Corrección "Corrección integral del
// flujo de Crear contenido", 2026-08-28, Paso 14/15/36/37 del encargo):
// verifica que las señales reales YA extraídas de userInstruction
// (subject/gender/environment) realmente aparecen en el TEXTO final real
// que se envió al provider -- root cause real del Problema 2 (el bug real
// vivía en detectSubjectGender() de este mismo archivo, ya corregido
// arriba; esta función es la RED DE SEGURIDAD real que lo habría
// detectado, y que también detecta una edición manual real del usuario
// que borre el sujeto, Paso 30). Determinista, nunca un motor de lenguaje
// nuevo.
function checkPresence(combinedPromptText, palabras) {
  return contains(combinedPromptText, palabras);
}

/**
 * @param {{context:object, combinedPromptText:string}} args -- "context"
 * es el visualContinuityContext real ya calculado; "combinedPromptText"
 * es el texto real de TODOS los scene.visualPrompt reales de la pieza,
 * unidos (el mismo texto real que el provider real ve).
 * @returns {{instructionCoverageScore:number, checks:object, missing:string[]}}
 */
export function computeInstructionCoverage({ context, combinedPromptText = '' }) {
  if (!context?.characterContinuityRequired) {
    // Sin userInstruction real con señal real de sujeto/entorno -- nada
    // real que cubrir (Paso 31: compatibilidad hacia atrás, nunca
    // penaliza a un llamador que nunca pasó userInstruction).
    return Object.freeze({ instructionCoverageScore: 1, checks: Object.freeze({}), missing: Object.freeze([]) });
  }
  const texto = limpiar(combinedPromptText);
  const checks = {};
  if (context.subjectGender) {
    checks.subjectGender = checkPresence(texto, context.subjectGender === 'female' ? GENDER_FEMALE_WORDS : GENDER_MALE_WORDS);
  }
  if (context.environment) {
    // El label real (ej. "oficina moderna") puede no aparecer palabra por
    // palabra -- se exige que AL MENOS una palabra real significativa
    // (>=4 letras) del label real esté presente.
    const palabrasEntorno = context.environment.split(/\s+/).filter((w) => w.length >= 4);
    checks.environment = palabrasEntorno.length === 0 || checkPresence(texto, palabrasEntorno);
  }
  if (context.subjectAgeRange) {
    const adjetivo = ageAdjective(context.subjectAgeRange, context.subjectGender);
    checks.subjectAgeRange = adjetivo ? checkPresence(texto, [adjetivo]) : true;
  }
  const values = Object.values(checks);
  const instructionCoverageScore = values.length === 0 ? 1 : values.filter(Boolean).length / values.length;
  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return Object.freeze({ instructionCoverageScore, checks: Object.freeze(checks), missing: Object.freeze(missing) });
}

// MIN_INSTRUCTION_COVERAGE_SCORE (Paso 37 del encargo): mismo umbral real
// 0.70 ya usado por Creative Quality Auto-QA para otros componentes.
export const MIN_INSTRUCTION_COVERAGE_SCORE = 0.70;

// NO TEXT BAKING (Corrección "Master Creative Production Flow",
// 2026-08-29, Paso 29/30/33/39 del encargo): un prompt real que le pide
// al proveedor que ESCRIBA texto (CTA/caption/subtítulo/hook/overlay)
// dentro de la imagen es INVALID -- captions/CTA/overlay pertenecen a
// postproducción (hyperframesRenderer.js), nunca al prompt visual real.
// Aplica SIEMPRE (incluso sin characterContinuityRequired real) porque
// es una regla de seguridad de contenido, no de continuidad visual.
const TEXT_BAKING_FORBIDDEN_PATTERNS = Object.freeze([
  /\bcta\b/i, /\bcaption(s)?\b/i, /\bsubt[ií]tulo(s)?\b/i, /\bsubtitle(s)?\b/i,
  /texto en pantalla/i, /\btext overlay\b/i, /\bhook real:/i, /\bmomento real de la escena:/i,
]);
function tieneTextBakingViolation(scenePrompt) {
  return TEXT_BAKING_FORBIDDEN_PATTERNS.some((re) => re.test(scenePrompt ?? ''));
}

/**
 * Prompt Gate real (Paso 15/29/30 del encargo): VALID/INVALID por escena
 * -- SOLO señala (nunca produce), y repara de forma determinista cuando
 * la reparación real es segura (reinyectar el sujeto/entorno real YA
 * conocido, nunca inventar uno nuevo). Un prompt real con una violación
 * real de "no text baking" (Paso 30/33/39) SIEMPRE es INVALID real y
 * NUNCA se repara en automático (podría ser una edición real intencional
 * del usuario -- Paso 45 "no sobrescribir silenciosamente cambios del
 * usuario" -- el llamador real debe mostrar el aviso y dejar que el
 * usuario corrija). Devuelve el prompt real reparado cuando aplica -- el
 * llamador decide si lo usa.
 */
export function applyPromptGate({ context, scenePrompt }) {
  if (tieneTextBakingViolation(scenePrompt)) {
    return Object.freeze({ status: 'INVALID', prompt: scenePrompt, repaired: false, textBakingViolation: true });
  }
  if (!context?.characterContinuityRequired) return Object.freeze({ status: 'VALID', prompt: scenePrompt, repaired: false });
  const coverage = computeInstructionCoverage({ context, combinedPromptText: scenePrompt });
  if (coverage.missing.length === 0) return Object.freeze({ status: 'VALID', prompt: scenePrompt, repaired: false });

  // Reparación real determinista: reinyecta SOLO las señales reales ya
  // conocidas (subject/environment) que faltan -- nunca inventa una nueva.
  const refuerzos = [];
  if (coverage.missing.includes('subjectGender') && context.subjectGender) {
    refuerzos.push(`Sujeto real: ${context.subjectGender === 'female' ? 'mujer' : 'hombre'}${context.subjectAgeRange ? ` (${ageAdjective(context.subjectAgeRange, context.subjectGender)})` : ''}.`);
  }
  if (coverage.missing.includes('environment') && context.environment) {
    refuerzos.push(`Entorno real: ${context.environment}.`);
  }
  const promptReparado = refuerzos.length ? `${scenePrompt} ${refuerzos.join(' ')}` : scenePrompt;
  const coverageTrasReparar = computeInstructionCoverage({ context, combinedPromptText: promptReparado });
  return Object.freeze({
    status: coverageTrasReparar.missing.length === 0 ? 'VALID' : 'INVALID',
    prompt: promptReparado,
    repaired: refuerzos.length > 0,
  });
}
