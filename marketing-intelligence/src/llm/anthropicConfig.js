// anthropicConfig.js — Configuración de AnthropicLLMProvider, SIEMPRE por
// variables de entorno. Nunca se fija un modelo arbitrariamente dentro del
// agente ni del proveedor: todo lo que aparece aquí es sobreescribible sin
// tocar código.
//
// Variables de entorno reconocidas (ninguna tiene un valor real en este
// repositorio — deben configurarse fuera del código, nunca en Git):
//   ANTHROPIC_API_KEY        → credencial real. Si falta, el proveedor lanza
//                               "REQUIERE CREDENCIAL PARA EJECUCIÓN REAL" y
//                               no intenta ninguna llamada de red.
//   ANTHROPIC_MODEL           → id de modelo exacto (ver shared/models.md del
//                               skill claude-api). Default: "claude-opus-5"
//                               (modelo por defecto recomendado — para un
//                               caso de uso de clasificación/extracción en
//                               volumen, "claude-haiku-4-5" suele ser más
//                               apropiado en costo; es una decisión de negocio,
//                               no algo que este código decida por su cuenta).
//   ANTHROPIC_EFFORT          → low | medium | high | xhigh | max. Default: "low"
//                               (tarea de clasificación/extracción, no de
//                               razonamiento profundo).
//   ANTHROPIC_MAX_TOKENS      → tope de salida por llamada. Default: 2048.

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_EFFORT = 'low';
const DEFAULT_MAX_TOKENS = 2048;
export const PROMPT_VERSION = 'marketing-intelligence-observation-v1';

export function resolveAnthropicConfig(overrides = {}) {
  return {
    apiKey: overrides.apiKey ?? process.env.ANTHROPIC_API_KEY ?? null,
    model: overrides.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    effort: overrides.effort ?? process.env.ANTHROPIC_EFFORT ?? DEFAULT_EFFORT,
    maxTokens: overrides.maxTokens ?? Number(process.env.ANTHROPIC_MAX_TOKENS ?? DEFAULT_MAX_TOKENS),
    promptVersion: overrides.promptVersion ?? PROMPT_VERSION,
  };
}
