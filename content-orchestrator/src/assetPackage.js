// assetPackage.js — Asset Package formal (Parte 5). Contenedor con
// trazabilidad de TODOS los assets reales que entran a una producción:
// product images, logos, generated images, B-roll, video clips, audio,
// voz, música, gráficos, fuentes, brand assets.
//
// REGLA CENTRAL: NO duplica video-production/src/assetRegistry.js. Para
// imágenes de producto reutiliza registerImageAsset() tal cual (misma
// lógica de lectura real de dimensiones JPEG + hash de contenido). Este
// archivo solo añade lo que assetRegistry.js nunca cubrió: un registrador
// genérico content-addressed para tipos que no son imagen de producto
// (audio, video clip, música, fuente, gráfico, logo, brand asset) y el
// contenedor AssetPackage que los agrupa con trazabilidad uniforme.

import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { registerImageAsset, ASSET_ROLES as PRODUCT_IMAGE_ROLES } from '../../video-production/src/assetRegistry.js';

// Tipo de ENTRADA dentro del Asset Package -- distinto de
// visualProductionPackage.js#ASSET_TYPES (VIDEO/IMAGE/CAROUSEL, que
// describe el tipo del OUTPUT final, no de cada asset de entrada).
export const ASSET_ENTRY_TYPES = Object.freeze([
  'PRODUCT_IMAGE', 'LOGO', 'GENERATED_IMAGE', 'B_ROLL', 'VIDEO_CLIP',
  'AUDIO_VOICE', 'AUDIO_MUSIC', 'GRAPHIC', 'FONT', 'BRAND_ASSET',
]);

export const ASSET_ENTRY_STATUS = Object.freeze(['AVAILABLE', 'REQUIRED_MISSING']);

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// Auditoría "Video Workspace + Voice Engine" (2026-08-23): causa raíz más
// probable de un VALIDATION_FAILED real observado en Ripped Capsules --
// el WAV recién generado por Voice Engine vive en una ruta UNC de WSL2
// (\\wsl.localhost\...); existsSync() puede pasar y un readFileSync()
// posterior fallar de todos modos (mount UNC no estabilizado / archivo
// aún liberándose del lado WSL). Reintentos pequeños y deterministas --
// NUNCA indefinidos -- y, si se agotan, un error específico y accionable
// en vez de dejar que un VALIDATION_FAILED genérico oculte la causa.
const HANDOFF_READ_RETRIES = 5;
const HANDOFF_RETRY_DELAY_MS = 100;

