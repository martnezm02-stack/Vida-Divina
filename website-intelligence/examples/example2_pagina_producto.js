// example2_pagina_producto.js — Ejemplo sintético (Fase 7). Contenido y
// producto ficticios — NO es un producto real del catálogo de Vida Divina.

import { createWebsitePatternObservation } from '../src/websitePatternObservation.js';
import { createContentBrief, createPatternReference } from '../src/contentBrief.js';

export function runExample2() {
  const structureObservation = createWebsitePatternObservation({
    url: 'https://tienda-ficticia-ejemplo.test/productos/producto-x',
    page_id: 'site-fake3::pagina-producto-x',
    dimension: 'PAGE_STRUCTURE',
    value: 'galeria_descripcion_beneficios_faq',
    evidence: { method: 'html_structure', detail: 'orden observado: galería de imágenes, descripción, lista de beneficios, FAQ, productos relacionados' },
    confidence: 0.6,
    confidence_basis: 'Estructura leída directamente del DOM de una página de producto ficticia de ejemplo.',
  });

  const brief = createContentBrief({
    page_type: 'pagina_producto',
    objective: 'Página de producto individual dentro del catálogo (ejemplo sintético)',
    product_ref: 'producto-ficticio-de-ejemplo-2',
    structure_refs: [
      createPatternReference({
        source_module: 'website_intelligence',
        reference_type: 'observation',
        reference_id: structureObservation.observation_id,
        rationale: 'Estructura común en páginas de producto de referencia — se evalúa como punto de partida para la información arquitectónica, no se copia el contenido.',
      }),
    ],
    main_message: '[SÍNTESIS DE EJEMPLO — no es contenido real]',
  });

  return { observations: [structureObservation], brief };
}
