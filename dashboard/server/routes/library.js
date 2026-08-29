// library.js — endpoints GET de solo lectura: productos, assets, campañas,
// Output Profiles reales, operaciones de PostProduction reales, Audio
// Assets reutilizables, y estado real del Voice Engine. Todos leen de los
// módulos reales -- ninguno inventa datos.

import { statSync } from 'node:fs';
import { sendJson, notFound, badRequest, readJsonBody } from '../lib/http.js';
import { resolveSafeMediaPath, toMediaUrl } from '../lib/safePaths.js';
import { listProductsWithAssets, getProduct } from '../lib/productCatalog.js';
import { listCampaigns, listFinalOutputsWithLineage } from '../lib/productionLibrary.js';
import { isDeletableFinalOutputPath, findAssetDependents, deleteFinalOutputAsset } from '../lib/assetDeletion.js';
import { listExistingAudioAssets, isVoiceEngineReachable } from '../lib/voiceEngineClient.js';
import { classifyFinalOutputs, classifyRawAsset, classifyAudioAsset } from '../lib/assetClassification.js';
import { setArchived } from '../lib/assetOverrideStore.js';
import { OUTPUT_PROFILES, OUTPUT_PROFILE_NAMES } from '../../../content-orchestrator/src/outputProfiles.js';
import { SUPPORTED_OPERATIONS, SIMPLE_OPERATIONS, COMPLEX_OPERATIONS, UNSUPPORTED_LOCAL_OPERATIONS } from '../../../content-orchestrator/src/postProduction.js';
import { assertAssetEntryIntegrity } from '../../../content-orchestrator/src/productIntegrity.js';
import { validarMp4ConFfprobe } from '../../../video-production/src/hyperframesRenderer.js';
import { lineageExists, getLineage, hashFile } from '../../../content-orchestrator/src/assetLineage.js';

const FFMPEG_BIN_DIR = process.env.FFMPEG_BIN_DIR
  ?? 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';

export async function handleProducts(req, res) {
  sendJson(res, 200, listProductsWithAssets());
}

export async function handleProduct(req, res, slug) {
  const product = getProduct(decodeURIComponent(slug));
  if (!product) { sendJson(res, 404, { error: `No existe el producto real "${slug}" (sin carpeta en assets/products/).` }); return; }
  // Integridad real por asset -- nunca solo "reportado", verificado en vivo contra el archivo real.
  const rawAssetsConIntegridad = product.rawAssets.map((a) => {
    if (a.status === 'ERROR_READING_FILE') return a;
    try {
      assertAssetEntryIntegrity({ assetId: a.assetId, sourcePath: a.sourcePath, type: 'PRODUCT_IMAGE', role: a.role, productId: a.productId }, { expectedProductId: product.productSlug });
      return { ...a, integrityStatus: 'OK' };
    } catch (err) {
      return { ...a, integrityStatus: 'VIOLATION', integrityError: err.message };
    }
  });
  sendJson(res, 200, { ...product, rawAssets: rawAssetsConIntegridad });
}

/**
 * Corrección "Normalizar Asset Registry y Dashboard Assets" (2026-08-29):
 * la categoría plana RAW/EDITED/GENERATED/FINAL (Paso 4/20 del encargo: un
 * render que termina NO es "aprobado" solo por terminar) se reemplaza por
 * clasificación real vía assetClassification.js -- misma fuente de datos de
 * siempre (listProductsWithAssets/listFinalOutputsWithLineage/
 * listExistingAudioAssets), ningún Asset Registry paralelo.
 */
export async function handleAssets(req, res) {
  const productos = listProductsWithAssets();
  const rawAssets = productos.flatMap((p) => p.rawAssets.map((a) => classifyRawAsset({ ...a, productSlug: p.productSlug }, p.factsAvailable ? p.nombreVisible : null)));
  const finalOutputs = classifyFinalOutputs(listFinalOutputsWithLineage()).map((o) => ({
    ...o,
    assetId: o.lineage?.derivedAssetId ?? null,
    sourcePath: o.path,
    mediaUrl: toMediaUrl(o.path),
  }));
  const audioAssetsRaw = await listExistingAudioAssets();
  const audioAssets = audioAssetsRaw.map((a) => classifyAudioAsset({ ...a, sourcePath: a.path, mediaUrl: toMediaUrl(a.path) }));
  sendJson(res, 200, { rawAssets, finalOutputs, audioAssets });
}

