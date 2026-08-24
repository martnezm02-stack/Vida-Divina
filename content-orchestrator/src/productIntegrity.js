// productIntegrity.js — Content Generation Engine: garantiza que ninguna
// operación de EDIT/ADAPT altere el archivo de origen de una fotografía
// real de producto (nombre, logo, texto de empaque, presentación). Esta
// capa NUNCA modifica píxeles -- HyperFrames solo compone (Ken Burns) y
// ffmpeg solo compone overlays sobre el VIDEO, ninguno reescribe el
// archivo fuente de la fotografía. Esta función es la verificación real
// de que eso siguió siendo cierto después de una operación: compara el
// hash del archivo fuente antes/después -- si cambió, es una violación de
// integridad real, no una suposición.

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ASSET_ENTRY_TYPES } from './assetPackage.js';

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

// Roles reservados EXCLUSIVAMENTE para fotografía real (RAW) de producto --
// mismo vocabulario que video-production/src/assetRegistry.js#ASSET_ROLES.
// Ningún asset type:'GENERATED_IMAGE' (compuesto/sintético) puede llevar
// uno de estos roles: sería presentar una imagen generada como si fuera la
// fotografía oficial del producto, exactamente lo que esta fase prohíbe.
const PRODUCT_PHOTO_ROLES = Object.freeze(['PRODUCT_PRIMARY', 'PRODUCT_SECONDARY_REFERENCE']);
// Types que representan contenido producido por este sistema (composición, no una fuente física original).
const GENERATED_ASSET_TYPES = Object.freeze(['GENERATED_IMAGE', 'GRAPHIC']);

/**
 * Verificación real de integridad de UNA entrada de Asset Package (Parte
 * "PRODUCT INTEGRITY"): productId, assetId, sourcePath, role, existencia
 * física, correspondencia producto-asset, RAW vs GENERATED, y que ningún
 * asset GENERATED se presente con un role reservado a fotografía oficial.
 * Lanza con un mensaje específico ante la primera violación real -- nunca
 * agrega una advertencia silenciosa.
 *
 * @param {object} entry — una entrada real de createAssetPackage()/registerAssetEntry() (assetPackage.js).
 * @param {{expectedProductId?: string}} [opts]
 */
export function assertAssetEntryIntegrity(entry, { expectedProductId = null } = {}) {
  if (!entry?.assetId?.trim?.()) {
    throw new Error(`assertAssetEntryIntegrity: "assetId" ausente o inválido en el asset (sourcePath: ${entry?.sourcePath ?? 'desconocido'}) -- todo asset real debe tener un id de contenido verificable.`);
  }
  if (!entry.sourcePath?.trim?.()) {
    throw new Error(`assertAssetEntryIntegrity: "sourcePath" ausente en el asset "${entry.assetId}".`);
  }
  if (!existsSync(entry.sourcePath)) {
    throw new Error(`assertAssetEntryIntegrity: el asset "${entry.assetId}" declara sourcePath "${entry.sourcePath}" pero el archivo no existe físicamente en disco.`);
  }
  if (!entry.type || !ASSET_ENTRY_TYPES.includes(entry.type)) {
    throw new Error(`assertAssetEntryIntegrity: "type" inválido "${entry.type}" en el asset "${entry.assetId}" (válidos: ${ASSET_ENTRY_TYPES.join(', ')}).`);
  }
  if (!entry.role?.trim?.()) {
    throw new Error(`assertAssetEntryIntegrity: "role" ausente en el asset "${entry.assetId}".`);
  }
  if (expectedProductId && entry.productId && entry.productId !== expectedProductId) {
    throw new Error(`assertAssetEntryIntegrity: el asset "${entry.assetId}" declara productId "${entry.productId}", pero se esperaba "${expectedProductId}" -- correspondencia producto-asset rota.`);
  }
  // RAW vs GENERATED: un asset GENERATED_IMAGE/GRAPHIC nunca puede llevar
  // un role reservado a fotografía oficial de producto.
  if (GENERATED_ASSET_TYPES.includes(entry.type) && PRODUCT_PHOTO_ROLES.includes(entry.role)) {
    throw new Error(`assertAssetEntryIntegrity: el asset "${entry.assetId}" es type:"${entry.type}" (generado/compuesto) pero declara role:"${entry.role}" -- un asset generado NUNCA puede presentarse como fotografía oficial del producto (roles reservados a RAW: ${PRODUCT_PHOTO_ROLES.join(', ')}).`);
  }
  // El hash real del archivo debe coincidir con assetId cuando assetId es
  // literalmente un hash de contenido (mismo patrón sha256 usado en todo
  // el proyecto) -- si no coincide, el archivo en disco cambió después de
  // registrarse (violación de integridad RAW).
  if (/^[0-9a-f]{64}$/.test(entry.assetId)) {
    const hashActual = hashFile(entry.sourcePath);
    if (hashActual !== entry.assetId) {
      throw new Error(`assertAssetEntryIntegrity: el archivo real en "${entry.sourcePath}" ya no coincide con su assetId original (${entry.assetId}) -- el contenido cambió después de registrarse.`);
    }
  }
  return true;
}

/** Aplica assertAssetEntryIntegrity() a cada entrada real de un Asset Package -- usado antes de cualquier render/edición para garantizar que ningún asset del paquete viola integridad de producto. */
export function assertAssetPackageIntegrity(assetPackage, { expectedProductId = null } = {}) {
  for (const entry of assetPackage.entries) {
    if (entry.status !== 'AVAILABLE') continue; // un asset REQUIRED_MISSING ya se reporta aparte (assetPackage.hasAllAssetsAvailable); no es una violación de integridad, es una ausencia declarada.
    assertAssetEntryIntegrity(entry, { expectedProductId });
  }
  return true;
}

/**
 * Captura el hash real de una fotografía de producto ANTES de una
 * operación -- para comparar después. Lanza si el archivo no existe (no
 * se puede garantizar integridad de algo que no está en disco).
 */
export function captureProductImageState(sourcePath) {
  if (!existsSync(sourcePath)) {
    throw new Error(`captureProductImageState: no existe la fotografía real en ${sourcePath} -- no se puede garantizar integridad de un archivo inexistente.`);
  }
  return Object.freeze({ sourcePath, hashBefore: hashFile(sourcePath) });
}

/**
 * Verifica que la fotografía real de producto NO haya sido alterada por
 * una operación de EDIT/ADAPT. Lanza si el hash cambió -- una violación
 * real de integridad de producto (Parte "PRODUCT IMAGE INTEGRITY"), nunca
 * se ignora en silencio.
 */
export function assertProductImageUnchanged(capturedState) {
  if (!existsSync(capturedState.sourcePath)) {
    throw new Error(`assertProductImageUnchanged: la fotografía real en ${capturedState.sourcePath} ya no existe -- violación de integridad de producto.`);
  }
  const hashAfter = hashFile(capturedState.sourcePath);
  if (hashAfter !== capturedState.hashBefore) {
    throw new Error(`assertProductImageUnchanged: la fotografía real en ${capturedState.sourcePath} cambió de contenido (hash antes: ${capturedState.hashBefore}, ahora: ${hashAfter}) -- ninguna operación de este motor debe alterar el archivo fuente de un producto real.`);
  }
  return true;
}
