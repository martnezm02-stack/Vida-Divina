// creativeQualityGate.js — Fase de Creative Quality, Parte 10-11. Capa de
// QA determinista que se ejecuta DESPUÉS de generar el copy
// (hypothesisCopyProvider.js) y DESPUÉS de Claim Safety
// (assertNoForbiddenProductClaims/assertBrandAvoidCompliance, sin
// cambios). NUNCA genera ni reescribe contenido -- solo analiza, puntúa,
// y devuelve razones explícitas. Determinista, sin IA, sin heurísticas de
// lenguaje natural complejas -- exactamente lo pedido ("no intentar
// construir una IA dentro del gate").
//
// Arquitectura: Copy Generation -> Claim Safety -> Creative Quality Gate.
// Este archivo NO reemplaza los guards de Claim Safety (siguen viviendo en
// hyperframesRenderer.js/brandVisualSystem.js, sin tocar) -- cubre una
// categoría de problema DISTINTA: calidad/diversidad creativa real, no
// seguridad de claims.

const MIN_CLAIM_FRAGMENT_LENGTH = 15; // fragmentos más cortos son demasiado genéricos para considerarse "el mismo claim repetido" -- evita falsos positivos.
const HOOK_BODY_OVERLAP_THRESHOLD = 0.7; // proporción de palabras significativas compartidas antes de considerar hook y primera línea "esencialmente lo mismo".
const LOW_VALUE_MIN_WORDS = 10;
const DENSE_LINE_MAX_WORDS = 25;

function contarPalabras(texto) {
  return String(texto ?? '').trim().split(/\s+/).filter(Boolean).length;
}

function contarOcurrencias(haystack, needle) {
  if (!needle || needle.length < MIN_CLAIM_FRAGMENT_LENGTH) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = h.indexOf(n, idx)) !== -1) {
    count += 1;
    idx += n.length;
  }
  return count;
}

function normalizar(texto) {
  return String(texto ?? '').toLowerCase().replace(/[¿?¡!.,…—]/g, '').trim();
}

/**
 * Palabras significativas de un texto, EXCLUYENDO las palabras del nombre
 * comercial real (si se provee). Mencionar el nombre del producto tanto en
 * el hook como en la primera línea del cuerpo es normal en copy
 * publicitario real -- no es "el mismo enunciado repetido". Sin esta
 * exclusión, productos con nombre comercial largo (ej. "Divina Extracto de
 * Tremella (Tremella fuciformis) — Pure Extract Powder") disparaban un
 * falso positivo real, detectado en la suite de regresión de esta fase.
 */
function palabrasSignificativas(texto, palabrasAExcluir) {
  return new Set(
    normalizar(texto).split(/\s+/).filter((w) => w.length > 3 && !palabrasAExcluir.has(w)),
  );
}

function solapamientoDePalabras(a, b, nombreComercial = '') {
  const excluidas = new Set(normalizar(nombreComercial).split(/\s+/).filter((w) => w.length > 3));
  const wa = palabrasSignificativas(a, excluidas);
  const wb = palabrasSignificativas(b, excluidas);
  if (wa.size === 0 || wb.size === 0) return 0;
  let comunes = 0;
  for (const w of wa) if (wb.has(w)) comunes += 1;
  return comunes / Math.min(wa.size, wb.size);
}

/**
 * 1. CLAIM REPETITION CHECK — si un campo real de Product Facts
 * (problema/beneficios/ingredientes) aparece literalmente 2+ veces dentro
 * del mismo primaryText, se marca como issue.
 */
export function checkClaimRepetition(primaryText, facts) {
  const issues = [];
  for (const [campo, valor] of Object.entries({ problema: facts?.problema, beneficios: facts?.beneficios, ingredientes: facts?.ingredientes })) {
    if (!valor) continue;
    const count = contarOcurrencias(primaryText, limpiarPunto(valor));
    if (count >= 2) issues.push(`El campo "${campo}" aparece literalmente ${count} veces en el mismo copy -- repetición de claim (Fase de Creative Quality, regla no negociable).`);
  }
  return Object.freeze({ passed: issues.length === 0, issues: Object.freeze(issues) });
}

function limpiarPunto(texto) {
  return String(texto ?? '').trim().replace(/\.+$/, '');
}

/**
 * 2. STRUCTURAL SAMENESS CHECK — si dos secciones de la misma pieza usan
 * el mismo sourceField real (ej. "mechanism" y "productReveal" ambas
 * citando "beneficios"), se marca como issue. sectionsUsed viene de
 * hypothesisCopyProvider.js#generateVariantCopy() (campo "sectionsUsed").
 */
