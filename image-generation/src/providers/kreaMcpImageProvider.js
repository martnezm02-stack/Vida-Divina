// kreaMcpImageProvider.js — Integración Productiva Krea MCP Directo
// (2026-08-27). ImageProvider real que llama a Krea MCP DIRECTAMENTE desde
// el proceso Node de Vida Divina, vía kreaMcpClient.js (Streamable HTTP +
// OAuth real persistido) -- SIN Claude CLI, SIN Claude API, SIN
// KREA_REST/KREA_API_TOKEN. Reemplaza el puente anterior (`claude -p`,
// retirado real -- ver git history) tras validar real en
// experiments/krea-mcp-node-poc/ que Node puede ser cliente MCP directo
// real de Krea (CLAUDE INVOLVED: NO, costo real de Claude: 0).
//
// MODELO SUGERIDO + SELECCIÓN MANUAL (imageModelCatalog.js): esta MISMA
// clase real presta los 4 modelos reales de Krea (krea-2-turbo/medium/
// large/runway-gen4) -- todos bajo la MISMA cuenta/sesión OAuth real, solo
// cambia el modelo real pedido a la tool MCP y la forma real del input.
//
// PRODUCT GROUNDING (Paso 9/10 del encargo): solo runway-gen4 declara
// referenceImagePreservation real (reference_images real, verificado real:
// preservó forma/colores/logo/nombre "RIPPED" de un producto real). Sin
// una URL real ya alojada (request.productReferenceImageUrl), NUNCA se
// inventa/omite la referencia -- INVALID_REQUEST honesto
// (PRODUCT_REFERENCE_NOT_SUPPORTED, ver assetResolver.js/creativeDirector.js).

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImageGenerationResult } from '../imageGenerationResult.js';
import { callKreaMcpTool, isKreaMcpConfigured, KreaMcpUnavailableError } from './kreaMcpClient.js';

export const DATA_ROOT = process.env.IMAGE_GENERATION_DATA_ROOT
  ? join(process.env.IMAGE_GENERATION_DATA_ROOT)
  : fileURLToPath(new URL('../../data', import.meta.url));
export const KREA_MCP_OUTPUT_DIR = join(DATA_ROOT, 'krea-mcp-output');

// Modelos reales descubiertos vía Krea MCP#list_models/get_model_schema
// (2026-08-27, llamados en vivo, nunca adivinados de memoria) -- misma
// familia real "krea/krea-2/*" + "runway/gen-4-image" ya validada real
// (E2E completo, Fitness/Gym sin producto + Cápsulas Ripped con referencia
// real). aspectRatios reales confirmados por get_model_schema real
// (krea-2/large, krea-2/medium-turbo: idéntico); krea-2/medium se asume
// real de la MISMA familia (mismo endpoint pattern real ya confirmado dos
// veces), nunca copiado del catálogo completo real de Krea.
export const KREA_MCP_MODEL_ENDPOINTS = Object.freeze({
  'krea-2-turbo': Object.freeze({
    mcpModel: 'krea/krea-2/medium-turbo', shape: 'krea2',
    aspectRatios: Object.freeze(['1:1', '4:3', '3:2', '16:9', '2.35:1', '4:5', '2:3', '9:16']),
  }),
  'krea-2-medium': Object.freeze({
    mcpModel: 'krea/krea-2/medium', shape: 'krea2',
    aspectRatios: Object.freeze(['1:1', '4:3', '3:2', '16:9', '2.35:1', '4:5', '2:3', '9:16']),
  }),
  'krea-2-large': Object.freeze({
    mcpModel: 'krea/krea-2/large', shape: 'krea2',
    aspectRatios: Object.freeze(['1:1', '4:3', '3:2', '16:9', '2.35:1', '4:5', '2:3', '9:16']),
  }),
  'runway-gen4': Object.freeze({
    mcpModel: 'runway/gen-4-image', shape: 'runway',
    aspectRatios: Object.freeze(['9:16', '4:5', '1:1', '16:9']),
  }),
});
export const KREA_MCP_MODEL_IDS = Object.freeze(Object.keys(KREA_MCP_MODEL_ENDPOINTS));
export const DEFAULT_KREA_MCP_MODEL_ID = 'krea-2-large';

