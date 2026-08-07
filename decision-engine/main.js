#!/usr/bin/env node
// main.js — Decision Engine / Conversation Orchestrator.
//
// Conecta Conversation Simulator (Sprint 3A) y Recommendation Engine
// (Sprint 3B) en un solo flujo de decisión — sin modificar ninguno de los
// dos. Resuelve el Hallazgo 1 de docs/ARCHITECTURE_v1.md (§8, §12 paso 4).
//
// Uso:
//   node main.js                   corre los mismos 6 casos de prueba del Conversation Simulator
//   node main.js "mensaje libre"   corre un único mensaje custom

import { decidir } from './src/decisionEngine.js';

const CASOS_DE_PRUEBA = [
  { nombre: 'Caso 1 — Interés en bajar de peso', mensaje: 'Hola, busco bajar de peso.' },
  { nombre: 'Caso 2 — Persona con diabetes', mensaje: 'Hola, tengo diabetes, ¿puedo tomar algo de ustedes?' },
  { nombre: 'Caso 3 — Persona con insomnio', mensaje: 'Buenas, no puedo dormir bien últimamente.' },
  { nombre: 'Caso 4 — Solo pregunta precio', mensaje: 'Hola, solo quiero saber el precio del TéDivina.' },
  { nombre: 'Caso 5 — Interés en distribución', mensaje: 'Hola, me interesa el negocio, ¿cómo le hago para ganar dinero con esto?' },
  { nombre: 'Caso 6 — Estado ambiguo (bonus)', mensaje: 'Hola, quiero información.' },
];

function imprimir(decision) {
  console.log('\n' + '='.repeat(70));
  console.log(decision.caso);
  console.log('='.repeat(70));
  console.log(`Cliente: "${decision.mensajeCliente}"`);
  console.log(
    `Intención: ${decision.resultadoSimulador.intencion} | Perfil: ${decision.resultadoSimulador.perfilIdentificado ?? '(ninguno)'}`
  );

  if (decision.discrepancia) {
    console.log('\nConciliación Simulator <-> Recommendation Engine:');
    console.log(`  ¿Hay diferencia?: ${decision.discrepancia.hayDiferencia ? 'SÍ' : 'no'}`);
    console.log(`  ${decision.discrepancia.detalle}`);
  }

  console.log('\nRespuesta final del Decision Engine:');
  console.log(`  "${decision.respuestaFinal}"`);
  console.log(`\nFuente de la decisión: ${decision.fuenteDeDecision}`);
}

function main() {
  const mensajeCustom = process.argv[2];
  const casos = mensajeCustom ? [{ nombre: 'Mensaje custom', mensaje: mensajeCustom }] : CASOS_DE_PRUEBA;

  let diferencias = 0;
  for (const caso of casos) {
    const decision = decidir(caso.nombre, caso.mensaje);
    imprimir(decision);
    if (decision.discrepancia?.hayDiferencia) diferencias++;
  }

  console.log('\n' + '#'.repeat(70));
  console.log(`Casos ejecutados: ${casos.length} · Casos donde el Decision Engine corrigió al simulador: ${diferencias}`);
  console.log('#'.repeat(70));
}

main();