export function checkStructuralSameness(sectionsUsed) {
  const issues = [];
  const vistos = new Map();
  for (const { section, sourceField } of sectionsUsed ?? []) {
    if (!sourceField) continue;
    if (vistos.has(sourceField)) {
      issues.push(`Las secciones "${vistos.get(sourceField)}" y "${section}" usan el mismo campo fuente ("${sourceField}") -- redundancia estructural.`);
    } else {
      vistos.set(sourceField, section);
    }
  }
  return Object.freeze({ passed: issues.length === 0, issues: Object.freeze(issues) });
}

/**
 * 3. EMPTY/LOW-VALUE COPY CHECK — advertencia (no bloqueante) cuando la
 * pieza completa es demasiado corta para ser una creatividad real.
 */
export function checkEmptyOrLowValueCopy({ hook, bodyLines, cta }) {
  const totalWords = [hook, ...(bodyLines ?? []), cta].filter(Boolean).reduce((acc, l) => acc + contarPalabras(l), 0);
  const warnings = totalWords < LOW_VALUE_MIN_WORDS
    ? [`El copy total tiene solo ${totalWords} palabras -- posible pieza de bajo valor.`]
    : [];
  return Object.freeze({ passed: warnings.length === 0, warnings: Object.freeze(warnings) });
}

/**
 * 4. HOOK REPETITION CHECK — si el hook y la primera línea real del cuerpo
 * comparten demasiadas palabras significativas, son "esencialmente lo
 * mismo" (el defecto real observado en el benchmark de Ripped: "¿Baja masa
 * muscular...?" seguido de "Baja masa muscular....").
 */
export function checkHookRepetition(hook, bodyLines, nombreComercial = '') {
  const primeraLinea = bodyLines?.[0];
  if (!primeraLinea) return Object.freeze({ passed: true, issues: Object.freeze([]) });
  const ratio = solapamientoDePalabras(hook, primeraLinea, nombreComercial);
  const issues = ratio >= HOOK_BODY_OVERLAP_THRESHOLD
    ? [`El hook y la primera línea del cuerpo comparten ${Math.round(ratio * 100)}% de palabras significativas -- son esencialmente el mismo enunciado repetido.`]
    : [];
  return Object.freeze({ passed: issues.length === 0, issues: Object.freeze(issues) });
}

/**
 * 5. CTA REPETITION CHECK — a nivel de EXPERIMENTO completo (todas las
 * variantes), nunca a nivel de una sola variante. Si existe más de una
 * variante y todas comparten literalmente la misma CTA, se marca como
 * issue -- había una alternativa real disponible (CTA_STRATEGIES) y no se
 * usó.
 */
export function checkCtaDiversityAcrossExperiment(ctas) {
  const distintos = new Set((ctas ?? []).map((c) => String(c ?? '').trim()));
  const issues = (ctas?.length ?? 0) > 1 && distintos.size === 1
    ? ['Todas las variantes del experimento usan exactamente la misma CTA -- sin diversidad real de CTA, aunque existían estrategias alternativas disponibles.']
    : [];
  return Object.freeze({ passed: issues.length === 0, issues: Object.freeze(issues), distinctCount: distintos.size, totalCount: ctas?.length ?? 0 });
}

/**
 * 6. SOCIAL-NATIVE CHECK — advertencias (no bloqueantes) sobre ritmo:
 * bloques demasiado largos sin pausa, o ausencia total de cualquier
 * marcador de ritmo social-nativo (pregunta, fragmento corto, pausa,
 * emoji).
 */
export function checkSocialNative({ hook, bodyLines, cta }) {
  const warnings = [];
  const todasLasLineas = [hook, ...(bodyLines ?? []), cta].filter(Boolean);

  const tienePregunta = todasLasLineas.some((l) => l.includes('?') || l.includes('¿'));
  const tieneFragmentoCorto = todasLasLineas.some((l) => contarPalabras(l) <= 6);
  const tienePausa = todasLasLineas.some((l) => /[…—]|\.\.\./.test(l));
  const tieneEmoji = todasLasLineas.some((l) => /\p{Extended_Pictographic}/u.test(l));
  const señales = [tienePregunta, tieneFragmentoCorto, tienePausa, tieneEmoji].filter(Boolean).length;
  if (señales === 0) {
    warnings.push('Ningún marcador de ritmo social-nativo presente (pregunta, fragmento corto, pausa o emoji) -- puede leerse como texto plano.');
  }

  const bloquesDensos = (bodyLines ?? []).filter((l) => contarPalabras(l) > DENSE_LINE_MAX_WORDS);
  if (bloquesDensos.length > 0) {
    warnings.push(`${bloquesDensos.length} línea(s) del cuerpo superan ${DENSE_LINE_MAX_WORDS} palabras sin pausa -- bloque demasiado denso para lectura social.`);
  }

  return Object.freeze({ passed: warnings.length === 0, warnings: Object.freeze(warnings) });
}

