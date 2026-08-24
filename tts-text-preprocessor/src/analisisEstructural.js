// analisisEstructural.js
// Detecta patrones ya identificados experimentalmente en este proyecto
// como asociados a sensación de lectura/publicidad (ver
// voice-reference/advisory-v2-differential-analysis.md y
// advisory-v2-deep-prosody-analysis.md), y los reporta como ADVERTENCIAS.
//
// Deliberadamente NO reescribe nada: decidir si fusionar dos oraciones o
// insertar una coma requiere criterio semántico que este módulo no tiene
// de forma segura -- automatizarlo fue exactamente el tipo de decisión
// que produjo resultados "artificiales" en experimentos anteriores.

const CONECTORES_DEPENDIENTES = ['y', 'pero', 'porque', 'que', 'sino', 'aunque'];

function dividirEnOraciones(texto) {
  const partes = texto.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return partes;
}

function contarPalabras(oracion) {
  return oracion.split(/\s+/).filter(Boolean).length;
}

function contarComas(oracion) {
  return (oracion.match(/,/g) || []).length;
}

/**
 * @param {string} texto
 * @returns {Array<{tipo: string, oracion: string, detalle: string}>}
 */
export function analizarEstructura(texto) {
  const advertencias = [];
  const oraciones = dividirEnOraciones(texto);

  oraciones.forEach((oracion, i) => {
    const palabras = contarPalabras(oracion);

    if (palabras <= 2) {
      advertencias.push({
        tipo: 'oracion_muy_corta',
        oracion,
        detalle:
          `Oración de ${palabras} palabra(s). Puede ser un cierre/apertura idiomático natural ` +
          `(ej. "Perfecto.") o un fragmento artificial (ej. "Hola." "Mira." repetidos) -- este ` +
          `módulo no distingue el caso por sí solo. No se modificó automáticamente.`,
      });
    }

    const primeraPalabra = oracion.split(/\s+/)[0]?.toLowerCase().replace(/[¿?¡!]/g, '');
    if (i > 0 && CONECTORES_DEPENDIENTES.includes(primeraPalabra)) {
      advertencias.push({
        tipo: 'posible_fragmento_dependiente',
        oracion,
        detalle:
          `Empieza con "${primeraPalabra}" justo después de un punto -- en pruebas anteriores ` +
          `(advisory_v2) este patrón indicó una oración gramaticalmente dependiente de la anterior, ` +
          `separada artificialmente con punto. Revisar si debería unirse con coma a la oración previa.`,
      });
    }

    if (palabras > 35 && contarComas(oracion) < Math.floor(palabras / 15)) {
      advertencias.push({
        tipo: 'oracion_larga_sin_pausas',
        oracion,
        detalle:
          `Oración de ${palabras} palabras con solo ${contarComas(oracion)} coma(s). Podría ` +
          `beneficiarse de una coma en un punto de coordinación real, pero decidir dónde requiere ` +
          `criterio semántico -- no se modificó automáticamente.`,
      });
    }
  });

  let racha = 0;
  oraciones.forEach((oracion, i) => {
    const palabras = contarPalabras(oracion);
    if (palabras <= 6) {
      racha += 1;
    } else {
      if (racha >= 3) {
        advertencias.push({
          tipo: 'cadena_de_oraciones_cortas',
          oracion: oraciones.slice(i - racha, i).join(' '),
          detalle:
            `${racha} oraciones consecutivas de 6 palabras o menos justo antes de esta posición -- ` +
            `este es el patrón de fragmentación que produjo sensación de "voz publicitaria" en ` +
            `advisory_v2. No se modificó automáticamente.`,
        });
      }
      racha = 0;
    }
  });
  if (racha >= 3) {
    advertencias.push({
      tipo: 'cadena_de_oraciones_cortas',
      oracion: oraciones.slice(oraciones.length - racha).join(' '),
      detalle: `${racha} oraciones consecutivas de 6 palabras o menos al final del texto.`,
    });
  }

  return advertencias;
}