/** Sleep síncrono sin dependencias -- Atomics.wait sobre un buffer compartido, el único mecanismo real de pausa bloqueante en Node sin librerías. Uso exclusivo: esperar el hand-off de un archivo que un proceso EXTERNO (WSL) acaba de escribir -- nunca para lógica de negocio. */
function dormirSincrono(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Lee un archivo real con reintentos acotados, distinguiendo dos fallos
 * reales y específicos (nunca un VALIDATION_FAILED sin contexto):
 *   - el tamaño en disco no se estabiliza entre dos chequeos -> el
 *     archivo parece seguir escribiéndose -> "*_NOT_READY".
 *   - el tamaño ya es estable pero readFileSync() sigue fallando
 *     (bloqueo/permiso transitorio) -> "*_READ_FAILED".
 * El prefijo es AUDIO_ASSET para type:'AUDIO_VOICE' (el hand-off
 * problemático real hoy, WSL2->Windows) y ASSET para cualquier otro tipo.
 */
export function leerArchivoConReintentos(sourcePath, type) {
  const prefijo = type === 'AUDIO_VOICE' ? 'AUDIO_ASSET' : 'ASSET';
  let motivoFinal = 'NOT_READY';
  let ultimoError = null;
  for (let intento = 1; intento <= HANDOFF_READ_RETRIES; intento += 1) {
    try {
      const tamañoInicial = statSync(sourcePath).size;
      if (intento < HANDOFF_READ_RETRIES) dormirSincrono(HANDOFF_RETRY_DELAY_MS);
      const stat = statSync(sourcePath);
      if (stat.size !== tamañoInicial) { motivoFinal = 'NOT_READY'; continue; }
      return { buffer: readFileSync(sourcePath), stat };
    } catch (err) {
      motivoFinal = 'READ_FAILED';
      ultimoError = err;
    }
  }
  throw new Error(motivoFinal === 'READ_FAILED'
    ? `${prefijo}_READ_FAILED: no se pudo leer "${sourcePath}" tras ${HANDOFF_READ_RETRIES} intentos (${ultimoError?.message}) -- posible bloqueo transitorio del hand-off WSL2->Windows.`
    : `${prefijo}_NOT_READY: "${sourcePath}" no se estabilizó (tamaño en disco seguía cambiando) tras ${HANDOFF_READ_RETRIES} intentos -- el archivo parece seguir escribiéndose.`);
}

/**
 * Registra cualquier asset real que NO sea una imagen de producto (para
 * imágenes de producto, usar registerImageAsset() directamente -- ver
 * registerEntry() abajo, que ya hace esa distinción). Nunca fabrica el
 * archivo: si no existe en disco, devuelve status REQUIRED_MISSING con
 * assetId:null, igual que registerImageAsset() hace para su propio caso.
 */
function registerGenericAsset({ sourcePath, type, role, productId = null }) {
  if (!sourcePath?.trim()) throw new Error('registerGenericAsset: "sourcePath" es obligatorio.');
  if (!ASSET_ENTRY_TYPES.includes(type)) {
    throw new Error(`registerGenericAsset: "type" inválido "${type}" (válidos: ${ASSET_ENTRY_TYPES.join(', ')}).`);
  }
  if (!existsSync(sourcePath)) {
    return Object.freeze({
      assetId: null, source: 'LOCAL_FILE', type, role, productId,
      sourcePath, hash: null, status: 'REQUIRED_MISSING', fileSizeBytes: null,
    });
  }
  const { buffer, stat } = leerArchivoConReintentos(sourcePath, type);
  const hash = hashBuffer(buffer);
  return Object.freeze({
    assetId: hash, source: 'LOCAL_FILE', type, role, productId,
    sourcePath, hash, status: 'AVAILABLE', fileSizeBytes: stat.size,
    originalFilename: basename(sourcePath), format: extname(sourcePath).replace('.', '').toLowerCase(),
  });
}

/**
 * Registra UNA entrada del Asset Package, delegando a la lógica correcta
 * según el tipo: PRODUCT_IMAGE reutiliza registerImageAsset() real
 * (video-production/src/assetRegistry.js) tal cual, sin reimplementarla;
 * cualquier otro tipo usa el registrador genérico de este archivo.
 *
 * @param {{sourcePath:string, type:string, role:string, productId?:string}} args
 * @returns {{assetId:string|null, source:string, type:string, role:string, productId:string|null, sourcePath:string, hash:string|null, status:string}}
 */
export function registerAssetEntry({ sourcePath, type, role, productId = null }) {
  if (type === 'PRODUCT_IMAGE') {
    if (!PRODUCT_IMAGE_ROLES.includes(role)) {
      throw new Error(`registerAssetEntry: PRODUCT_IMAGE requiere un role de assetRegistry.ASSET_ROLES (${PRODUCT_IMAGE_ROLES.join(', ')}), recibido "${role}".`);
    }
    if (!productId?.trim()) throw new Error('registerAssetEntry: PRODUCT_IMAGE requiere "productId".');
    const img = registerImageAsset({ sourcePath, productId, role });
    // Normaliza el status de assetRegistry.js (PRODUCT_REFERENCE_AVAILABLE/
    // PRODUCT_REFERENCE_REQUIRED, vocabulario propio de esa fase anterior) al
    // vocabulario uniforme de ASSET_ENTRY_STATUS -- así todo entry del Asset
    // Package, sin importar el type, se lee con el mismo status posible.
    const status = img.status === 'PRODUCT_REFERENCE_AVAILABLE' ? 'AVAILABLE' : 'REQUIRED_MISSING';
    return Object.freeze({
      assetId: img.assetId, source: 'LOCAL_FILE', type: 'PRODUCT_IMAGE', role, productId,
      sourcePath: img.sourcePath, hash: img.assetId, status,
      fileSizeBytes: img.fileSizeBytes ?? null, width: img.width, height: img.height, format: img.format,
    });
  }
  return registerGenericAsset({ sourcePath, type, role, productId });
}

/**
 * Construye un Asset Package completo a partir de una lista de
 * especificaciones de entrada -- ninguna lógica de negocio propia más allá
 * de agrupar y validar trazabilidad; cada entrada real se registra vía
 * registerAssetEntry() (que a su vez reutiliza assetRegistry.js).
 *
 * @param {{contentRequestId:string, entries:Array<{sourcePath:string, type:string, role:string, productId?:string}>}} args
 */
export function createAssetPackage({ contentRequestId, entries }) {
  if (!contentRequestId?.trim()) throw new Error('createAssetPackage: "contentRequestId" es obligatorio.');
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('createAssetPackage: "entries" debe ser un arreglo no vacío -- un Asset Package sin ningún asset real no tiene sentido.');
  }

  const registeredEntries = entries.map((e) => registerAssetEntry(e));
  const missing = registeredEntries.filter((e) => e.status === 'REQUIRED_MISSING');

  return Object.freeze({
    assetPackageId: randomUUID(),
    contentRequestId,
    entries: Object.freeze(registeredEntries),
    entryCount: registeredEntries.length,
    hasAllAssetsAvailable: missing.length === 0,
    missingAssetPaths: Object.freeze(missing.map((e) => e.sourcePath)),
    createdAt: new Date().toISOString(),
  });
}

/** Filtra entradas de un Asset Package real por type -- ayuda de lectura, no fabrica nada. */
export function getAssetPackageEntriesByType(assetPackage, type) {
  return assetPackage.entries.filter((e) => e.type === type);
}
