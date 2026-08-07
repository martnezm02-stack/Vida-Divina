// responseBuilder.js
// Paso 6 del flujo: "Construir respuesta". Genera dos salidas distintas,
// deliberadamente separadas para que quede claro qué es conocimiento real
// y qué es texto de plantilla del simulador:
//
//   1) "traza"  — la secuencia de decisiones tomadas, con la fuente
//                 documental de cada una (equivalente a docs/agente_ia/ejemplos.md).
//   2) "borrador" — un mensaje de ejemplo simple, generado por plantilla
//                 determinística. NO es texto copiado de
//                 docs/conversaciones/ — es una síntesis mínima que cita
//                 de dónde salió cada dato, para no aparentar ser una
//                 respuesta "real" de asesor cuando es una construcción
//                 del simulador sobre datos reales.

export function construirRespuestaSeguridad({ mensaje }) {
  return {
    borrador:
      'Entiendo, es importante lo que me comentas. Con temas de salud o medicamentos, lo más responsable es que lo consultes primero con tu médico — no tengo forma de saber cómo interactúa con tu situación específica. Si él te da luz verde, con gusto seguimos platicando de qué opción te podría servir.',
    fuentePlantilla: 'docs/conversaciones/objeciones/mi_medico_no_me_deja.md (paráfrasis, no cita literal)',
    accionSiguiente: 'Detener recomendación de producto. No avanzar a estado ProductoRecomendado.',
  };
}

export function construirRespuestaPerfilIdentificado({ perfil, productos }) {
  if (!perfil) {
    return {
      borrador: 'No fue posible identificar la ficha del perfil en el conocimiento compilado.',
      fuentePlantilla: null,
      accionSiguiente: 'Reportar como hallazgo — ver Campos faltantes detectados.',
    };
  }

  const nombreProductos = productos.map((p) => p.titulo).filter(Boolean);
  const listaProductos =
    nombreProductos.length > 0
      ? nombreProductos.join(', ')
      : '(sin productos recomendados localizables en el conocimiento compilado — ver hallazgo)';

  return {
    borrador: `Para lo que me cuentas, dentro de lo que manejamos en ${perfil.titulo}, te recomendaría empezar por: ${listaProductos}. ¿Te gustaría que te cuente un poco más de alguno en particular?`,
    fuentePlantilla: `${perfil.ruta_original} (sección "Productos recomendados" — ver limitación de orden en knowledgeQuery.js)`,
    accionSiguiente: 'Avanzar a estado ProductoRecomendado; esperar señal del cliente (Tabla 3, proceso_de_venta/reglas_de_decision.md).',
  };
}

export function construirRespuestaPrecio() {
  return {
    borrador:
      '¡Hola! Con gusto te comparto el precio, dame un momento para confirmarte el valor exacto vigente. Mientras tanto, cuéntame, ¿ya conocías el producto o es la primera vez que preguntas por él?',
    fuentePlantilla: 'docs/conversaciones/primer_contacto/pregunta_precio.md',
    accionSiguiente: 'No inventar cifra. Permanecer en estado Nuevo hasta obtener el precio real de una fuente operativa (ver hallazgo).',
  };
}

export function construirRespuestaAmbigua() {
  return {
    borrador:
      '¡Hola! Un gusto saludarte. Para orientarte mejor, cuéntame: ¿hay algo puntual que te gustaría mejorar o cuidar en este momento (energía, peso, piel, etc.), o prefieres que te cuente en general qué manejamos?',
    fuentePlantilla: 'docs/conversaciones/descubrimiento/preguntas_generales.md',
    accionSiguiente: 'Permanecer en estado EnDescubrimiento — no se recomienda producto sin perfil identificado (principio, agente_ia/principios.md).',
  };
}
