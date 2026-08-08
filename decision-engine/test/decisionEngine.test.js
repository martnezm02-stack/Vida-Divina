// decisionEngine.test.js
// Pruebas automatizadas del cierre de sprint del Decision Engine.
//
// Nota honesta sobre alcance: ningún otro componente (compiler/,
// simulator/, recommendation-engine/) tiene hoy pruebas automatizadas —
// su validación hasta este cierre fue exclusivamente ejecución manual de
// casos vía main.js y verificación humana de la salida (documentado en
// docs/PROJECT_STATE.md §7). Este archivo no reproduce "el mismo nivel"
// porque ese nivel es cero; en su lugar, establece el primer piso real de
// cobertura automatizada del proyecto, usando únicamente node:test y
// node:assert/strict — sin dependencias externas, igual que el resto del
// código (Decisión congelada, docs/ARCHITECTURE_v1.md §11.6).
//
// Alcance deliberado: se prueba exclusivamente el contrato público
// exportado, decidir(nombreCaso, mensajeCliente) — el mismo punto de
// entrada que ya usa decision-engine/main.js. No se exportan funciones
// internas (compararSeleccion, construirRespuestaCorregida) solo para
// facilitar el testeo; eso cambiaría el contrato del componente, algo
// que este cierre de sprint tiene instrucción explícita de no hacer.
//
// Los 6 mensajes de "casos estándar" replican deliberadamente
// decision-engine/main.js (CASOS_DE_PRUEBA) en vez de importarlos, para
// no tener que exportar esa constante y así no tocar el comportamiento
// ni la superficie pública de main.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decidir } from '../src/decisionEngine.js';

const CASOS_ESTANDAR = [
  { nombre: 'Caso 1 — Interés en bajar de peso', mensaje: 'Hola, busco bajar de peso.', perfilEsperado: 'clientes/perder_peso' },
  { nombre: 'Caso 3 — Persona con insomnio', mensaje: 'Buenas, no puedo dormir bien últimamente.', perfilEsperado: 'clientes/descanso_sueno' },
];

function assertFormaDeSalida(decision) {
  assert.equal(typeof decision.respuestaFinal, 'string');
  assert.ok(decision.respuestaFinal.length > 0, 'respuestaFinal no debe estar vacía');
  assert.equal(typeof decision.fuenteDeDecision, 'string');
  assert.ok(decision.fuenteDeDecision.length > 0, 'fuenteDeDecision no debe estar vacía');
  assert.ok('resultadoSimulador' in decision);
  assert.ok('recomendacion' in decision);
  assert.ok('discrepancia' in decision);

  if (decision.discrepancia !== null) {
    assert.equal(typeof decision.discrepancia.hayDiferencia, 'boolean');
    assert.equal(typeof decision.discrepancia.detalle, 'string');
  }

  if (decision.recomendacion !== null) {
    assert.equal(typeof decision.recomendacion.perfilEncontrado, 'boolean');
    assert.equal(typeof decision.recomendacion.porCategoria, 'object');
    assert.ok(Array.isArray(decision.recomendacion.ordenPresentacion));
    assert.ok(Array.isArray(decision.recomendacion.sinClasificar));
  }
}

describe('Decision Engine — funcionamiento correcto (casos estándar con recomendación)', () => {
  for (const { nombre, mensaje, perfilEsperado } of CASOS_ESTANDAR) {
    test(`${nombre}: produce una decisión coherente con recomendación`, () => {
      const decision = decidir(nombre, mensaje);

      assertFormaDeSalida(decision);
      assert.equal(decision.resultadoSimulador.intencion, 'perfil_identificado');
      assert.equal(decision.resultadoSimulador.perfilIdentificado, perfilEsperado);

      // aplicaRecomendacion (decisionEngine.js) exige perfil identificado y
      // distinto de clientes/emprendimiento — ambos casos lo cumplen.
      assert.ok(decision.recomendacion !== null, 'debe haber recomendación del Recommendation Engine');
      assert.equal(decision.recomendacion.perfilEncontrado, true);
      assert.ok(decision.discrepancia !== null, 'debe haber conciliación cuando hay recomendación');
      assert.equal(decision.fuenteDeDecision.startsWith('Decision Engine'), true);

      // La respuesta final debe reflejar el producto PRIMARY del
      // Recommendation Engine, no la heurística cruda del simulador.
      const primaryEsperado = decision.recomendacion.porCategoria.PRIMARY[0];
      if (primaryEsperado) {
        assert.ok(
          decision.respuestaFinal.includes(primaryEsperado.titulo),
          `respuestaFinal debería mencionar el producto PRIMARY "${primaryEsperado.titulo}"`
        );
      }
    });
  }

  test('Caso Insomnio: la clasificación del Recommendation Engine coincide con la heurística del simulador para el conocimiento compilado actual', () => {
    const decision = decidir('Caso Insomnio', 'Buenas, no puedo dormir bien últimamente.');
    assert.equal(decision.discrepancia.hayDiferencia, false);
  });
});

