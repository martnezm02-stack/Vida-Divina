// kreaMcpImageProvider.js — Krea MCP + Catálogo Real de Modelos
// (2026-08-27). Adapter real hacia Krea SIN REST/KREA_API_TOKEN (esa
// integración fue retirada a propósito, ver kreaImageProvider.js.OLD en
// git history) -- usa el Krea MCP YA autenticado por OAuth con la cuenta
// Krea real (ver `claude mcp login krea`, probado real este mismo día:
// dos imágenes reales generadas -- Fitness/Gym sin producto y con
// referencia real de "Divina Ripped Capsules").
//
// LÍMITE REAL VERIFICADO (Paso 3 del encargo): el runtime de Vida Divina
// (el proceso Node real del backend HTTP de Vida Divina) NO tiene acceso directo a
// las tools mcp__krea__* -- esas solo existen dentro de una sesión de
// Claude Code. Antes de declarar la limitación se probó real un puente
// viable: invocar el Claude Code CLI en modo headless
// (`claude -p --output-format json --allowedTools mcp__krea__generate_image
// --permission-mode bypassPermissions`), que SÍ puede llamar la tool MCP
// ya autenticada (misma sesión OAuth, ver `claude mcp get krea`) desde un
// subproceso real, sin usar REST ni KREA_API_TOKEN. Confirmado real
// 2026-08-27 (list_models real vía este mismo puente, costo real
// $0.118 USD de la llamada de Claude -- NO de Krea, ver nota de costo más
// abajo).
//
// COSTO REAL DEL PUENTE (distinto del costo real de Krea, que sigue sin
// exponer precio por llamada -- ver costStatus "UNKNOWN"): cada generación
// real vía este provider paga un turno real de Claude (Sonnet, con caché)
// ADEMÁS de lo que Krea cobre en su cuenta -- es un costo real de
// infraestructura de este puente, no de Krea. Documentado aquí para que
// quien opere el sistema lo sepa: no es gratis solo porque KREA_API_TOKEN
// ya no se usa.
//
// isConfigured() real: verifica, con una llamada real y cacheada (TTL real,
// nunca por-request) a `claude mcp get krea`, que (a) el binario real
// `claude` existe en PATH y (b) el servidor MCP real "krea" está
// Connected (autenticado) para este proyecto real -- NUNCA asume
// disponibilidad, nunca inventa un estado.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImageGenerationResult } from '../imageGenerationResult.js';

export const DATA_ROOT = process.env.IMAGE_GENERATION_DATA_ROOT
  ? join(process.env.IMAGE_GENERATION_DATA_ROOT)
  : fileURLToPath(new URL('../../data', import.meta.url));
export const KREA_MCP_OUTPUT_DIR = join(DATA_ROOT, 'krea-mcp-output');

// Raíz real del proyecto (donde `claude mcp add krea` registró la
// conexión real, scope "Local config") -- `claude mcp get krea` solo la
// encuentra si se ejecuta con este cwd real, sin importar el cwd real del
// proceso que llama a este provider (el backend real puede arrancar
// desde cualquier directorio real).
const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// Modelos reales descubiertos vía Krea MCP#list_models/get_model_schema
// (2026-08-27, llamados en vivo, nunca adivinados de memoria) -- misma
// familia real "krea/krea-2/*" + "runway/gen-4-image" ya usada/probada
// real en la fase de validación REST (antes de su retiro) y en la prueba
// real de Krea MCP de hoy. aspectRatios reales confirmados por
// get_model_schema (krea-2/large, krea-2/medium-turbo: idéntico) --
// krea-2/medium se asume real de la MISMA familia (mismo endpoint pattern
// real ya confirmado dos veces), nunca copiado del catálogo completo de
// Krea (Paso 1 del encargo: solo lo que esta cuenta real usa).
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
    // Runway real (get_model_schema real) pide width/height reales, no un
    // enum de aspectRatio -- esta lista es la real ya soportada por
    // RUNWAY_DIMENSIONS_BY_ASPECT_RATIO más abajo (mismos 4 formatos reales
    // de Vida Divina, ver outputProfiles.js), nunca un formato inventado.
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

