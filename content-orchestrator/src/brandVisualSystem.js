// brandVisualSystem.js — fuente única de verdad de la identidad visual de
// Vida Divina para esta fase. No existía ningún sistema de marca formal en
// el proyecto antes de esto (video-production/src/hyperframesRenderer.js
// usaba colores elegidos ad-hoc, no verificados contra ninguna guía real
// -- ver auditoría visual de la fase anterior, hallazgo de BRANDING).
//
// REGLA CENTRAL: este módulo no genera composiciones ni renderiza nada --
// solo declara la paleta/principios/estética/elementos reales, y expone
// guards deterministas para lo que el resto del sistema SÍ puede verificar
// automáticamente (colores hex realmente usados, palabras clave prohibidas
// en texto de dirección visual). No puede verificar juicios estéticos
// (¿se ve "premium"? ¿se ve "genérico de Canva"?) -- eso requiere revisión
// humana, y se declara así explícitamente, nunca se finge automatizado.

export const BRAND_COLORS = Object.freeze({
  forestGreen: '#0E1E11',
  oliveGreen: '#29361C',
  warmCream: '#E6DFD0',
  burgundy: '#441C11',
  warmGold: '#B58C33',
  softBlack: '#26231F',
});

export const BRAND_PRINCIPLES = Object.freeze([
  'Naturaleza', 'Bienestar', 'Equilibrio', 'Confianza', 'Estilo de vida saludable',
]);

export const BRAND_AESTHETIC = Object.freeze([
  'Profesional', 'Elegante', 'Natural', 'Confiable', 'Premium moderado',
]);

export const BRAND_ELEMENTS = Object.freeze([
  'hojas', 'ramas', 'flores pequeñas', 'semillas', 'botánicos', 'madera', 'té', 'ingredientes reales',
]);

// Cada entrada es texto humano (para reporte/documentación) + un patrón
// verificable por regex sobre TEXTO de dirección visual (generationPrompt,
// sceneDescription, negativePrompt, etc.) -- no sobre píxeles reales. Un
// texto que pasa este guard no está garantizado visualmente "on-brand";
// solo no contradice la marca en las palabras que la describen.
export const BRAND_AVOID = Object.freeze([
  { label: 'neón', pattern: /\bne[oó]n\b/i },
  { label: 'morado dominante', pattern: /\bmorado\b/i },
  { label: 'azul eléctrico', pattern: /\bazul\s+el[eé]ctrico\b/i },
  { label: 'fondos saturados', pattern: /\bfondo?s?\s+saturad[oa]s?\b/i },
  { label: 'catálogo barato', pattern: /\bcat[aá]logo\s+barato\b/i },
  { label: 'stock genérico', pattern: /\bstock\s+gen[eé]rico\b/i },
  { label: 'productos inventados', pattern: /\bproductos?\s+inventad[oa]s?\b/i },
  { label: 'exceso de decoración', pattern: /\bexceso\s+(?:de\s+)?decoraci[oó]n\b|\bexceso\s+decorativ[oa]\b|\bexceso\s+(?:de\s+)?decorad[oa]\b/i },
  { label: 'texto diminuto', pattern: /\btexto\s+diminuto\b/i },
  { label: 'exceso de sombras', pattern: /\bexceso\s+de\s+sombras?\b/i },
  { label: 'plantilla genérica de Canva', pattern: /\bplantilla\s+gen[eé]rica(?:\s+de\s+canva)?\b/i },
  { label: 'apariencia obvia de IA', pattern: /\bapariencia\s+(?:obvia\s+)?de\s+ia\b|\bse\s+ve\s+hecho\s+por\s+ia\b/i },
]);

const HEX_TOLERANCE = 0; // sin tolerancia: se compara el hex exacto, ya normalizado a mayúsculas.

/** Deriva un set de colores de escena reales a partir de la paleta de marca -- reemplaza los valores ad-hoc que hyperframesRenderer.js usaba por defecto antes de esta fase. Determinista: mismos roles, mismos hex, siempre. */
export function deriveBrandSceneColors() {
  return Object.freeze({
    hookBackgroundGradientFrom: BRAND_COLORS.burgundy,
    hookBackgroundGradientTo: BRAND_COLORS.softBlack,
    ctaBackgroundGradientFrom: BRAND_COLORS.oliveGreen,
    ctaBackgroundGradientTo: BRAND_COLORS.forestGreen,
    hookTextColor: BRAND_COLORS.warmCream,
    productLockupColor: BRAND_COLORS.warmGold,
    productSubColor: BRAND_COLORS.warmCream,
    ctaTextColor: BRAND_COLORS.warmCream,
    whatsappPillBackground: '#25D366', // color de marca de WhatsApp, no de Vida Divina -- se conserva literal porque el CTA debe seguir siendo reconocible como WhatsApp real, no reinterpretado.
    whatsappPillText: BRAND_COLORS.softBlack,
  });
}

/** Escanea texto de dirección visual/creativo contra BRAND_AVOID. No modifica el texto -- solo señala qué frase evitar aparece, para que quien construye el ProductionArtifact/VisualProductionPackage la corrija antes de continuar. */
export function findBrandAvoidViolations(text) {
  if (typeof text !== 'string' || !text) return [];
  return BRAND_AVOID.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

/** Lanza si el texto combinado de dirección visual contiene alguna frase de BRAND_AVOID. Aplica igual en CAMPAIGN_MODE y DIRECT_INSTRUCTION_MODE -- ningún modo se salta el sistema de marca (Parte 6). */
export function assertBrandAvoidCompliance(text, fieldName = 'texto') {
  const violaciones = findBrandAvoidViolations(text);
  if (violaciones.length > 0) {
    throw new Error(`assertBrandAvoidCompliance: "${fieldName}" contiene lenguaje que el Brand Visual System marca como evitar (${violaciones.join(', ')}).`);
  }
  return true;
}

/** Verifica que un hex dado sea exactamente uno de los 6 colores oficiales (o el verde WhatsApp, para el CTA). Útil para que un test valide que una composición realmente usó la paleta real, no una aproximación visual. */
export function isOfficialBrandColor(hex) {
  if (typeof hex !== 'string') return false;
  const normalizado = hex.trim().toUpperCase();
  const oficiales = new Set([...Object.values(BRAND_COLORS).map((h) => h.toUpperCase()), '#25D366']);
  return HEX_TOLERANCE === 0 ? oficiales.has(normalizado) : false;
}
