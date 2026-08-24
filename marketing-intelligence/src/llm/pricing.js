// pricing.js — Tabla de precios de referencia (USD por millón de tokens),
// según la documentación de la API de Anthropic vigente al momento de
// implementar esta fase. Solo se usa para ESTIMAR costo antes/después de una
// llamada real — nunca para cobrar de verdad, y nunca contiene secretos.
//
// LIMITACIÓN DOCUMENTADA: precios promocionales/temporales (ej. tarifas de
// introducción con vigencia limitada) no se reflejan aquí — este archivo
// debe revisarse si Anthropic cambia su tabla de precios pública.

export const MODEL_PRICING = Object.freeze({
  'claude-opus-5': { input: 5.0, output: 25.0 },
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
});

const FALLBACK_PRICING = MODEL_PRICING['claude-opus-5'];

export function pricingFor(model) {
  return MODEL_PRICING[model] ?? FALLBACK_PRICING;
}

/** Estimación conservadora (peor caso) antes de la llamada: asume un input típico de contenido de marketing (~2000 tokens) + el máximo de salida configurado. */
export function estimateWorstCaseCostUsd(model, maxOutputTokens, assumedInputTokens = 2000) {
  const pricing = pricingFor(model);
  const inputCost = (assumedInputTokens / 1_000_000) * pricing.input;
  const outputCost = (maxOutputTokens / 1_000_000) * pricing.output;
  return Number((inputCost + outputCost).toFixed(6));
}

/** Costo real estimado después de la llamada, a partir del uso reportado por la API. */
export function estimateActualCostUsd(model, usage) {
  if (!usage) return null;
  const pricing = pricingFor(model);
  const inputCost = ((usage.input_tokens ?? 0) / 1_000_000) * pricing.input;
  const outputCost = ((usage.output_tokens ?? 0) / 1_000_000) * pricing.output;
  return Number((inputCost + outputCost).toFixed(6));
}
