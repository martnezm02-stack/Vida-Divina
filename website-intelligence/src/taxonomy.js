// taxonomy.js — Taxonomía de WebsitePatternObservation (Fase 7).
//
// Cubre ÚNICAMENTE lo que marketing-intelligence NO cubre: estructura,
// jerarquía visual, navegación, comportamiento responsive, tokens de diseño,
// flujo de conversión, interacción e accesibilidad de sitios de referencia.
// Deliberadamente NO incluye HOOK, ANGLE, PROBLEM, DESIRE, PROMISE,
// MECHANISM, OBJECTION, CTA, AUDIENCE, OFFER, SOCIAL_PROOF — esas dimensiones
// ya existen en marketing-intelligence/src/taxonomy.js y deben consumirse
// desde ahí (ver src/contentBrief.js) — nunca duplicarse aquí.
//
// Dimensiones evaluadas y descartadas explícitamente (documentado para no
// volver a proponerlas sin releer esta justificación):
//   - LANDING_STRUCTURE: redundante con PAGE_STRUCTURE + CONVERSION_FLOW —
//     una landing es solo un tipo de página, no una dimensión de observación
//     distinta.
//   - CONTENT_HIERARCHY: redundante — el orden de los MENSAJES ya lo captura
//     PAGE_STRUCTURE (orden de secciones) combinado con las dimensiones de
//     marketing-intelligence aplicadas a cada sección; no es un hecho nuevo.

export const DIMENSIONS = Object.freeze([
  'PAGE_STRUCTURE',
  'VISUAL_HIERARCHY',
  'NAVIGATION',
  'RESPONSIVE_PATTERN',
  'DESIGN_TOKEN',
  'CONVERSION_FLOW',
  'INTERACTION_PATTERN',
  'ACCESSIBILITY_PATTERN',
]);

export const DIMENSION_MEANING = Object.freeze({
  PAGE_STRUCTURE: 'Composición macro de una página: qué secciones existen y en qué orden aparecen (ej. hero, beneficios, testimonios, oferta, CTA, footer).',
  VISUAL_HIERARCHY: 'Qué elemento recibe mayor énfasis visual dentro de una sección o página (tamaño, peso, contraste, posición).',
  NAVIGATION: 'Patrón de navegación usado (header sticky, menú hamburguesa, mega-menú, breadcrumbs, navegación por anclas).',
  RESPONSIVE_PATTERN: 'Cómo cambia un componente o layout entre viewports (ej. nav colapsa a hamburguesa en mobile; grid de 3 columnas pasa a 1).',
  DESIGN_TOKEN: 'Un valor de diseño concreto EN USO en el sitio de referencia (color, tipografía, spacing, radius, sombra, breakpoint, ancho de contenido, altura de componente) — nunca una recomendación de adopción para Vida Divina.',
  CONVERSION_FLOW: 'Secuencia de bloques funcionales orientados a conversión presentes en una página (ej. Problema→Beneficios→Prueba social→Oferta→CTA), tal como aparece en ESA página.',
  INTERACTION_PATTERN: 'Comportamiento disparado por una interacción del usuario (accordion, tabs, modal, sticky-on-scroll), representado como transición de estado A→B.',
  ACCESSIBILITY_PATTERN: 'Práctica de accesibilidad observable (uso de aria-*, contraste de texto, foco visible, tamaño de objetivo táctil).',
});

// Dimensiones de marketing-intelligence — usadas SOLO para la prueba
// automatizada de "ausencia de duplicación" (ver test/), nunca para producir
// observaciones aquí. No se importa el archivo real para no crear una
// dependencia de ejecución entre módulos — es una copia deliberada y mínima
// de una lista de strings, para verificar disjunción sin acoplar los módulos.
export const MARKETING_INTELLIGENCE_DIMENSIONS = Object.freeze([
  'HOOK', 'ANGLE', 'PROBLEM', 'DESIRE', 'PROMISE', 'MECHANISM', 'OBJECTION', 'CTA',
  'AUDIENCE', 'OFFER', 'SOCIAL_PROOF', 'FORMAT', 'NARRATIVE_STRUCTURE',
  'EMOTIONAL_TRIGGER', 'PAIN_POINT', 'BENEFIT', 'URGENCY', 'AUTHORITY', 'CURIOSITY_GAP',
]);

export const VIEWPORTS = Object.freeze(['desktop', 'tablet', 'mobile']);
export const EVIDENCE_METHODS = Object.freeze([
  'dom', 'css', 'computed_style', 'screenshot', 'viewport_test', 'interaction', 'metadata', 'html_structure',
]);

export function isValidDimension(dimension) {
  return DIMENSIONS.includes(dimension);
}