/**
 * ARCHIVE (POST /api/assets/archive, body {sourcePath, archived}) --
 * metadata pura (Paso 21/29 del encargo): nunca borra ni mueve el archivo
 * físico, solo recuerda que el usuario lo marcó ARCHIVED/no-ARCHIVED. Misma
 * restricción de raíz que la eliminación real (video-production/, nunca las
 * fotografías RAW de catálogo).
 */
export async function handleArchiveAsset(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { sourcePath, archived } = body;
  if (!sourcePath?.trim()) { badRequest(res, 'assets/archive: "sourcePath" es obligatorio.'); return; }

  const real = resolveSafeMediaPath(sourcePath);
  if (!real) { notFound(res, 'Archivo no encontrado o fuera de las raíces permitidas.'); return; }
  if (!isDeletableFinalOutputPath(real)) {
    badRequest(res, 'assets/archive: solo Final Outputs/Audio Assets reales de video-production/ pueden archivarse desde aquí -- las fotografías RAW del catálogo de producto no se archivan.');
    return;
  }

  const resultado = setArchived(real, Boolean(archived));
  sendJson(res, 200, resultado);
}

/**
 * DELETE (POST /api/assets/delete, body {sourcePath}) — eliminación REAL de
 * un Final Output (2026-08-26): borra el archivo físico real y su propio
 * registro de lineage, nunca solo lo oculta de la lista. Restringido a
 * video-production/ (nunca RAW de assets/products/, que es catálogo real
 * de producto, no un asset de prueba). Bloquea si algo real depende
 * todavía del archivo (ProductionJob/EditableVideoProject/
 * ScheduledPublication/otro asset derivado).
 */
export async function handleDeleteAsset(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { sourcePath } = body;
  if (!sourcePath?.trim()) { badRequest(res, 'assets: "sourcePath" es obligatorio.'); return; }

  const real = resolveSafeMediaPath(sourcePath);
  if (!real) { notFound(res, 'Archivo no encontrado o fuera de las raíces permitidas.'); return; }
  if (!isDeletableFinalOutputPath(real)) {
    badRequest(res, 'assets: solo se pueden eliminar Final Outputs reales de video-production/ desde aquí -- las fotografías RAW del catálogo de producto no se eliminan por esta vía.');
    return;
  }

  const dependiente = findAssetDependents(real);
  if (dependiente) {
    sendJson(res, 409, { deleted: false, error: 'No se puede eliminar este asset porque todavía está siendo utilizado.', usedBy: dependiente.reason });
    return;
  }

  const resultado = deleteFinalOutputAsset(real);
  sendJson(res, 200, resultado);
}

export async function handleCampaigns(req, res) {
  sendJson(res, 200, listCampaigns());
}

export async function handleOutputProfiles(req, res) {
  sendJson(res, 200, OUTPUT_PROFILE_NAMES.map((name) => ({ name, ...OUTPUT_PROFILES[name] })));
}

export async function handleOperations(req, res) {
  sendJson(res, 200, {
    supported: SUPPORTED_OPERATIONS,
    simple: SIMPLE_OPERATIONS,
    complex: COMPLEX_OPERATIONS,
    unsupported: Object.entries(UNSUPPORTED_LOCAL_OPERATIONS).map(([operation, reason]) => ({ operation, reason })),
  });
}

/**
 * Metadata real de un video ya producido (Parte "PREVIEW"): duración,
 * resolución, FPS, audio, tamaño, assetId, lineage -- vía ffprobe real
 * sobre el archivo real, nunca inventado. No genera ninguna copia: solo
 * inspecciona el archivo que ya existe.
 */
export async function handlePreviewInfo(req, res, url) {
  const rawPath = url.searchParams.get('path');
  const real = resolveSafeMediaPath(rawPath);
  if (!real) { notFound(res, 'Archivo no encontrado o fuera de las raíces permitidas.'); return; }

  const probe = validarMp4ConFfprobe(real, { ffprobeBin: `${FFMPEG_BIN_DIR}\\ffprobe.exe` });
  const stat = statSync(real);
  const assetId = hashFile(real);
  const lineage = lineageExists(assetId) ? getLineage(assetId) : null;

  sendJson(res, 200, { probe, fileSizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(), assetId, lineage });
}

export async function handleAudioAssets(req, res) {
  const [assets, voiceEngineUp] = await Promise.all([listExistingAudioAssets(), isVoiceEngineReachable()]);
  sendJson(res, 200, { existingAudioAssets: assets, voiceEngineReachable: voiceEngineUp });
}
