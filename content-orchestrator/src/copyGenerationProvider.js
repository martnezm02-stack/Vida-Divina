// copyGenerationProvider.js — Autonomous CREATE: componente SEPARADO de
// Creative Intelligence, responsable únicamente de transformar una
// dirección estratégica YA RESUELTA (persona/pain/angle/hookDirection/
// mechanismEntry/productFacts, de campaignMode.js + productionBrief.js
// reales) en copy utilizable (HOOK/SCRIPT/CTA) -- nunca decide la
// dirección estratégica, nunca inventa un hecho de producto que no venga
// de productFacts.
//
// Mismo patrón arquitectónico que marketing-intelligence/src/llm/
// (LLMProvider + HeuristicLLMProvider + AnthropicLLMProvider, Fase 5):
// una interfaz + una implementación determinista (sin red, sin LLM, usada
// por defecto y en tests) + un adapter real opcional a la API de
// Anthropic, deshabilitado por credencial ausente -- NUNCA se declara
// "generación autónoma real" si no se ejecutó un proveedor real.

import { assertNoForbiddenProductClaims } from '../../video-production/src/hyperframesRenderer.js';
import { assertBrandAvoidCompliance } from './brandVisualSystem.js';

const NOT_ESTABLISHED_MARKER = /NOT_ESTABLISHED/;

/** Un campo real de un ProductionBrief puede venir marcado explícitamente como no establecido (ver productionBrief.js, NOT_ESTABLISHED) -- nunca se muestra ese sentinel como si fuera copy real. */
function esCampoEstablecido(valor) {
  return typeof valor === 'string' && valor.trim().length > 0 && !NOT_ESTABLISHED_MARKER.test(valor);
}

export class CopyGenerationProvider {
  get name() {
    throw new Error('CopyGenerationProvider: la propiedad "name" debe implementarse en la subclase.');
  }

  get mode() {
    throw new Error('CopyGenerationProvider: la propiedad "mode" ("deterministic"|"real") debe implementarse en la subclase.');
  }

  // eslint-disable-next-line no-unused-vars
  async generate(strategicDirection) {
    throw new Error('CopyGenerationProvider.generate() debe implementarse en la subclase.');
  }
}

/**
 * Implementación determinista y segura para tests: arma HOOK/SCRIPT/CTA
 * ÚNICAMENTE a partir de campos reales ya resueltos (nunca redacta un hecho
 * nuevo) usando plantillas fijas. No es "generación creativa" -- es
 * ensamblaje literal de texto ya aprobado/existente (hookDirection real,
 * angle.scriptDirection real, productFacts.beneficios real, cta explícito
 * si se provee). Campos NOT_ESTABLISHED se omiten y se reportan en
 * missingFields, nunca se inventan.
 */
export class DeterministicCopyProvider extends CopyGenerationProvider {
  get name() {
    return 'deterministic_template';
  }

  get mode() {
    return 'deterministic';
  }

  async generate({ persona, pain, angle, hookDirection, mechanismEntry, productFacts, explicitCta = null, variantCount = 1 }) {
    const missingFields = [];

    const hook = esCampoEstablecido(hookDirection)
      ? hookDirection.replace(/^"|"$/g, '').split('—')[0].trim().replace(/^"|"$/g, '')
      : null;
    if (!hook) missingFields.push('hook');

    const scriptLineas = [];
    if (esCampoEstablecido(angle?.scriptDirection)) scriptLineas.push(angle.scriptDirection);
    else if (esCampoEstablecido(mechanismEntry)) scriptLineas.push(mechanismEntry);
    else missingFields.push('script');

    if (esCampoEstablecido(productFacts?.beneficios)) {
      scriptLineas.push(`En Vida Divina, ${productFacts.nombreVisible ?? productFacts.nombreComercial ?? 'este producto'}: ${productFacts.beneficios}`);
    } else {
      missingFields.push('productFacts.beneficios');
    }

    const cta = explicitCta?.trim()
      ? explicitCta.trim()
      : 'Escríbenos por WhatsApp y te contamos más.';
    if (!explicitCta) missingFields.push('cta (usando CTA genérico por defecto -- revisar antes de publicar)');

    const allText = [hook, ...scriptLineas, cta].filter(Boolean).join(' \n ');
    if (allText.trim()) {
      assertNoForbiddenProductClaims(allText, 'DeterministicCopyProvider: copy generado');
      assertBrandAvoidCompliance(allText, 'DeterministicCopyProvider: copy generado');
    }

    const base = Object.freeze({
      hook: hook ?? null,
      script: Object.freeze([...scriptLineas]),
      voiceoverText: scriptLineas.join(' '),
      cta,
    });

    const variants = [base];
    // Variantes adicionales: mismo contenido real, orden de énfasis distinto
    // (cambia qué línea del script va primero) -- nunca fabrica un hecho
    // nuevo por variante, solo reordena lo ya real.
    for (let i = 1; i < variantCount; i += 1) {
      const reordenado = [...scriptLineas].reverse();
      variants.push(Object.freeze({ hook: base.hook, script: Object.freeze(reordenado), voiceoverText: reordenado.join(' '), cta }));
    }

    return Object.freeze({
      provider: this.name,
      mode: this.mode,
      ...base,
      variants: Object.freeze(variants),
      missingFields: Object.freeze(missingFields),
    });
  }
}

