#!/usr/bin/env node
// main.js — Recommendation Engine (Sprint 3B). Valida contra los mismos
// perfiles que el Conversation Simulator (Sprint 3A) resolvió para sus 6
// casos de prueba — no se re-ejecuta la detección de intención aquí (eso
// sigue siendo responsabilidad exclusiva del simulador, no de este motor).
//
// Uso:
//   node main.js                       corre el set de validación fijo
//   node main.js clientes/algun_perfil  corre un solo perfil

import { loadCompiledKnowledge } from './src/knowledgeLoader.js';
import { recomendarProductos } from './src/recommendationEngine.js';

// Perfiles resueltos por el Conversation Simulator en el Sprint 3A para
// cada uno de sus 6 casos (ver docs/CONVERSATION_SIMULATOR.md §3) — se
// reutiliza el resultado ya validado, sin volver a ejecutar
// intentDetector.js del simulador.
const CASOS_DE_VALIDACION = [
  { caso: 'Sprint 3A Caso 1 — Bajar de peso', perfilId: 'clientes/perder_peso' },
  { caso: 'Sprint 3A Caso 3 — Insomnio', perfilId: 'clientes/descanso_sueno' },
  { caso: 'Sprint 3A Caso 5 — Distribución', perfilId: 'clientes/emprendimiento' },
  { caso: 'Sprint 3A Caso 6 — Ambiguo -> Bienestar General', perfilId: 'clientes/bienestar_general' },
  // Dos perfiles adicionales, fuera de los 6 casos de 3A, para ampliar la
  // evidencia con formas de datos distintas (un perfil con un solo
  // producto recomendado, y otro con varios).
  { caso: 'Adicional — Salud Visual (un solo producto)', perfilId: 'clientes/salud_visual' },
  { caso: 'Adicional — Energía (varios productos)', perfilId: 'clientes/energia' },
];

function imprimir(resultado, nombreCaso) {
  console.log('\n' + '='.repeat(70));
  console.log(`${nombreCaso} — ${resultado.perfilId}`);
  console.log('='.repeat(70));

  if (!resultado.perfilEncontrado) {
    console.log('  Perfil no encontrado en knowledge/compiled/entities.json.');
    return;
  }

  for (const categoria of ['PRIMARY', 'COMPLEMENTARY', 'OPTIONAL', 'NOT_RECOMMENDED']) {
    const items = resultado.porCategoria[categoria];
    console.log(`\n${categoria}`);
    if (items.length === 0) {
      console.log('  (sin productos en esta categoría para este perfil)');
    } else {
      for (const item of items) console.log(`  - ${item.titulo} (${item.productoId})`);
    }
  }

  if (resultado.sinClasificar.length > 0) {
    console.log(`\nMenciones sin clasificar (fuera de las 3 secciones extraíbles):`);
    for (const item of resultado.sinClasificar) console.log(`  - ${item.titulo} (${item.productoId})`);
  }
}

function main() {
  const kb = loadCompiledKnowledge();
  console.log(`Knowledge cargado — manifiesto: ${kb.manifest.cantidad_entidades} entidades, compilado ${kb.manifest.fecha_compilacion}`);

  const perfilCustom = process.argv[2];
  const casos = perfilCustom ? [{ caso: 'Perfil custom', perfilId: perfilCustom }] : CASOS_DE_VALIDACION;

  for (const { caso, perfilId } of casos) {
    const resultado = recomendarProductos(kb, perfilId);
    imprimir(resultado, caso);
  }
}

main();
