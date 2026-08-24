// example3_pagina_principal_marca.js — Ejemplo sintético (Fase 7). Demuestra
// que el contrato NO obliga a los campos propios de una landing (offer/cta)
// cuando el page_type es el sitio principal.

import { createWebsitePatternObservation } from '../src/websitePatternObservation.js';
import { createContentBrief, createPatternReference } from '../src/contentBrief.js';

export function runExample3() {
  const navigationObservation = createWebsitePatternObservation({
    url: 'https://marca-ficticia-ejemplo.test',
    page_id: 'site-fake4::home',
    dimension: 'NAVIGATION',
    value: 'header_sticky_con_mega_menu',
    evidence: { method: 'dom', detail: 'header con position: sticky y submenú desplegable de categorías de producto' },
    confidence: 0.55,
    confidence_basis: 'Comportamiento observado directamente al hacer scroll en un sitio de marca ficticio de ejemplo.',
  });

  const accessibilityObservation = createWebsitePatternObservation({
    url: 'https://marca-ficticia-ejemplo.test',
    page_id: 'site-fake4::home',
    dimension: 'ACCESSIBILITY_PATTERN',
    value: 'aria_label_en_iconos_sin_texto',
    evidence: { method: 'dom', detail: 'botones de solo-ícono (carrito, búsqueda) tienen atributo aria-label' },
    confidence: 0.6,
    confidence_basis: 'Atributo verificado directamente en el DOM.',
  });

  const brief = createContentBrief({
    page_type: 'sitio_principal',
    objective: 'Página principal de marca (ejemplo sintético) — sin oferta de campaña específica',
    structure_refs: [
      createPatternReference({
        source_module: 'website_intelligence',
        reference_type: 'observation',
        reference_id: navigationObservation.observation_id,
        rationale: 'Patrón de navegación a evaluar para el sitio principal — no aplica a landings de campaña, que usan un layout reducido (Fase 6 §8).',
      }),
    ],
    design_pattern_refs: [
      createPatternReference({
        source_module: 'website_intelligence',
        reference_type: 'observation',
        reference_id: accessibilityObservation.observation_id,
        rationale: 'Práctica de accesibilidad a considerar en el Design System propio de Vida Divina (aún no definido).',
      }),
    ],
    main_message: '[SÍNTESIS DE EJEMPLO — no es contenido real]',
    // offer y cta se omiten deliberadamente: el contrato no los exige para page_type: 'sitio_principal'.
  });

  return { observations: [navigationObservation, accessibilityObservation], brief };
}
