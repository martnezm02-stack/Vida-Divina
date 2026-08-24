// productCatalog.js — lee productos y sus assets RAW REALES desde disco.
// Reutiliza sin duplicar: registerImageAsset() (video-production/src/
// assetRegistry.js, para JPEG) y loadProductFacts() (content-orchestrator/
// src/productFactsLoader.js, catálogo real docs/productos/). Nunca inventa
// un producto ni una fotografía -- si un producto no tiene hechos reales en
// el catálogo, o una fotografía no puede leerse, se reporta explícitamente
// en vez de omitirse en silencio o rellenarse con datos inventados.

import { readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerImageAsset, ASSET_ROLES } from '../../../video-production/src/assetRegistry.js';
import { loadProductFacts } from '../../../content-orchestrator/src/productFactsLoader.js';
import { PROJECT_ROOT } from './safePaths.js';

const PRODUCTS_ASSETS_DIR = join(PROJECT_ROOT, 'assets', 'products');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** Registra una fotografía RAW real -- usa registerImageAsset() (con dimensiones reales) para JPEG/PNG (auditoría "Video Workspace + Voice Engine", 2026-08-23: assetRegistry.js ya soporta PNG); para otros formatos de imagen reales (ej. WebP) calcula hash+tamaño reales sin inventar dimensiones que este registro mínimo todavía no sabe leer. */
function describeRawImage(filePath, productSlug) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    const asset = registerImageAsset({ sourcePath: filePath, productId: productSlug, role: ASSET_ROLES[0] });
    return { ...asset, dimensionsAvailable: true };
  }
  const stat = statSync(filePath);
  return {
    assetId: hashFile(filePath),
    productId: productSlug,
    sourcePath: filePath,
    originalFilename: basename(filePath),
    width: null,
    height: null,
    format: ext.replace('.', ''),
    role: ASSET_ROLES[0],
    status: 'PRODUCT_REFERENCE_AVAILABLE',
    fileSizeBytes: stat.size,
    dimensionsAvailable: false,
  };
}

/**
 * Lista todos los productos que tienen al menos una carpeta real bajo
 * assets/products/<slug>/raw/ -- nunca inventa un producto que no tenga
 * assets reales en disco. Para cada uno, intenta cargar sus hechos reales
 * del catálogo (productFactsLoader.js); si no existen, factsAvailable:false
 * (nunca se rellenan con datos inventados).
 */
export function listProductsWithAssets() {
  if (!statSync(PRODUCTS_ASSETS_DIR, { throwIfNoEntry: false })) return [];
  const carpetas = readdirSync(PRODUCTS_ASSETS_DIR).filter((f) => statSync(join(PRODUCTS_ASSETS_DIR, f)).isDirectory());

  return carpetas.map((slug) => {
    const rawDir = join(PRODUCTS_ASSETS_DIR, slug, 'raw');
    let rawFiles = [];
    try {
      rawFiles = readdirSync(rawDir).filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()));
    } catch { /* sin carpeta raw real -- 0 assets, no un error */ }

    const rawAssets = rawFiles.map((f) => {
      try {
        return describeRawImage(join(rawDir, f), slug);
      } catch (err) {
        return { originalFilename: f, error: err.message, status: 'ERROR_READING_FILE' };
      }
    });

    let facts = null;
    let factsAvailable = false;
    try {
      facts = loadProductFacts(slug);
      factsAvailable = true;
    } catch { /* producto sin catálogo real todavía -- se reporta, no se inventa */ }

    return {
      productSlug: slug,
      factsAvailable,
      nombreComercial: facts?.nombreComercial ?? null,
      problema: facts?.problema ?? null,
      beneficios: facts?.beneficios ?? null,
      ingredientes: facts?.ingredientes ?? null,
      objetivoPrincipal: facts?.objetivoPrincipal ?? null,
      presentacion: facts?.presentacion ?? null,
      publicoObjetivo: facts?.publicoObjetivo ?? null,
      modoDeUso: facts?.modoDeUso ?? null,
      estadoComercial: facts?.estadoComercial ?? null,
      rawAssetCount: rawAssets.length,
      rawAssets,
    };
  });
}

/** Un producto real específico -- null si no tiene carpeta real de assets. */
export function getProduct(slug) {
  return listProductsWithAssets().find((p) => p.productSlug === slug) ?? null;
}
