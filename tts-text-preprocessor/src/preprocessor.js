// preprocessor.js
// Punto de entrada del TTS Text Preprocessor. Orquesta:
//   1. ortografia (correcciones seguras, auditables)
//   2. normalizacion mecánica de puntuación
//   3. deteccion de palabras ambiguas (solo advierte)
//   4. analisis estructural (solo advierte)
//   5. analisis de números/símbolos (aplica solo % -> "por ciento", resto advierte)
//   6. verificación de conservación de significado
//
// No genera audio, no envía nada, no se conecta todavía a Chatterbox ni a
// WhatsApp -- ver README.md para el alcance exacto de esta fase.

import { aplicarOrtografia } from './ortografia.js';
import { normalizarPuntuacion } from './normalizacion.js';
import { detectarPalabrasAmbiguas } from './deteccionAmbiguas.js';
import { analizarEstructura } from './analisisEstructural.js';
import { analizarNumeros } from './numeros.js';
import { verificarConservacionDeSignificado } from './verificacionSemantica.js';

/**
 * @param {string} textoOriginal
 * @returns {{
 *   textoOriginal: string,
 *   textoPreparado: string,
 *   cambios: Array<{tipo: string, original: string, corregido: string}>,
 *   advertencias: Array<{tipo: string, detalle: string, [key: string]: any}>,
 *   verificacion: { ok: boolean, detalles: string[] },
 *   requiereRevision: boolean,
 * }}
 */
export function prepararTextoParaTTS(textoOriginal) {
  if (typeof textoOriginal !== 'string' || textoOriginal.trim().length === 0) {
    throw new TypeError('prepararTextoParaTTS requiere un texto no vacío');
  }

  const cambios = [];
  const advertencias = [];

  const pasoOrtografia = aplicarOrtografia(textoOriginal);
  cambios.push(...pasoOrtografia.cambios);

  const pasoNormalizacion = normalizarPuntuacion(pasoOrtografia.texto);
  cambios.push(...pasoNormalizacion.cambios);

  const pasoNumeros = analizarNumeros(pasoNormalizacion.texto);
  cambios.push(...pasoNumeros.cambios);
  advertencias.push(...pasoNumeros.advertencias);

  const textoPreparado = pasoNumeros.texto;

  advertencias.push(...detectarPalabrasAmbiguas(textoPreparado));
  advertencias.push(...analizarEstructura(textoPreparado));

  const cambiosPalabraPorPalabra = cambios.filter((c) => c.tipo === 'ortografia' || c.tipo === 'concordancia').length;
  const verificacion = verificarConservacionDeSignificado(textoOriginal, textoPreparado, cambiosPalabraPorPalabra);

  return {
    textoOriginal,
    textoPreparado,
    cambios,
    advertencias,
    verificacion,
    requiereRevision: !verificacion.ok,
  };
}