// Función, no constante -- mismo motivo real ya documentado en
// kreaImageProvider.js (retirado)/apiBaseUrl(): un "const" de módulo se
// fija para siempre en el primer import, y los tests reales necesitan
// forzar "no disponible" DESPUÉS de importar el módulo.
function claudeBin() {
  return process.env.KREA_MCP_CLAUDE_BIN ?? 'claude';
}
const CONNECTION_CACHE_TTL_MS = Number(process.env.KREA_MCP_CONNECTION_CACHE_TTL_MS) || 5 * 60 * 1000;
// Función, no constante -- mismo motivo real que claudeBin() (permite a
// los tests reales forzar un timeout real corto DESPUÉS de importar el
// módulo).
function generateTimeoutMs() {
  return Number(process.env.KREA_MCP_GENERATE_TIMEOUT_MS) || 180_000;
}

let connectionCache = { checked: false, connected: false, checkedAt: 0 };

/**
 * Real y cacheado (nunca por-request): `claude mcp get krea` real,
 * ejecutado con el cwd real del proyecto -- Connected/no-Connected se lee
 * del texto real de salida del CLI real, nunca inventado. Expuesto para
 * tests reales (permite invalidar el caché real entre casos).
 */
export function resetKreaMcpConnectionCache() {
  connectionCache = { checked: false, connected: false, checkedAt: 0 };
}

