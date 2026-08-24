// outboundBuilder.js
// Traduce el resultado de conversationRouter.js a una lista de recursos
// comerciales estructurados (texto, audio, testimonio, imagen de precio,
// oferta, cierre) — no a una ráfaga plana de strings. Ningún recurso
// inventa contenido: cuando la función del motor marcó algo como
// PENDIENTE/no disponible, aquí se conserva `disponible: false` sin
// contenido, nunca un texto sustituto.
//
// No construye ni ejecuta el envío real a la Cloud API — esa pieza no
// existe todavía en esta fase (Fase 4.2, sin conexión a Meta).

export function construirSalida(id, resultadoRouter) {
  const { pasos, handoff, sinAccionDefinida } = resultadoRouter;

  if (handoff) {
    return {
      id,
      enviar: false,
      recursos: [],
      handoff: { motivo: handoff.motivo, fuente: handoff.fuente ?? null, yaExistente: !!handoff.yaExistente },
    };
  }

  if (sinAccionDefinida) {
    return { id, enviar: false, recursos: [], handoff: null, sinAccionDefinida: true };
  }

  const recursos = pasos.flatMap(recursosDelPaso);
  return { id, enviar: recursos.length > 0, recursos, handoff: null };
}

function recursosDelPaso({ funcion, resultado }) {
  switch (funcion) {
    case 'iniciarConversacionPersistente':
      return [{ tipo: 'texto', contenido: resultado.mensaje, fuente: resultado.fuente }];

    case 'clasificarPrimeraRespuestaPersistente':
      // Paso interno de clasificación — no genera contenido para el
      // cliente (Sprint 5 principio 7: el cliente no debe percibir al motor).
      return [];

    case 'procesarFlujoConsumoPersistente': {
      if (resultado.handoff) return [];
      return [
        {
          tipo: 'audio',
          contenido: resultado.preguntaAudio,
          fuente: 'docs/proceso_de_venta/recursos/audio_explicacion.md',
        },
      ];
    }

    case 'procesarNecesidadYPrecioPersistente': {
      if (resultado.handoff) return [];
      const recursos = [];
      const pasoTestimonio = resultado.traza.find((p) => p.nombre === 'Seleccionar testimonio');
      if (pasoTestimonio) {
        recursos.push({
          tipo: 'testimonio',
          disponible: pasoTestimonio.detalle.disponible,
          necesidadId: resultado.necesidadId,
          fuente: pasoTestimonio.detalle.fuente,
        });
      }
      recursos.push({
        tipo: 'imagen_precio',
        disponible: resultado.precio.disponible,
        contenido: resultado.precio.disponible ? resultado.precio : null,
        fuente: resultado.precio.fuente,
      });
      return recursos;
    }

    case 'procesarOfertaYCierrePersistente': {
      if (resultado.handoff) return [];
      return [
        { tipo: 'oferta', disponible: true, contenido: resultado.oferta.texto, fuente: resultado.oferta.fuente },
        {
          tipo: 'cierre',
          subtipo: resultado.cierre.tipo,
          contenido: resultado.cierre.tipo === 'audio' ? resultado.cierre.preguntaFinal : resultado.cierre.mensaje,
          fuente: resultado.cierre.fuente,
        },
      ];
    }

    case 'procesarRespuestaClientePersistente':
    case 'procesarRespuestaRecuperacionPersistente': {
      if (resultado.tipo === 'senal_medica') {
        return [{ tipo: 'texto', contenido: resultado.respuesta.borrador, fuente: resultado.respuesta.fuentePlantilla }];
      }
      if (resultado.tipo === 'lo_voy_a_pensar' && resultado.mensajeRespuesta) {
        return [{ tipo: 'texto', contenido: resultado.mensajeRespuesta, fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §21.2' }];
      }
      if (resultado.tipo === 'duda_documentada') {
        // Reutiliza la coincidencia ya encontrada por
        // identificarObjecionDocumentada (ventaRealRules.js) — no existe
        // en código un texto de respuesta transcrito para objeciones (a
        // diferencia de audio/precio/oferta/cierre en
        // recursosComerciales.js), así que no se inventa uno: se cita la
        // objeción y su fuente en docs/objeciones/ para que la respuesta
        // real se resuelva desde ese conocimiento ya documentado.
        return [{ tipo: 'objecion_documentada', objecionId: resultado.objecionId, fuente: resultado.fuente }];
      }
      return [];
    }

    default:
      return [];
  }
}
