// verificacionSemantica.js
// Comprobación de conservación de significado entre el texto original y
// el texto preparado. No es un verificador semántico real (no hay NLP
// profundo aquí) -- es un conjunto de comprobaciones estructurales
// auditables y explícitas: mismos números, mismos signos de pregunta,
// mismo conteo de oraciones, y que el conteo de palabras solo varíe en lo
// esperado por las correcciones de ortografía/concordancia aplicadas.
//
// Si cualquier comprobación falla, se marca ok:false para que quien llame
// se detenga y reporte -- tal como pide la especificación del módulo.

function extraerNumeros(texto) {
  return (texto.match(/\d+([.,]\d+)?/g) || []).sort();
}

function contarOraciones(texto) {
  return (texto.match(/[.!?]+/g) || []).length;
}

function contarPalabras(texto) {
  return texto.split(/\s+/).filter(Boolean).length;
}

/**
 * @param {string} original
 * @param {string} preparado
 * @param {number} cambiosPalabraPorPalabra - nº de correcciones tipo 'ortografia'/'concordancia' aplicadas
 * @returns {{ ok: boolean, detalles: Array<string> }}
 */
export function verificarConservacionDeSignificado(original, preparado, cambiosPalabraPorPalabra = 0) {
  const detalles = [];
  let ok = true;

  const numerosOriginal = extraerNumeros(original);
  const numerosPreparado = extraerNumeros(preparado);
  if (JSON.stringify(numerosOriginal) !== JSON.stringify(numerosPreparado)) {
    ok = false;
    detalles.push(
      `Los números cambiaron: original=[${numerosOriginal.join(', ')}] preparado=[${numerosPreparado.join(', ')}]`
    );
  }

  const preguntasOriginal = (original.match(/\?/g) || []).length;
  const preguntasPreparado = (preparado.match(/\?/g) || []).length;
  if (preguntasOriginal !== preguntasPreparado) {
    ok = false;
    detalles.push(`El número de preguntas cambió: original=${preguntasOriginal} preparado=${preguntasPreparado}`);
  }

  const oracionesOriginal = contarOraciones(original);
  const oracionesPreparado = contarOraciones(preparado);
  if (oracionesOriginal !== oracionesPreparado) {
    ok = false;
    detalles.push(
      `El número de oraciones cambió: original=${oracionesOriginal} preparado=${oracionesPreparado} ` +
        `(este módulo, en su versión actual, no reestructura oraciones -- si esto ocurre, algo inesperado pasó)`
    );
  }

  const palabrasOriginal = contarPalabras(original);
  const palabrasPreparado = contarPalabras(preparado);
  const deltaEsperado = Math.abs(palabrasOriginal - palabrasPreparado);
  // Las correcciones de "concordancia" pueden cambiar el conteo de tokens
  // (ej. "primer" -> "primera" es 1 a 1, no cambia conteo). Un margen de
  // seguridad pequeño (2) cubre variaciones de tokenizado sin ocultar
  // problemas reales.
  if (deltaEsperado > 2) {
    ok = false;
    detalles.push(
      `El conteo de palabras cambió más de lo esperado: original=${palabrasOriginal} preparado=${palabrasPreparado} (delta=${deltaEsperado})`
    );
  }

  if (ok) {
    detalles.push('Todas las comprobaciones pasaron: mismos números, mismas preguntas, mismas oraciones, conteo de palabras estable.');
  }

  return { ok, detalles };
}