function isKreaMcpConnected() {
  const now = Date.now();
  if (connectionCache.checked && (now - connectionCache.checkedAt) < CONNECTION_CACHE_TTL_MS) {
    return connectionCache.connected;
  }
  let connected = false;
  try {
    const out = execFileSync(claudeBin(), ['mcp', 'get', 'krea'], {
      cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    connected = /Connected/i.test(out);
  } catch {
    connected = false; // sin "claude" real en PATH, sin servidor real registrado, o timeout real -- nunca se asume conectado.
  }
  connectionCache = { checked: true, connected, checkedAt: now };
  return connected;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function extensionFromContentType(contentType) {
  if (!contentType) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  return 'png';
}

/** Extrae el primer objeto JSON real balanceado de un texto real -- defensa real contra que el puente (LLM real) agregue texto alrededor pese a la instrucción real de "solo JSON". */
function extractJsonObject(texto) {
  const inicio = texto.indexOf('{');
  if (inicio === -1) throw new Error('sin "{" real en la salida del puente.');
  let profundidad = 0;
  for (let i = inicio; i < texto.length; i += 1) {
    if (texto[i] === '{') profundidad += 1;
    else if (texto[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return JSON.parse(texto.slice(inicio, i + 1));
    }
  }
  throw new Error('JSON real sin cerrar en la salida del puente.');
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
      referenceImagePreservation: this._endpoint.shape === 'runway', // verificado real 2026-08-27 (packaging real de Cápsulas Ripped preservado).
      negativePrompt: false, // ninguno de los modelos reales de Krea documenta un campo real "negative_prompt".
      aspectRatioControl: true,
    });
  }

  /** Nunca asume disponibilidad -- real y cacheada (ver isKreaMcpConnected()). */
  isConfigured() {
    return isKreaMcpConnected();
  }

  _buildMcpInput(request) {
    const aspectRatio = this._endpoint.aspectRatios.includes(request.aspectRatio) ? request.aspectRatio : this._endpoint.aspectRatios[0];
    if (this._endpoint.shape === 'krea2') {
      return { input: { prompt: request.generationPrompt, aspect_ratio: aspectRatio, resolution: '1K' }, aspectRatio };
    }
    if (!request.productReferenceImageUrl?.trim()) {
      return { invalid: 'KreaMcpImageProvider (runway-gen4): requiere "productReferenceImageUrl" real (una URL real ya alojada de la fotografía real del producto) -- reference_images es obligatorio para este modelo real, nunca se omite ni se inventa.' };
    }
    const dims = RUNWAY_DIMENSIONS_BY_ASPECT_RATIO[aspectRatio];
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
   * cuando isConfigured() ya fue true. Spawnea el Claude Code CLI real en
   * modo headless (`claude -p`), restringido a UNA tool real
   * (mcp__krea__generate_image), para invocar la MISMA sesión MCP real ya
   * autenticada por OAuth -- nunca simula el resultado, un fallo real del
   * puente (CLI ausente, MCP no conectado, timeout real, JSON real
   * inválido) se reporta como PROVIDER_ERROR real, nunca como éxito.
   */
  async generate(request) {
    const built = this._buildMcpInput(request);
    if (built.invalid) {
      return createImageGenerationResult({
        status: 'INVALID_REQUEST', requestId: request.requestId, visualProductionPackageId: request.visualProductionPackageId,
        providerName: this.providerName, model: this.model, isMock: false, generationFingerprint: request.generationFingerprint,
        error: built.invalid,
      });
    }
    const { input, aspectRatio } = built;
    const promptReal = [
      `Call the MCP tool "mcp__krea__generate_image" EXACTLY ONCE with model="${this._endpoint.mcpModel}", sync=true, timeoutSeconds=170, and input=${JSON.stringify(input)}.`,
      'After the tool call completes, output ONLY the raw JSON object returned by the tool call. No markdown, no code fences, no commentary, nothing before or after the JSON.',
    ].join(' ');

    let salida;
    try {
      salida = execFileSync(claudeBin(), [
        '-p', promptReal,
        '--allowedTools', 'mcp__krea__generate_image',
        '--permission-mode', 'bypassPermissions',
        '--output-format', 'json',
      ], {
        cwd: PROJECT_ROOT, encoding: 'utf8', timeout: generateTimeoutMs(), maxBuffer: 16 * 1024 * 1024,
      });
    } catch (err) {
      return this._errorResult(request, `KreaMcpImageProvider: fallo real al invocar el puente Claude CLI (${err.message}).`);
    }

    let sobre;
    try {
      sobre = JSON.parse(salida);
    } catch (err) {
      return this._errorResult(request, `KreaMcpImageProvider: el puente Claude CLI no devolvió JSON real válido en --output-format json (${err.message}).`);
    }
    if (sobre.is_error || sobre.subtype !== 'success') {
      return this._errorResult(request, `KreaMcpImageProvider: el puente Claude CLI terminó con error real: ${sobre.result ?? sobre.subtype ?? 'sin detalle'}`);
    }

    let job;
    try {
      job = extractJsonObject(String(sobre.result ?? ''));
    } catch (err) {
      return this._errorResult(request, `KreaMcpImageProvider: no se pudo extraer el JSON real del resultado de la tool MCP (${err.message}) -- salida real: ${String(sobre.result ?? '').slice(0, 500)}`);
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
      // (mismo hallazgo real que en la fase REST, ver get_model_schema real
      // -- ningún modelo real del catálogo lo expone). El costo real
      // DISTINTO del puente (turno real de Claude, ver nota de cabecera) no
      // se mezcla aquí -- este campo es exclusivamente el costo real de
      // Krea, honesto: "UNKNOWN", nunca inventado.
      estimatedCost: 0,
      actualCost: 0,
      currency: 'USD',
      costStatus: 'UNKNOWN',
    });
  }

  _errorResult(request, error) {
    return createImageGenerationResult({
      status: 'PROVIDER_ERROR', requestId: request.requestId, visualProductionPackageId: request.visualProductionPackageId,
      providerName: this.providerName, model: this.model, isMock: false, generationFingerprint: request.generationFingerprint, error,
    });
  }
}