describe('Decision Engine — ramas especiales (sin selección de producto)', () => {
  test('Señal médica: la seguridad detiene la recomendación, nada que conciliar', () => {
    const decision = decidir('Caso médico', 'Hola, tengo diabetes, ¿puedo tomar algo de ustedes?');

    assertFormaDeSalida(decision);
    assert.equal(decision.resultadoSimulador.intencion, 'senal_medica');
    assert.equal(decision.resultadoSimulador.perfilIdentificado, null);
    assert.equal(decision.recomendacion, null);
    assert.equal(decision.discrepancia, null);
    assert.equal(decision.fuenteDeDecision.startsWith('Conversation Simulator'), true);
  });

  test('Pregunta de precio: sin perfil identificado, nada que conciliar', () => {
    const decision = decidir('Caso precio', 'Hola, solo quiero saber el precio del TéDivina.');

    assertFormaDeSalida(decision);
    assert.equal(decision.resultadoSimulador.intencion, 'pregunta_precio');
    assert.equal(decision.recomendacion, null);
    assert.equal(decision.discrepancia, null);
    assert.equal(decision.fuenteDeDecision.startsWith('Conversation Simulator'), true);
  });

  test('Emprendimiento: perfil identificado pero excluido explícitamente de recomendación de producto', () => {
    const decision = decidir('Caso emprendimiento', 'Hola, me interesa el negocio, ¿cómo le hago para ganar dinero con esto?');

    assertFormaDeSalida(decision);
    assert.equal(decision.resultadoSimulador.intencion, 'perfil_identificado');
    assert.equal(decision.resultadoSimulador.perfilIdentificado, 'clientes/emprendimiento');
    assert.equal(decision.recomendacion, null, 'clientes/emprendimiento debe quedar excluido aunque tenga perfil identificado');
    assert.equal(decision.discrepancia, null);
    assert.equal(decision.fuenteDeDecision.startsWith('Conversation Simulator'), true);
  });

  test('Mensaje ambiguo (sin coincidencia con ninguna señal): cae al fallback documentado sin recomendación, aunque el simulador asigne bienestar_general internamente', () => {
    // Mensaje deliberadamente sin coincidencia con SENAL_MEDICA, SENALES_PERFIL
    // ni SENAL_PRECIO (simulator/src/rules.js) — ejercita la rama "ambiguo"
    // de intentDetector.js, señalada como no probada en
    // docs/CONVERSATION_SIMULATOR.md §3 ("prueba pendiente").
    const decision = decidir('Caso ambiguo real', 'xkjqz wblorp fnstv');

    assertFormaDeSalida(decision);
    assert.equal(decision.resultadoSimulador.intencion, 'ambiguo');
    // simulator.js solo asigna perfil cuando intencion.tipo === 'perfil_identificado';
    // en la rama ambigua, perfilIdentificado queda null pese a que
    // intentDetector.js resuelve internamente clientes/bienestar_general como fallback.
    assert.equal(decision.resultadoSimulador.perfilIdentificado, null);
    assert.equal(decision.recomendacion, null, 'la rama ambigua no debe aplicar recomendación (exige intencion === perfil_identificado)');
    assert.equal(decision.discrepancia, null);
    assert.equal(decision.fuenteDeDecision.startsWith('Conversation Simulator'), true);
  });
});

describe('Decision Engine — ausencia de excepciones y consistencia de salida', () => {
  const TODOS_LOS_CASOS = [
    'Hola, busco bajar de peso.',
    'Hola, tengo diabetes, ¿puedo tomar algo de ustedes?',
    'Buenas, no puedo dormir bien últimamente.',
    'Hola, solo quiero saber el precio del TéDivina.',
    'Hola, me interesa el negocio, ¿cómo le hago para ganar dinero con esto?',
    'Hola, quiero información.',
    'xkjqz wblorp fnstv',
  ];

  for (const mensaje of TODOS_LOS_CASOS) {
    test(`no lanza excepción para: "${mensaje}"`, () => {
      assert.doesNotThrow(() => {
        const decision = decidir('Caso de consistencia', mensaje);
        assertFormaDeSalida(decision);
      });
    });
  }

  test('perfilEncontrado siempre es true cuando hay recomendación (no hay perfiles inventados)', () => {
    for (const mensaje of TODOS_LOS_CASOS) {
      const decision = decidir('Caso de consistencia', mensaje);
      if (decision.recomendacion !== null) {
        assert.equal(decision.recomendacion.perfilEncontrado, true);
      }
    }
  });
});
