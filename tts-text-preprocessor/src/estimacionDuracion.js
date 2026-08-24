// estimacionDuracion.js
// Estimación (aproximada, no exacta) de la duración de audio que produciría
// un texto, para detectar ANTES de generar si probablemente excede el tope
// duro del motor.
//
// Base empírica: en este proyecto, con la configuración de voz aprobada
// (es-MX-LatAm regional, exaggeration=0.35, cfg_weight=0.5, temperature=0.8),
// las generaciones reales han producido consistentemente entre ~0.24 y
// ~0.31 segundos de audio por palabra del texto de entrada. Se usa 0.29
// s/palabra (punto medio observado) como estimador.
//
// Límite duro real del motor (confirmado en código instalado,
// chatterbox/mtl_tts.py: generate(..., max_new_tokens=1000)): T3 genera
// como máximo 1000 tokens de habla por llamada, a razón fija de 25
// tokens/segundo (S3_TOKEN_RATE) -> 1000/25 = 40 segundos de audio como
// tope absoluto por llamada continua.

export const SEGUNDOS_POR_PALABRA_ESTIMADO = 0.29;
export const LIMITE_DURO_SEGUNDOS = 40; // 1000 tokens / 25 tokens-por-segundo
export const MARGEN_SEGURIDAD_SEGUNDOS = 38; // umbral de alerta, con margen bajo el límite duro

export function estimarDuracionSegundos(texto) {
  const palabras = texto.split(/\s+/).filter(Boolean).length;
  const segundosEstimados = +(palabras * SEGUNDOS_POR_PALABRA_ESTIMADO).toFixed(2);
  return { palabras, segundosEstimados };
}

/**
 * @param {string} texto
 * @returns {{ excede: boolean, palabras: number, segundosEstimados: number, limiteDuroSegundos: number, margenSeguridadSegundos: number }}
 */
export function excedeLimiteTTS(texto) {
  const { palabras, segundosEstimados } = estimarDuracionSegundos(texto);
  return {
    excede: segundosEstimados >= MARGEN_SEGURIDAD_SEGUNDOS,
    palabras,
    segundosEstimados,
    limiteDuroSegundos: LIMITE_DURO_SEGUNDOS,
    margenSeguridadSegundos: MARGEN_SEGURIDAD_SEGUNDOS,
  };
}
