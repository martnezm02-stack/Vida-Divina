// ortografia.js
// Aplica CORRECCIONES_SEGURAS y CORRECCIONES_CONCORDANCIA palabra por
// palabra (o frase por frase, para concordancia), preservando mayúsculas
// iniciales y devolviendo un registro auditable de cada cambio. Nunca
// toca PALABRAS_AMBIGUAS — esas solo se detectan (ver deteccionAmbiguas.js).

import { CORRECCIONES_SEGURAS, CORRECCIONES_CONCORDANCIA } from './diccionarioOrtografico.js';

function conMismaCapitalizacion(original, corregida) {
  if (original.length === 0) return corregida;
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return corregida.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return corregida[0].toUpperCase() + corregida.slice(1);
  }
  return corregida;
}

/**
 * Aplica primero las correcciones de concordancia (frases completas,
 * insensible a mayúsculas) y luego las correcciones ortográficas palabra
 * por palabra sobre el resultado.
 *
 * @param {string} texto
 * @returns {{ texto: string, cambios: Array<{tipo: string, original: string, corregido: string}> }}
 */
export function aplicarOrtografia(texto) {
  const cambios = [];
  let resultado = texto;

  for (const [frase, correccion] of CORRECCIONES_CONCORDANCIA) {
    const re = new RegExp(frase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    resultado = resultado.replace(re, (coincidencia) => {
      const corregida = conMismaCapitalizacion(coincidencia, correccion);
      if (corregida !== coincidencia) {
        cambios.push({ tipo: 'concordancia', original: coincidencia, corregido: corregida });
      }
      return corregida;
    });
  }

  const palabras = resultado.split(/(\s+|[.,;:!?¿¡"«»()—–-])/);
  const palabrasCorregidas = palabras.map((token) => {
    if (!/^[a-záéíóúñüA-ZÁÉÍÓÚÑÜ]+$/.test(token)) return token;
    const clave = token.toLowerCase();
    if (CORRECCIONES_SEGURAS.has(clave)) {
      const correccion = CORRECCIONES_SEGURAS.get(clave);
      if (correccion.toLowerCase() === clave) return token; // ya era correcta, sin cambio real
      const corregida = conMismaCapitalizacion(token, correccion);
      cambios.push({ tipo: 'ortografia', original: token, corregido: corregida });
      return corregida;
    }
    return token;
  });

  return { texto: palabrasCorregidas.join(''), cambios };
}