const RUNWAY_DIMENSIONS_BY_ASPECT_RATIO = Object.freeze({
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
});
const DEFAULT_RUNWAY_DIMENSIONS = RUNWAY_DIMENSIONS_BY_ASPECT_RATIO['1:1'];

// Generación real de imagen síncrona real vía la tool MCP suele tardar
// entre 10-60s reales -- 170s deja margen real (mismo valor real ya usado
// en el POC) antes del timeout real del lado de Krea (timeoutSeconds del
// esquema real de la tool).
const TOOL_TIMEOUT_SECONDS = 170;

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function extensionFromContentType(contentType) {
  if (!contentType) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  return 'png';
}

/** Extrae el objeto JSON real de texto del resultado real de la tool MCP (CallToolResult.content[]). */
function extractJobFromToolResult(result) {
  const texto = result?.content?.find((c) => c.type === 'text')?.text;
  if (!texto) throw new Error('KreaMcpImageProvider: la tool real no devolvió contenido de texto real.');
  return JSON.parse(texto);
}

export class KreaMcpImageProvider {
  providerName = 'krea-mcp';

  /** @param {string} [modelId] — uno de KREA_MCP_MODEL_IDS (ver imageModelCatalog.js). */
  constructor(modelId = DEFAULT_KREA_MCP_MODEL_ID) {
    if (!KREA_MCP_MODEL_ENDPOINTS[modelId]) {
      throw new Error(`KreaMcpImageProvider: "modelId" inválido "${modelId}" (válidos: ${KREA_MCP_MODEL_IDS.join(', ')}).`);
    }
    this.model = modelId;
    this._endpoint = KREA_MCP_MODEL_ENDPOINTS[modelId];
    this.capabilities = Object.freeze({
      textToImage: this._endpoint.shape === 'krea2',
      imageToImage: false,
      // Ver nota de cabecera: solo runway-gen4 tiene referenceImagePreservation real (reference_images real, verificado real).
      referenceImagePreservation: this._endpoint.shape === 'runway',
      negativePrompt: false, // ninguno de los 4 modelos reales de Krea documenta un campo real "negative_prompt".
      aspectRatioControl: true,
    });
  }

  /** Real y rápido -- delega en kreaMcpClient.js (tokens reales ya persistidos, ver scripts/authorize-krea-mcp.mjs), NUNCA dispara auth interactiva. */
  isConfigured() {
    return isKreaMcpConfigured();
  }

  _errorResult(request, error, status = 'PROVIDER_ERROR') {
    return createImageGenerationResult({
      status, requestId: request.requestId, visualProductionPackageId: request.visualProductionPackageId,
      providerName: this.providerName, model: this.model, isMock: false, generationFingerprint: request.generationFingerprint, error,
    });
  }

  _buildMcpInput(request) {
    const aspectRatio = this._endpoint.aspectRatios.includes(request.aspectRatio) ? request.aspectRatio : this._endpoint.aspectRatios[0];
    if (this._endpoint.shape === 'krea2') {
      return { input: { prompt: request.generationPrompt, aspect_ratio: aspectRatio, resolution: '1K' }, aspectRatio };
    }
    // shape "runway": reference_images es REAL y OBLIGATORIO para este
    // modelo (get_model_schema real, Krea MCP) -- sin una URL pública real
    // ya provista por el llamador, nunca se inventa/omite (Paso 9 del
    // encargo: registrar PRODUCT_REFERENCE_NOT_SUPPORTED en su lugar).
    if (!request.productReferenceImageUrl?.trim()) {
      return { invalid: 'PRODUCT_REFERENCE_NOT_SUPPORTED: KreaMcpImageProvider (runway-gen4) requiere "productReferenceImageUrl" real (una URL pública ya alojada de la fotografía real del producto) -- reference_images es obligatorio para este modelo real, nunca se omite ni se inventa.' };
    }
    const dims = RUNWAY_DIMENSIONS_BY_ASPECT_RATIO[aspectRatio] ?? DEFAULT_RUNWAY_DIMENSIONS;
    return {
      input: {
        prompt: request.generationPrompt,
        reference_images: [{ url: request.productReferenceImageUrl, tag: 'product' }],
        width: dims.width,
        height: dims.height,
      },
      aspectRatio,
    };
  }

