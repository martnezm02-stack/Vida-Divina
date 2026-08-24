// untrustedContent.js — Todo contenido adquirido de Internet es UNTRUSTED
// EXTERNAL DATA. Este módulo únicamente ETIQUETA el contenido; nunca lo
// ejecuta, nunca lo interpreta como instrucción y nunca decide una acción a
// partir de él. Esa garantía depende de que ningún otro módulo del sistema
// use estas etiquetas para disparar comportamiento — solo para que un humano
// o el Marketing Intelligence Agent lo revise con cautela adicional.

const INJECTION_PATTERNS = [
  /ignore (all|any|previous|prior) instructions/i,
  /disregard (the )?(above|previous)/i,
  /reveal (your|the) system prompt/i,
  /you are now/i,
  /new instructions\s*:/i,
  /act as (if|though)/i,
];

export function detectInjectionFlags(text) {
  if (!text) return [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return ['possible_prompt_injection'];
  }
  return [];
}

/**
 * Envuelve texto crudo adquirido de una fuente externa. Devuelve el mismo
 * contenido (sin modificar ni censurar) junto con banderas informativas.
 */
export function wrapExternalContent(text) {
  return {
    content: text ?? '',
    content_flags: detectInjectionFlags(text),
  };
}
