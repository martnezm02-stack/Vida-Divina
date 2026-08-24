#!/usr/bin/env node
// main.js — Fase 7: corre los 3 ejemplos sintéticos y muestra la cadena
// WebsitePatternObservation → Inferencia → Hipótesis → ContentBrief.
// Todo el contenido es ficticio (ver examples/). No hace ninguna llamada de
// red, no instala nada, no genera páginas ni código de producción.

import { runExample1 } from './examples/example1_landing_producto_referencia.js';
import { runExample2 } from './examples/example2_pagina_producto.js';
import { runExample3 } from './examples/example3_pagina_principal_marca.js';

function printBrief(label, result) {
  console.log(`\n=== ${label} ===`);
  console.log(`Observaciones: ${result.observations.length}`);
  for (const o of result.observations) console.log(`  [${o.dimension}] ${o.value} (evidence.method=${o.evidence.method})`);
  if (result.inferences) {
    console.log(`Inferencias: ${result.inferences.length}`);
    for (const i of result.inferences) console.log(`  [${i.dimension}] ${i.pattern} — frecuencia ${i.frequency} (${i.scope})`);
  }
  if (result.hypotheses) {
    console.log(`Hipótesis: ${result.hypotheses.length}`);
    for (const h of result.hypotheses) console.log(`  - ${h.hypothesis}`);
  }
  console.log(`ContentBrief: page_type=${result.brief.page_type} · requires_human_review=${result.brief.requires_human_review}`);
  if (result.brief.claims?.length) {
    for (const c of result.brief.claims) {
      console.log(`  claim: "${c.claim_text}" verified_by_vida_divina=${c.verified_by_vida_divina} requires_human_review=${c.requires_human_review}`);
    }
  }
}

function main() {
  printBrief('Ejemplo 1 — Landing de producto de referencia (ficticio)', runExample1());
  printBrief('Ejemplo 2 — Página de producto (ficticio)', runExample2());
  printBrief('Ejemplo 3 — Página principal de marca (ficticio)', runExample3());
}

main();