  /**
   * Llamada real -- generateImage() (imageProvider.js) SOLO invoca esto
   * cuando isConfigured() ya fue true. Invoca la tool MCP real
   * "generate_image" DIRECTO (kreaMcpClient.js), sin Claude -- un fallo
   * real (KREA_MCP_UNAVAILABLE, timeout real, job real failed/cancelled)
   * se reporta como PROVIDER_ERROR real, nunca como éxito simulado.
   */
  async generate(request) {
    const built = this._buildMcpInput(request);
    if (built.invalid) {
      return this._errorResult(request, built.invalid, 'INVALID_REQUEST');
    }
    const { input, aspectRatio } = built;

    let result;
    try {
      result = await callKreaMcpTool('generate_image', {
        model: this._endpoint.mcpModel, input, sync: true, timeoutSeconds: TOOL_TIMEOUT_SECONDS,
      });
    } catch (err) {
      if (err instanceof KreaMcpUnavailableError) return this._errorResult(request, err.message);
      return this._errorResult(request, `KreaMcpImageProvider: fallo real al invocar la tool MCP real (${err.message}).`);
    }

    let job;
    try {
      job = extractJobFromToolResult(result);
    } catch (err) {
      return this._errorResult(request, `KreaMcpImageProvider: respuesta real de la tool MCP no interpretable (${err.message}).`);
    }

    const status = job.job?.status ?? job.status;
    if (status !== 'completed') {
      return this._errorResult(request, `KreaMcpImageProvider: el job real de Krea no completó (status real "${status}") -- detalle real: ${JSON.stringify(job).slice(0, 500)}`);
    }
    const imageUrl = (job.job?.result?.urls ?? job.result?.urls)?.[0];
    if (!imageUrl) {
      return this._errorResult(request, `KreaMcpImageProvider: el job real completó pero no trajo "result.urls" real -- respuesta real: ${JSON.stringify(job).slice(0, 500)}`);
    }

    let downloadRes;
    try {
      downloadRes = await fetch(imageUrl);
    } catch (err) {
      return this._errorResult(request, `KreaMcpImageProvider: fallo real al descargar la imagen real generada (${err.message}).`);
    }
    if (!downloadRes.ok) {
      return this._errorResult(request, `KreaMcpImageProvider: la descarga real de la imagen respondió ${downloadRes.status}.`);
    }
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    const assetId = createHash('sha256').update(buffer).digest('hex');
    const ext = extensionFromContentType(downloadRes.headers.get('content-type'));
    ensureDir(KREA_MCP_OUTPUT_DIR);
    const outputPath = join(KREA_MCP_OUTPUT_DIR, `krea-mcp-${assetId}.${ext}`);
    writeFileSync(outputPath, buffer);

    return createImageGenerationResult({
      status: 'SUCCESS', requestId: request.requestId, visualProductionPackageId: request.visualProductionPackageId,
      providerName: this.providerName, model: this.model, isMock: false, generationFingerprint: request.generationFingerprint,
      asset: {
        assetId, sourcePath: outputPath, type: 'GENERATED_IMAGE', format: ext, aspectRatio,
      },
      // Krea real: su job response NUNCA trae precio/créditos por llamada
      // real (verificado real, get_model_schema real de los 4 modelos) --
      // nunca se inventa un número real. Costo real de Claude: 0 (Claude
      // NUNCA participa en esta llamada real, Paso 11/14 del encargo).
      estimatedCost: 0,
      actualCost: 0,
      currency: 'USD',
      costStatus: 'UNKNOWN',
    });
  }
}
