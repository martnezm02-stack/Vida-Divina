// example1_landing_producto_referencia.js — Ejemplo sintético (Fase 7).
//
// TODO el contenido de este archivo es FICTICIO: dominio inventado, producto
// inventado, claim inventado. Nada aquí es Vida Divina real ni un claim
// sanitario real — solo demuestra la forma del contrato.

import { createWebsitePatternObservation } from '../src/websitePatternObservation.js';
import { aggregateWebsitePatternInferences } from '../src/websitePatternInference.js';
import { generateWebsitePatternHypotheses } from '../src/websitePatternHypothesis.js';
import { createContentBrief, createPatternReference, createClaimReference } from '../src/contentBrief.js';

export function runExample1() {
  const FICTICIO = 'https://bienestar-ficticio-ejemplo.test'; // dominio de ejemplo, no existe, no es un competidor real

  const observations = [
    createWebsitePatternObservation({
      url: `${FICTICIO}/producto-relajante-ficticio`,
      page_id: 'site-fake1::landing-relajante',
      dimension: 'CONVERSION_FLOW',
      value: 'problema_beneficios_prueba_social_oferta_cta',
      evidence: { method: 'html_structure', detail: 'orden de <section> en el DOM: problema, beneficios, testimonios, oferta, cta' },
      confidence: 0.7,
      confidence_basis: 'Orden de secciones observado directamente en el DOM de la página ficticia de ejemplo.',
      conversion_flow: { sequence: ['problema', 'beneficios', 'prueba_social', 'oferta', 'cta'] },
    }),
    createWebsitePatternObservation({
      url: `${FICTICIO}/otra-landing-ficticia`,
      page_id: 'site-fake2::landing-x',
      dimension: 'CONVERSION_FLOW',
      value: 'problema_beneficios_prueba_social_oferta_cta',
      evidence: { method: 'html_structure', detail: 'mismo orden de secciones en un segundo sitio ficticio de ejemplo' },
      confidence: 0.65,
      confidence_basis: 'Orden de secciones observado en un segundo sitio ficticio.',
      conversion_flow: { sequence: ['problema', 'beneficios', 'prueba_social', 'oferta', 'cta'] },
    }),
    createWebsitePatternObservation({
      url: `${FICTICIO}/producto-relajante-ficticio`,
      page_id: 'site-fake1::landing-relajante',
      viewport: 'mobile',
      dimension: 'RESPONSIVE_PATTERN',
      value: 'nav_colapsa_a_hamburguesa',
      evidence: { method: 'viewport_test', detail: 'a 390px el <nav> con 5 items pasa a un ícono + panel lateral' },
      confidence: 0.8,
      confidence_basis: 'Comparación directa entre captura desktop (1440px) y mobile (390px) del mismo sitio ficticio.',
      responsive: { viewport_from: 'desktop', viewport_to: 'mobile', change_detail: 'nav horizontal de 5 items se reemplaza por ícono hamburguesa + menú lateral' },
    }),
    createWebsitePatternObservation({
      url: `${FICTICIO}/producto-relajante-ficticio`,
      page_id: 'site-fake1::landing-relajante',
      dimension: 'INTERACTION_PATTERN',
      value: 'accordion_faq',
      evidence: { method: 'interaction', detail: 'clic en pregunta de FAQ dispara expansión del contenido de respuesta' },
      confidence: 0.75,
      confidence_basis: 'Comportamiento verificado disparando el clic y comparando el DOM antes/después.',
      interaction: {
        trigger: 'click',
        state_before: { detail: 'contenido de respuesta colapsado, height: 0' },
        state_after: { detail: 'contenido expandido, height: auto, ícono rotado 180deg' },
      },
    }),
    createWebsitePatternObservation({
      url: `${FICTICIO}/producto-relajante-ficticio`,
      page_id: 'site-fake1::landing-relajante',
      dimension: 'DESIGN_TOKEN',
      value: 'color_boton_cta_principal',
      evidence: { method: 'computed_style', detail: 'getComputedStyle(.cta-button).backgroundColor devuelve rgb(37, 99, 235) en este sitio ficticio' },
      confidence: 0.9,
      confidence_basis: 'Valor leído directamente vía computed style — es un hecho sobre el sitio de referencia, no una recomendación para Vida Divina.',
      token: { token_type: 'color', observed_value: 'rgb(37, 99, 235)' },
    }),
  ];

  const conversionObservations = observations.filter((o) => o.dimension === 'CONVERSION_FLOW');
  const inferences = aggregateWebsitePatternInferences(conversionObservations, { scopeLabel: 'N=2 sitios de referencia ficticios de ejemplo' });
  const hypotheses = generateWebsitePatternHypotheses(inferences);

  // Claim FICTICIO encontrado en el sitio de referencia — nunca se convierte en un hecho de Vida Divina.
  const claim = createClaimReference({
    claim_text: '"Nuestro té ficticio te ayuda a relajarte en minutos" (afirmación del sitio de referencia ficticio, NO verificada, NO de Vida Divina)',
    claim_type: 'health_benefit_claim',
  });

  const brief = createContentBrief({
    page_type: 'landing_campana',
    objective: 'Landing de campaña para un producto de bienestar (ejemplo sintético)',
    product_ref: 'producto-ficticio-de-ejemplo', // NUNCA un slug real de docs/productos.md
    offer: { description: 'Oferta ficticia de ejemplo — sin precio real', pattern_refs: [] },
    structure_refs: [
      createPatternReference({
        source_module: 'website_intelligence',
        reference_type: 'inference',
        reference_id: inferences[0]?.inference_id ?? 'sin-inferencia',
        rationale: 'Patrón de secuencia de conversión observado en 2 de 2 sitios de referencia ficticios del ejemplo — candidato a evaluar, nunca a copiar.',
      }),
    ],
    design_pattern_refs: [
      createPatternReference({
        source_module: 'website_intelligence',
        reference_type: 'observation',
        reference_id: observations.find((o) => o.dimension === 'INTERACTION_PATTERN').observation_id,
        rationale: 'El patrón de accordion en FAQ es una idea de interacción a evaluar para la landing — no se copia el diseño visual del sitio ficticio.',
      }),
    ],
    main_message: '[SÍNTESIS DE EJEMPLO — no es contenido real de Vida Divina]',
    claims: [claim],
  });

  return { observations, inferences, hypotheses, brief };
}
