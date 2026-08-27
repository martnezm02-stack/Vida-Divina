// openAIImageProvider.js — adapter real hacia la API de imágenes de OpenAI
// (gpt-image-1, https://platform.openai.com/docs/guides/image-generation),
// MISMO patrón que video-generation/src/providers/miniMaxVideoProvider.js:
// isConfigured() gatea por credencial real (OPENAI_API_KEY), generate()
// solo se invoca cuando ya hay token real, y un fallo real de la API nunca
// se convierte en un éxito simulado.
//
// ESTADO REAL: sin OPENAI_API_KEY en este entorno -- isConfigured() es
// false, generateImage() (imageProvider.js) nunca siquiera llama a
// generate() de este archivo (ver Provider Router, providerRouter.js). Este
// adapter existe para que, el día que exista la credencial, conectar OpenAI
// sea cambiar una variable de entorno, nunca tocar Provider
// Router/Creative Director/Asset Resolver ni ningún llamador.
//
// Candidato elegido (Paso 11 del encargo Creative Director): entre
// OpenAI/Krea/local, OpenAI es el único con un contrato HTTP público y
// estable documentado sin necesitar infraestructura local adicional (Krea
// no publica una API REST simple; un modelo de difusión local -- ej.
// Stable Diffusion on-device -- requeriría GPU/dependencias nuevas fuera de
// alcance de esta fase). "gpt-image-1" con quality:"low" es la opción real
// más económica del catálogo de OpenAI para este caso de uso (Paso 34:
// "economic provider" antes que "premium").

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImageGenerationResult } from '../imageGenerationResult.js';

const API_BASE_URL = process.env.OPENAI_API_BASE_URL ?? 'https://api.openai.com/v1';
const GENERATE_ENDPOINT = '/images/generations';

// Mismo patrón que MockImageProvider (DATA_ROOT/MOCK_OUTPUT_DIR) -- salida
// real aislada, sobreescribible en test vía la misma variable de entorno.
export const DATA_ROOT = process.env.IMAGE_GENERATION_DATA_ROOT
  ? join(process.env.IMAGE_GENERATION_DATA_ROOT)
  : fileURLToPath(new URL('../../data', import.meta.url));
export const OPENAI_OUTPUT_DIR = join(DATA_ROOT, 'openai-output');

// Mapeo real aspectRatio -> tamaño soportado por gpt-image-1 (solo tres
// tamaños reales existen; "auto" queda deliberadamente fuera para que el
// resultado real sea determinista respecto al aspectRatio pedido).
const SIZE_BY_ASPECT_RATIO = Object.freeze({
  '9:16': '1024x1536',
  '4:5': '1024x1536',
  '1:1': '1024x1024',
  '16:9': '1536x1024',
});
const DEFAULT_SIZE = '1024x1024';

// Pricing público documentado por OpenAI para gpt-image-1 (quality:"low",
// consultado 2026-08-27) -- estimatedCost real declarado como tal (nunca se
// reporta como actualCost, ver imageGenerationResult.js). Si la respuesta
// real trae "usage" (tokens reales), actualCost se recalcula desde ahí --
// nunca se inventa un costo real sin ese dato.
const ESTIMATED_COST_LOW_QUALITY_USD = 0.02;
// $/1M tokens (input de texto + output de imagen), pricing público gpt-image-1.
const INPUT_TOKEN_PRICE_PER_MILLION_USD = 5;
const OUTPUT_TOKEN_PRICE_PER_MILLION_USD = 40;

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function sizeForAspectRatio(aspectRatio) {
  return SIZE_BY_ASPECT_RATIO[aspectRatio] ?? DEFAULT_SIZE;
}

/** Costo real desde "usage" real de la respuesta -- null si la API no lo trajo (nunca se inventa). */
function computeActualCostFromUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  const cost = (inputTokens / 1_000_000) * INPUT_TOKEN_PRICE_PER_MILLION_USD
    + (outputTokens / 1_000_000) * OUTPUT_TOKEN_PRICE_PER_MILLION_USD;
  return Number(cost.toFixed(6));
}

export class OpenAIImageProvider {
  providerName = 'openai';
  model = 'gpt-image-1';
  capabilities = Object.freeze({
    textToImage: true, imageToImage: false, referenceImagePreservation: false, negativePrompt: false, aspectRatioControl: true,
  });

  /** Nunca asume una credencial -- sin OPENAI_API_KEY, generate() nunca se llama (ver imageProvider.js#generateImage). */
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  /**
   * Llamada real -- generateImage() (imageProvider.js) SOLO invoca esto
   * cuando isConfigured() ya fue true. gpt-image-1 no soporta
   * "negative_prompt" como parámetro real de la API (a diferencia de
   * otros proveedores) -- se documenta la limitación real en vez de
   * fingir que se envió, y se incorpora como instrucción negativa dentro
   * del prompt real, que sí es un mecanismo soportado.
   */
  async generate(request) {
    const token = process.env.OPENAI_API_KEY;
    const size = sizeForAspectRatio(request.aspectRatio);
    const promptReal = request.negativePrompt?.trim()
      ? `${request.generationPrompt}\n\nEvitar estrictamente: ${request.negativePrompt}.`
      : request.generationPrompt;

    const res = await fetch(`${API_BASE_URL}${GENERATE_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: this.model, prompt: promptReal, size, quality: 'low', n: 1,
      }),
    });

    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      return createImageGenerationResult({
        status: 'PROVIDER_ERROR', requestId: request.requestId, visualProductionPackageId: request.visualProductionPackageId,
        providerName: this.providerName, model: this.model, isMock: false, generationFingerprint: request.generationFingerprint,
        error: `OpenAIImageProvider: la API respondió ${res.status} al generar la imagen real: ${detalle}`,
      });
    }

    const body = await res.json();
    const b64 = body?.data?.[0]?.b64_json;
    if (!b64) {
      return createImageGenerationResult({
        status: 'PROVIDER_ERROR', requestId: request.requestId, visualProductionPackageId: request.visualProductionPackageId,
        providerName: this.providerName, model: this.model, isMock: false, generationFingerprint: request.generationFingerprint,
        error: `OpenAIImageProvider: la API no devolvió "data[0].b64_json" real -- respuesta: ${JSON.stringify(body).slice(0, 500)}`,
      });
    }

    ensureDir(OPENAI_OUTPUT_DIR);
    const buffer = Buffer.from(b64, 'base64');
    const assetId = createHash('sha256').update(buffer).digest('hex');
    const outputPath = join(OPENAI_OUTPUT_DIR, `openai-${assetId}.png`);
    writeFileSync(outputPath, buffer);

    const actualCost = computeActualCostFromUsage(body.usage);

    return createImageGenerationResult({
      status: 'SUCCESS', requestId: request.requestId, visualProductionPackageId: request.visualProductionPackageId,
      providerName: this.providerName, model: this.model, isMock: false, generationFingerprint: request.generationFingerprint,
      asset: {
        assetId, sourcePath: outputPath, type: 'GENERATED_IMAGE', format: 'png', aspectRatio: request.aspectRatio,
      },
      estimatedCost: ESTIMATED_COST_LOW_QUALITY_USD,
      // actualCost real SOLO cuando la API real trajo "usage" (tokens
      // reales) -- si no, se reporta 0 (nunca la estimación disfrazada de
      // costo real, regla no negociable, Paso 25 del encargo Creative
      // Director: "no reportar costo real si solo existe una estimación").
      actualCost: actualCost ?? 0,
      currency: 'USD',
    });
  }
}
