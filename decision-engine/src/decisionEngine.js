// decisionEngine.js
// Responsabilidad única: dado un mensaje de cliente, producir UNA decisión
// coherente combinando el Conversation Simulator (Sprint 3A) y el
// Recommendation Engine (Sprint 3B) — sin modificar ninguno de los dos.
//
// Resuelve el Hallazgo 1 documentado en docs/ARCHITECTURE_v1.md §8: ambos
// componentes existían validados por separado, pero el segundo (motivado
// exactamente por una limitación del primero) nunca se conectó con él. El
// simulador seguía usando su propia heurística de "primeros N productos
// referenciados" (simulator/src/knowledgeQuery.js) para decidir qué
// ofrecer, en vez de la clasificación PRIMARY/OPTIONAL/COMPLEMENTARY/
// NOT_RECOMMENDED ya construida por el Recommendation Engine.
//
// Este módulo no reimplementa el flujo de 7 pasos del simulador ni la
// clasificación del motor de recomendación — los reutiliza tal cual están,
// y su única lógica propia es la conciliación entre ambos.

import { simularConversacion } from '../../simulator/src/simulator.js';
import { loadCompiledKnowledge as cargarConocimientoParaSimulador } from '../../simulator/src/knowledgeLoader.js';
import { construirRespuestaPerfilIdentificado } from '../../simulator/src/responseBuilder.js';
import { loadCompiledKnowledge as cargarConocimientoParaRecomendacion } from '../../recommendation-engine/src/knowledgeLoader.js';
import { recomendarProductos } from '../../recommendation-engine/src/recommendationEngine.js';

// Misma rama especial que el propio simulador ya excluye de recomendación
// de producto (proceso_de_venta/emprendimiento.md) — no es una decisión
// nueva de este componente, es respetar un límite de negocio ya vigente.
const PERFIL_SIN_RECOMENDACION_DE_PRODUCTO = 'clientes/emprendimiento';

/**
 * @param {string} nombreCaso
 * @param {string} mensajeCliente
 * @returns {{
 *   caso: string,
 *   mensajeCliente: string,
 *   resultadoSimulador: Object,
 *   recomendacion: Object|null,
 *   discrepancia: {hayDiferencia: boolean, detalle: string}|null,
 *   respuestaFinal: string,
 *   fuenteDeDecision: string
 * }}
 */
export function decidir(nombreCaso, mensajeCliente) {
  const kbSimulador = cargarConocimientoParaSimulador();
  const resultadoSimulador = simularConversacion(kbSimulador, nombreCaso, mensajeCliente);

  const aplicaRecomendacion =
    resultadoSimulador.intencion === 'perfil_identificado' &&
    !!resultadoSimulador.perfilIdentificado &&
    resultadoSimulador.perfilIdentificado !== PERFIL_SIN_RECOMENDACION_DE_PRODUCTO;

  if (!aplicaRecomendacion) {
    return {
      caso: nombreCaso,
      mensajeCliente,
      resultadoSimulador,
      recomendacion: null,
      discrepancia: null,
      respuestaFinal: resultadoSimulador.respuestaAsesor,
      fuenteDeDecision: 'Conversation Simulator — esta rama no selecciona producto (seguridad, precio, ambiguo o emprendimiento), nada que conciliar.',
    };
  }

  const kbRecomendacion = cargarConocimientoParaRecomendacion();
  const recomendacion = recomendarProductos(kbRecomendacion, resultadoSimulador.perfilIdentificado);

  if (!recomendacion.perfilEncontrado) {
    // Defensivo: no debería ocurrir (los perfiles que el detector de
    // intención puede devolver son un subconjunto fijo de perfiles reales),
    // pero si algún día ocurre, no se inventa una recomendación — se cae
    // de vuelta a la respuesta del simulador y se declara por qué.
    return {
      caso: nombreCaso,
      mensajeCliente,
      resultadoSimulador,
      recomendacion,
      discrepancia: null,
      respuestaFinal: resultadoSimulador.respuestaAsesor,
      fuenteDeDecision: `Conversation Simulator — el Recommendation Engine no encontró el perfil "${resultadoSimulador.perfilIdentificado}" en el conocimiento compilado.`,
    };
  }

  const discrepancia = compararSeleccion(resultadoSimulador.productosSeleccionados, recomendacion);
  const respuestaFinal = construirRespuestaCorregida(kbRecomendacion, resultadoSimulador.perfilIdentificado, recomendacion);

  return {
    caso: nombreCaso,
    mensajeCliente,
    resultadoSimulador,
    recomendacion,
    discrepancia,
    respuestaFinal,
    fuenteDeDecision: 'Decision Engine — producto priorizado por el Recommendation Engine (PRIMARY primero), no por la heurística de orden del simulador.',
  };
}

/**
 * Compara el primer producto que el simulador habría ofrecido (heurística
 * de orden de aparición) contra el producto que el Recommendation Engine
 * clasifica como PRIMARY para el mismo perfil. Deliberadamente comparamos
 * solo la recomendación principal, no el conjunto completo — es el dato
 * que realmente determina "qué dice el asesor primero", y mantiene la
 * conciliación simple y legible en vez de un diff exhaustivo no pedido.
 */
function compararSeleccion(productosSimulador, recomendacion) {
  const primeroCorregido = recomendacion.ordenPresentacion[0]?.productoId ?? null;
  const primeroSimulador = productosSimulador[0] ?? null;

  if (primeroSimulador === primeroCorregido) {
    return {
      hayDiferencia: false,
      detalle: 'La heurística del simulador coincidió con la clasificación del Recommendation Engine para este caso.',
    };
  }

  return {
    hayDiferencia: true,
    detalle:
      `El simulador habría ofrecido primero "${primeroSimulador ?? '(ninguno)'}" (heurística de orden de aparición); ` +
      `el Recommendation Engine clasifica "${primeroCorregido ?? '(ninguno)'}" como PRIMARY. Se usa la clasificación del Recommendation Engine.`,
  };
}

/**
 * Reutiliza el mismo constructor de respuesta del simulador
 * (responseBuilder.js, sin modificar) pero alimentado con la lista de
 * productos ya priorizada por el Recommendation Engine — PRIMARY primero,
 * luego OPTIONAL — en vez de la heurística de orden de aparición.
 */
function construirRespuestaCorregida(kb, perfilId, recomendacion) {
  const perfil = kb.entityById.get(perfilId);
  const productosPriorizados = [...recomendacion.porCategoria.PRIMARY, ...recomendacion.porCategoria.OPTIONAL].map(
    (p) => ({ id: p.productoId, titulo: p.titulo })
  );
  return construirRespuestaPerfilIdentificado({ perfil, productos: productosPriorizados }).borrador;
}