/**
 * Adapter real opcional -- mismo patrón que
 * marketing-intelligence/src/llm/anthropicProvider.js: fetch nativo (cero
 * dependencias nuevas), credencial SOLO por variable de entorno
 * (ANTHROPIC_API_KEY), y si falta, lanza un error explícito ANTES de
 * intentar cualquier llamada de red -- nunca se inventa ni se pide una key
 * aquí, y nunca se declara "real" un resultado que no vino de una llamada
 * real a la API.
 */
export class AnthropicCopyProvider extends CopyGenerationProvider {
  constructor(overrides = {}) {
    super();
    this._apiKey = overrides.apiKey ?? process.env.ANTHROPIC_API_KEY ?? null;
    this._model = overrides.model ?? process.env.ANTHROPIC_COPY_MODEL ?? 'claude-sonnet-5';
    this._fetch = overrides.fetchImpl ?? fetch;
  }

  get name() {
    return 'anthropic_copy_provider';
  }

  get mode() {
    return 'real';
  }

  get isConfigured() {
    return Boolean(this._apiKey);
  }

  async generate({ persona, pain, angle, hookDirection, mechanismEntry, productFacts, explicitCta = null, variantCount = 1 }) {
    if (!this._apiKey) {
      throw new Error(
        'AnthropicCopyProvider: REQUIERE CREDENCIAL PARA EJECUCIÓN REAL -- falta ANTHROPIC_API_KEY (variable de entorno). ' +
        'No se ha intentado ninguna llamada de red desde este archivo. Use DeterministicCopyProvider si no hay credencial configurada.'
      );
    }

    const systemPrompt = [
      'Eres un redactor de Vida Divina. Escribes SOLO a partir de los hechos reales provistos.',
      'Nunca inventes beneficios, ingredientes ni claims médicos. Si un dato no está provisto, no lo menciones.',
      'Responde SOLO JSON: {"hook":"...","script":["línea1","línea2"],"cta":"..."}',
    ].join(' ');

    const userContent = JSON.stringify({
      persona: persona?.name ?? null,
      pain: pain?.painPoint ?? null,
      angle: angle?.angleText ?? null,
      scriptDirection: esCampoEstablecido(angle?.scriptDirection) ? angle.scriptDirection : null,
      hookDirection: esCampoEstablecido(hookDirection) ? hookDirection : null,
      mechanismEntry: esCampoEstablecido(mechanismEntry) ? mechanismEntry : null,
      productoNombre: productFacts?.nombreComercial ?? null,
      beneficiosReales: productFacts?.beneficios ?? null,
      ctaSugerido: explicitCta,
    });

    let response;
    try {
      response = await this._fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this._apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this._model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
    } catch (networkError) {
      throw new Error(`AnthropicCopyProvider: fallo de red al llamar a la API — ${networkError.message}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`AnthropicCopyProvider: la API respondió ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('AnthropicCopyProvider: la respuesta no contiene ningún bloque de texto.');

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      throw new Error('AnthropicCopyProvider: la respuesta no es JSON válido -- no se acepta como copy real.');
    }

    const hook = typeof parsed.hook === 'string' ? parsed.hook : null;
    const script = Array.isArray(parsed.script) ? parsed.script.filter((l) => typeof l === 'string') : [];
    const cta = typeof parsed.cta === 'string' ? parsed.cta : (explicitCta ?? 'Escríbenos por WhatsApp y te contamos más.');

    const allText = [hook, ...script, cta].filter(Boolean).join(' \n ');
    assertNoForbiddenProductClaims(allText, 'AnthropicCopyProvider: copy generado');
    assertBrandAvoidCompliance(allText, 'AnthropicCopyProvider: copy generado');

    const base = Object.freeze({ hook, script: Object.freeze(script), voiceoverText: script.join(' '), cta });
    return Object.freeze({
      provider: this.name,
      mode: this.mode,
      ...base,
      variants: Object.freeze([base]),
      missingFields: Object.freeze([]),
    });
  }
}
