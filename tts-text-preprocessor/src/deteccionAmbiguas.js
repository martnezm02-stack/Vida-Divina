// deteccionAmbiguas.js
// Busca palabras de PALABRAS_AMBIGUAS como tokens sueltos y las reporta
// como advertencia -- nunca las corrige, porque decidir entre las dos
// formas requiere saber el rol gramatical exacto en la oración.

import { PALABRAS_AMBIGUAS } from './diccionarioOrtografico.js';

/**
 * @param {string} texto
 * @returns {Array<{tipo: string, palabra: string, contexto: string}>}
 */
export function detectarPalabrasAmbiguas(texto) {
  const advertencias = [];
  const tokens = texto.split(/(\s+|[.,;:!?¿¡"«»()—–-])/);
  let posicionTexto = 0;

  tokens.forEach((token) => {
    const inicio = posicionTexto;
    posicionTexto += token.length;
    const limpio = token.toLowerCase();
    if (PALABRAS_AMBIGUAS.has(limpio)) {
      const contexto = texto.slice(Math.max(0, inicio - 20), Math.min(texto.length, inicio + token.length + 20));
      advertencias.push({
        tipo: 'palabra_potencialmente_ambigua',
        palabra: token,
        contexto: `…${contexto}…`,
        detalle: `"${token}" puede requerir acento según su función gramatical en esta oración específica. No se corrigió automáticamente -- requiere revisión humana.`,
      });
    }
  });

  return advertencias;
}
