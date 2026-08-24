// anthropicProvider.js — Implementación REAL de LLMProvider contra la API de
// Anthropic (Fase 5).
//
// DECISIÓN DE DISEÑO — HTTP nativo en vez del SDK oficial: el skill de
// referencia de la API de Claude recomienda el SDK oficial (@anthropic-ai/sdk)
// como opción por defecto. Este proyecto mantiene deliberadamente cero
// dependencias externas (ver Fases 2-4) y esta fase no autorizó instalar
// ningún paquete nuevo — por eso se implementa con `fetch` nativo de Node
// contra POST /v1/messages, siguiendo el formato de la API documentado.
// Si en el futuro se autoriza instalar @anthropic-ai/sdk, solo este archivo
// cambiaría — el contrato de LLMProvider no se altera.
//
// Credenciales: SOLO variable de entorno (ver anthropicConfig.js). Si falta
// ANTHROPIC_API_KEY, se lanza un error explícito y NO se intenta ninguna
// llamada de red — nunca se inventa ni se pide una key aquí.
//
// Seguridad: el contenido externo se transmite en un bloque propio, separado
// del system prompt (ver src/llm/promptIsolation.js) — nunca se concatena con
// las instrucciones del sistema.

import { LLMProvider } from './llmProvider.js';
import { resolveAnthropicConfig } from './anthropicConfig.js';
import { estimateWorstCaseCostUsd, estimateActualCostUsd } from './pricing.js';
import { redactSecrets } from './redact.js';
import { buildIsolatedPrompt } from './promptIsolation.js';
import { SYSTEM_PROMPT, USER_INSTRUCTION_SUFFIX, OUTPUT_SCHEMA } from './anthropicPrompts.js';
import { isValidDimension } from '../taxonomy.js';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

export class AnthropicLLMProvider extends LLMProvider {
  constructor(overrides = {}) {
    super();
    const config = resolveAnthropicConfig(overrides);
    this._apiKey = config.apiKey;
    this._model = config.model;
    this._effort = config.effort;
    this._maxTokens = config.maxTokens;
    this._promptVersion = config.promptVersion;
    this._fetch = overrides.fetchImpl ?? fetch;
    this._lastUsage = null;
  }

  get name() {
    return 'anthropic';
  }

  get model() {
    return this._model;
  }

  get promptVersion() {
    return this._promptVersion;
  }

  get lastUsage() {
    return this._lastUsage;
  }

  /** Estimación conservadora (peor caso) usada por CostGuard ANTES de llamar — nunca la real. */
  get costPerDocumentUsd() {
    return estimateWorstCaseCostUsd(this._model, this._maxTokens);
  }

  async analyze(content, _context) {
    if (!this._apiKey) {
      throw new Error(
        'REQUIERE CREDENCIAL PARA EJECUCIÓN REAL: falta ANTHROPIC_API_KEY (variable de entorno). ' +
        'No se ha intentado ninguna llamada de red desde este archivo.'
      );
    }

    const isolated = buildIsolatedPrompt(SYSTEM_PROMPT, content);
    const requestBody = {
      model: this._model,
      max_tokens: this._maxTokens,
      thinking: { type: 'disabled' },
      output_config: {
        effort: this._effort,
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      system: isolated.system,
      messages: [
        { role: 'user', content: `${isolated.external_content_block}\n${isolated.rule}${USER_INSTRUCTION_SUFFIX}` },
      ],
    };

    let response;
    try {
      response = await this._fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this._apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (networkError) {
      throw new Error(`AnthropicLLMProvider: fallo de red al llamar a la API — ${redactSecrets(networkError.message)}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`AnthropicLLMProvider: la API respondió ${response.status}: ${redactSecrets(errorBody)}`);
    }

    const data = await response.json();

    this._lastUsage = data.usage
      ? {
          provider: this.name,
          model: this._model,
          prompt_version: this._promptVersion,
          input_tokens: data.usage.input_tokens ?? null,
          output_tokens: data.usage.output_tokens ?? null,
          estimated_cost_usd: estimateActualCostUsd(this._model, data.usage),
          analysis_timestamp: new Date().toISOString(),
        }
      : null;

    // Un refusal (stop_reason: "refusal") nunca se trata como resultado válido —
    // se detiene sin inventar observaciones, tal como exige el diseño.
    if (data.stop_reason === 'refusal') {
      return [];
    }

    const textBlock = (data.content || []).find((block) => block.type === 'text');
    if (!textBlock) return [];

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return [];
    }

    const observations = Array.isArray(parsed.observations) ? parsed.observations : [];

    return observations
      .filter((o) => typeof o.dimension === 'string' && isValidDimension(o.dimension))
      // Nunca se confía en la cita del modelo sin verificarla: debe ser un
      // fragmento literal presente en el contenido original — si no lo es,
      // se descarta como posible invención, no se "corrige".
      .filter((o) => typeof o.evidence_quote === 'string' && o.evidence_quote.length > 0 && content.includes(o.evidence_quote))
      .map((o) => ({
        dimension: o.dimension,
        value: typeof o.value === 'string' ? o.value : 'not_detected',
        evidence_quote: o.evidence_quote,
        confidence: typeof o.confidence === 'number' ? Math.min(1, Math.max(0, o.confidence)) : 0.5,
        confidence_basis:
          typeof o.confidence_basis === 'string' && o.confidence_basis.length > 0
            ? o.confidence_basis
            : 'Evaluación del modelo LLM, sin base estadística verificable.',
      }));
  }
}
