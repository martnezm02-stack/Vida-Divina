#!/usr/bin/env node
// main.js — Conversation Simulator MVP (Sprint 3A).
//
// Uso:
//   node main.js                    corre los 6 casos de prueba fijos
//   node main.js "mensaje libre"     corre un único mensaje custom
//
// No usa IA, LLM, prompts, ni APIs. Toda la lógica es determinística,
// sobre knowledge/compiled/ (Sprint 2) y las tablas transcritas y citadas
// en src/rules.js y src/stateMachine.js.

import { loadCompiledKnowledge } from './src/knowledgeLoader.js';
import { simularConversacion } from './src/simulator.js';
import { obtenerHallazgos, reiniciarHallazgos } from './src/missingFieldsTracker.js';

const CASOS_DE_PRUEBA = [
  { nombre: 'Caso 1 — Interés en bajar de peso', mensaje: 'Hola, busco bajar de peso.' },
  { nombre: 'Caso 2 — Persona con diabetes', mensaje: 'Hola, tengo diabetes, ¿puedo tomar algo de ustedes?' },
  { nombre: 'Caso 3 — Persona con insomnio', mensaje: 'Buenas, no puedo dormir bien últimamente.' },
  { nombre: 'Caso 4 — Solo pregunta precio', mensaje: 'Hola, solo quiero saber el precio del TéDivina.' },
  { nombre: 'Caso 5 — Interés en distribución', mensaje: 'Hola, me interesa el negocio, ¿cómo le hago para ganar dinero con esto?' },
  { nombre: 'Caso 6 — Estado ambiguo (bonus)', mensaje: 'Hola, quiero información.' },
];

function imprimirResultado(resultado) {
  console.log('\n' + '='.repeat(70));
  console.log(resultado.caso);
  console.log('='.repeat(70));
  console.log(`Cliente: "${resultado.mensajeCliente}"`);
  console.log('');
  for (const paso of resultado.traza) {
    console.log(`  [Paso ${paso.paso}] ${paso.nombre}`);
    console.log(`    ${JSON.stringify(paso.detalle)}`);
  }
  console.log('');
  console.log(`Estado inicial -> final: ${resultado.estadoInicial} -> ${resultado.estadoFinal}`);
  console.log(`Intención detectada: ${resultado.intencion}`);
  console.log(`Perfil identificado: ${resultado.perfilIdentificado ?? '(ninguno)'}`);
  console.log(`Productos seleccionados: ${resultado.productosSeleccionados.join(', ') || '(ninguno)'}`);
  console.log('');
  console.log('Respuesta del asesor (borrador generado por el simulador):');
  console.log(`  "${resultado.respuestaAsesor}"`);
  console.log('');
  console.log(`Acción siguiente: ${resultado.accionSiguiente}`);
}

function main() {
  const kb = loadCompiledKnowledge();
  console.log(
    `Knowledge cargado desde knowledge/compiled/ — manifiesto: ${kb.manifest.cantidad_entidades} entidades, compilado ${kb.manifest.fecha_compilacion}`
  );

  const mensajeCustom = process.argv[2];
  const casos = mensajeCustom
    ? [{ nombre: 'Mensaje custom', mensaje: mensajeCustom }]
    : CASOS_DE_PRUEBA;

  reiniciarHallazgos();
  const resultados = [];
  for (const caso of casos) {
    const resultado = simularConversacion(kb, caso.nombre, caso.mensaje);
    imprimirResultado(resultado);
    resultados.push(resultado);
  }

  console.log('\n' + '#'.repeat(70));
  console.log('CAMPOS FALTANTES DETECTADOS (acumulado de toda la corrida)');
  console.log('#'.repeat(70));
  const hallazgos = obtenerHallazgos();
  hallazgos.forEach((h, i) => {
    console.log(`\n${i + 1}. ${h.informacion_faltante}`);
    console.log(`   Momento: ${h.momento_de_la_conversacion}`);
    console.log(`   Por qué: ${h.por_que_es_necesaria}`);
    console.log(`   Dónde incorporar: ${h.donde_deberia_incorporarse}`);
    console.log(`   Evidenciado en: ${h.conversaciones_que_lo_evidenciaron.join(', ')}`);
  });

  console.log(`\nTotal de casos ejecutados: ${resultados.length}`);
  console.log(`Total de hallazgos únicos: ${hallazgos.length}`);
}

main();
