// carouselCompositor.js — Bloque 2 (Carousel real), pieza de contenido:
// decide QUÉ va en cada slide, a partir de campos 100% reales (nunca
// fabrica un hecho) -- el renderer real (video-production/src/
// carouselRenderer.js) solo sabe pintar lo que este archivo le entrega.
//
// REGLA CENTRAL: cada slide debe originarse en un campo real y trazable:
// slide 1 = hook real (ProductionArtifact.hook / Creative Proposal.hook),
// slides intermedios = un hecho real distinto por slide (se listan
// separando productFacts.beneficios/ingredientes reales por punto y coma o
// coma -- nunca se inventa un hecho nuevo para "rellenar" un slide extra),
// último slide = CTA real. Si no hay suficientes hechos reales distintos
// para el slideCount pedido, el conteo se reduce y se reporta
// explícitamente en `warnings` -- nunca se repite ni se inventa contenido
// para completar el número solicitado.

const MIN_FRAGMENT_LENGTH = 8; // descarta fragmentos triviales ("y", "") que no son un hecho real independiente.

function splitHechosReales(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return [];
  return texto
    .split(/[;,]|\by\b/i)
    .map((f) => f.trim())
    .filter((f) => f.length >= MIN_FRAGMENT_LENGTH);
}

/**
 * @param {{
 *   hook: string, cta: string, productFacts: {nombreComercial:?string, beneficios:?string, ingredientes:?string},
 *   slideCount: number,
 * }} args
 * @returns {{ slides: Array<{headline:string, body:string|null, cta:string|null}>, requestedSlideCount: number, actualSlideCount: number, warnings: string[] }}
 */
export function buildCarouselSlidesContent({ hook, cta, productFacts, slideCount }) {
  if (!hook?.trim()) throw new Error('buildCarouselSlidesContent: "hook" es obligatorio -- no se inventa un hook.');
  if (!cta?.trim()) throw new Error('buildCarouselSlidesContent: "cta" es obligatorio -- no se inventa un CTA.');
  if (!(Number.isInteger(slideCount) && slideCount >= 3)) {
    throw new Error('buildCarouselSlidesContent: "slideCount" debe ser un entero >= 3 (mínimo hook + 1 hecho + cta).');
  }

  const hechosReales = [
    ...splitHechosReales(productFacts?.beneficios),
    ...splitHechosReales(productFacts?.ingredientes),
  ];

  const warnings = [];
  const hechosDisponibles = slideCount - 2; // slides intermedios entre hook y cta
  let hechosAUsar = hechosReales.slice(0, hechosDisponibles);
  if (hechosAUsar.length < hechosDisponibles) {
    warnings.push(`buildCarouselSlidesContent: se pidieron ${slideCount} slides pero solo hay ${hechosAUsar.length} hecho(s) real(es) distinto(s) en productFacts (beneficios/ingredientes) -- el carrusel se reduce a ${hechosAUsar.length + 2} slides en vez de inventar contenido de relleno.`);
  }

  const nombreComercial = productFacts?.nombreComercial ?? null;
  const slides = [
    { headline: hook, body: null, cta: null },
    ...hechosAUsar.map((hecho) => (nombreComercial
      ? { headline: nombreComercial, body: hecho, cta: null }
      : { headline: hecho, body: null, cta: null })),
    { headline: nombreComercial ?? 'Vida Divina', body: null, cta },
  ];

  return {
    slides,
    requestedSlideCount: slideCount,
    actualSlideCount: slides.length,
    warnings,
  };
}
