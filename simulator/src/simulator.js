// simulator.js
// Orquestador de los 7 pasos pedidos en el encargo del sprint. Responde a
// una única pregunta por cada mensaje simulado: "si esta conversación la
// atendiera el asesor experto de Vida Divina, ¿cuál sería su siguiente
// decisión, y por qué?" — la traza devuelta es precisamente esa
// justificación, con cita de fuente en cada paso.

import { detectarIntencion } from './intentDetector.js';
import { describirEstado } from './stateMachine.js';
import {
  getPerfil,
  getProductosRecomendados,
  getRecursosDeApoyo,
  getTestimonios,
  getPromociones,
  getPrecio,
} from './knowledgeQuery.js';
import {
  construirRespuestaSeguridad,
  construirRespuestaPerfilIdentificado,
  construirRespuestaPrecio,
  construirRespuestaAmbigua,
} from './responseBuilder.js';

/**
 * @param {Object} kb - knowledge cargado por knowledgeLoader.loadCompiledKnowledge()
 * @param {string} nombreCaso - identificador legible del caso de prueba (para el tracker de hallazgos)
 * @param {string} mensajeCliente
 */
export function simularConversacion(kb, nombreCaso, mensajeCliente) {
  const traza = [];
  const paso = (numero, nombre, detalle) => traza.push({ paso: numero, nombre, detalle });

  // Paso 1: detectar estado inicial.
  const estadoInicial = describirEstado('Nuevo');
  paso(1, 'Detectar estado inicial', { estado: estadoInicial.id, fuente: estadoInicial.fuente });

  // Paso 2: identificar la intención (incluye calificación del cliente).
  const intencion = detectarIntencion(mensajeCliente);
  paso(2, 'Identificar intención', {
    tipo: intencion.tipo,
    perfilId: intencion.perfilId,
    calificacion: intencion.calificacion,
    fuente: intencion.fuente,
  });

  // Paso 3: aplicar las reglas del proceso comercial (decidir el camino).
  paso(3, 'Aplicar reglas del proceso comercial', {
    regla_aplicada: intencion.tipo,
    fuente: 'docs/proceso_de_venta/reglas_de_decision.md (Tabla 3) + docs/agente_ia/reglas_de_decision.md',
  });

  let estadoFinal;
  let respuesta;
  let perfil = null;
  let productos = [];
  let recursos = [];
  let testimonios = [];
  let promociones = [];

  if (intencion.tipo === 'senal_medica') {
    // Paso 4-5: no se consulta clientes/productos — la seguridad detiene el flujo comercial normal.
    paso(4, 'Consultar conocimiento compilado', {
      omitido: true,
      razon: 'Prioridad 1 (Seguridad) detiene la recomendación — agente_ia/prioridades.md',
    });
    paso(5, 'Seleccionar producto / testimonios / recursos / promociones', {
      omitido: true,
      razon: 'No aplica recomendar producto ante señal médica',
    });
    respuesta = construirRespuestaSeguridad({ mensaje: mensajeCliente });
    estadoFinal = describirEstado('ObjecionDetectada');
  } else if (intencion.tipo === 'pregunta_precio') {
    paso(4, 'Consultar conocimiento compilado', { nota: 'No hay producto identificado todavía — pregunta de precio sin perfil' });
    getPrecio(kb, null, { conversacionEvidencia: nombreCaso }); // registra hallazgo, no inventa precio
    paso(5, 'Seleccionar producto / testimonios / recursos / promociones', { omitido: true, razon: 'Sin perfil identificado' });
    respuesta = construirRespuestaPrecio();
    estadoFinal = describirEstado('Nuevo');
  } else if (intencion.tipo === 'perfil_identificado') {
    perfil = getPerfil(kb, intencion.perfilId);
    paso(4, 'Consultar conocimiento compilado', {
      perfil_consultado: intencion.perfilId,
      encontrado: !!perfil,
      fuente: 'knowledge/compiled/entities.json',
    });

    if (intencion.perfilId === 'clientes/emprendimiento') {
      promociones = getPromociones(kb, { conversacionEvidencia: nombreCaso });
      paso(5, 'Seleccionar recursos', { nota: 'Rama de emprendimiento — no se recomienda producto de consumo, ver proceso_de_venta/emprendimiento.md' });
      respuesta = {
        borrador:
          '¡Qué bueno que preguntas! Antes de contarte todos los detalles del negocio, cuéntame: ¿qué te interesa más — un ingreso extra, conocer los productos primero, o ambas cosas? (No puedo darte cifras de ingreso — esa información no está documentada en el conocimiento compilado; se remite siempre al material oficial de negocio.)',
        fuentePlantilla: 'docs/conversaciones/emprendimiento/respuesta_interes_directo.md',
        accionSiguiente: 'Avanzar a estado ProspectoDeEmprendimiento.',
      };
      estadoFinal = describirEstado('ProspectoDeEmprendimiento');
    } else {
      productos = getProductosRecomendados(kb, intencion.perfilId, { maxResultados: 3, conversacionEvidencia: nombreCaso });
      recursos = getRecursosDeApoyo(kb, { perfilId: intencion.perfilId, conversacionEvidencia: nombreCaso });
      testimonios = getTestimonios(kb, { perfilId: intencion.perfilId, conversacionEvidencia: nombreCaso });
      paso(5, 'Seleccionar producto / testimonios / recursos / promociones', {
        productos_encontrados: productos.map((p) => p.id),
        testimonios_encontrados: testimonios.length,
        recursos_encontrados: recursos.length,
      });
      respuesta = construirRespuestaPerfilIdentificado({ perfil, productos });
      estadoFinal = describirEstado('ProductoRecomendado');
    }
  } else {
    // ambiguo
    paso(4, 'Consultar conocimiento compilado', { nota: 'Perfil no identificable con el primer mensaje — se aplica fallback documentado' });
    paso(5, 'Seleccionar producto / testimonios / recursos / promociones', { omitido: true, razon: 'No se recomienda sin perfil (principio, agente_ia/principios.md)' });
    respuesta = construirRespuestaAmbigua();
    estadoFinal = describirEstado('EnDescubrimiento');
  }

  // Paso 6: generar la respuesta (ya construida arriba).
  paso(6, 'Generar respuesta del asesor', { borrador: respuesta.borrador, fuente_plantilla: respuesta.fuentePlantilla });

  // Paso 7: mostrar el siguiente estado.
  paso(7, 'Siguiente estado de la conversación', { estado: estadoFinal.id, fuente: estadoFinal.fuente });

  return {
    caso: nombreCaso,
    mensajeCliente,
    traza,
    estadoInicial: estadoInicial.id,
    estadoFinal: estadoFinal.id,
    intencion: intencion.tipo,
    perfilIdentificado: perfil?.id ?? null,
    productosSeleccionados: productos.map((p) => p.id),
    respuestaAsesor: respuesta.borrador,
    accionSiguiente: respuesta.accionSiguiente,
  };
}