function computeScore(checks) {
  const entradas = Object.values(checks);
  if (entradas.length === 0) return 100;
  const aprobados = entradas.filter((c) => c.passed).length;
  return Math.round((aprobados / entradas.length) * 100);
}

/**
 * Punto de entrada único del gate para UNA variante (Fase de Creative
 * Quality, Parte 11). Los checks 1/2/4 son BLOQUEANTES (issues ->
 * passed:false); los checks 3/6 son informativos (warnings, nunca
 * bloquean). El check 5 (CTA) es a nivel de experimento, ver
 * runExperimentQualityGate() más abajo -- no se ejecuta aquí.
 *
 * @param {{hook:string, primaryText:string, cta:string, bodyLines:string[], sectionsUsed:Array<{section:string,sourceField:string}>, facts:object}} args
 */
export function runCreativeQualityGate({
  hook, primaryText, cta, bodyLines, sectionsUsed, facts, campaignIntent = null,
}) {
  const checks = {
    claimRepetition: checkClaimRepetition(primaryText, facts),
    structuralSameness: checkStructuralSameness(sectionsUsed),
    hookRepetition: checkHookRepetition(hook, bodyLines, facts?.nombreComercial),
    emptyOrLowValue: checkEmptyOrLowValueCopy({ hook, bodyLines, cta }),
    socialNative: checkSocialNative({ hook, bodyLines, cta }),
    campaignRelevance: checkCampaignRelevance({ hook, primaryText, campaignIntent }),
  };

  const issues = [...checks.claimRepetition.issues, ...checks.structuralSameness.issues, ...checks.hookRepetition.issues, ...checks.campaignRelevance.issues];
  const warnings = [...checks.emptyOrLowValue.warnings, ...checks.socialNative.warnings];

  return Object.freeze({
    passed: issues.length === 0,
    score: computeScore(checks),
    issues: Object.freeze(issues),
    warnings: Object.freeze(warnings),
    checks: Object.freeze(checks),
  });
}

// Umbral mínimo de solapamiento léxico real (0-100) entre el copy
// renderizado (hook+primaryText) y el territorio/problema/audiencia de la
// campaña -- Creative Strategy Engine, 2026-08-24. Por construcción (ver
// hypothesisCreativeEngine.js: el "problema" efectivo de una variante ES
// campaignIntent.problemOrNeed cuando hay campaña) el solapamiento real
// suele ser alto; este check es la red de seguridad explícita, no el
// mecanismo principal -- si algún día una variante generada NO incorpora
// el territorio real de la campaña, se rechaza aquí en vez de llegar al
// Dashboard como "buen copy, campaña equivocada".
const MIN_CAMPAIGN_RELEVANCE_SCORE = 15;

/**
 * 7. CAMPAIGN RELEVANCE CHECK — mide, con la MISMA utilidad de
 * solapamiento de palabras ya usada arriba (nunca duplicada), qué tanto
 * del territorio/problema/audiencia real de la campaña aparece
 * efectivamente en el copy renderizado. Sin campaignIntent (llamador
 * legado, producto sin campaña explícita) este check no aplica -- nunca
 * bloquea el comportamiento preexistente.
 */
export function checkCampaignRelevance({ hook, primaryText, campaignIntent }) {
  if (!campaignIntent) return Object.freeze({ applicable: false, passed: true, score: null, issues: Object.freeze([]) });

  const territorio = [campaignIntent.problemOrNeed, campaignIntent.campaignTerritory, campaignIntent.targetAudience]
    .filter(Boolean).join(' . ');
  const copyReal = [hook, primaryText].filter(Boolean).join(' . ');
  const overlap = solapamientoDePalabras(territorio, copyReal);
  const score = Math.round(overlap * 100);
  const passed = score >= MIN_CAMPAIGN_RELEVANCE_SCORE;
  const issues = passed ? [] : [
    `El copy real (score de relevancia ${score}/100) no incorpora suficiente del territorio/problema/audiencia real de la campaña ("${campaignIntent.campaignTerritory ?? campaignIntent.problemOrNeed}") -- una creatividad genérica de producto no puede sustituir al brief de campaña (Creative Strategy Engine, regla no negociable).`,
  ];
  return Object.freeze({ applicable: true, passed, score, issues: Object.freeze(issues) });
}

/**
 * Corre el check de diversidad de CTA a nivel de TODO el experimento --
 * llamarlo una sola vez, después de construir todas las variantes
 * (hypothesisCreativeEngine.js). No se integra dentro de
 * runCreativeQualityGate() porque ese opera por variante individual.
 */
export function runExperimentQualityGate(variantsCopy) {
  const ctaCheck = checkCtaDiversityAcrossExperiment((variantsCopy ?? []).map((c) => c.cta));
  return Object.freeze({
    passed: ctaCheck.passed,
    issues: ctaCheck.issues,
    checks: Object.freeze({ ctaDiversity: ctaCheck }),
  });
}
