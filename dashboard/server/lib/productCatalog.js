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

// Product Asset Primary Selection (Corrección "Limpieza y normalización
// del Product Knowledge", 2026-08-28, Paso 3/12 del encargo). ANTES: el
// primer archivo real por orden alfabético del sistema de archivos se
// registraba SIEMPRE como PRODUCT_PRIMARY (describeRawImage() pasaba
// ASSET_ROLES[0] literal, sin mirar el nombre real) -- root cause real
// confirmado del bug reportado: para "tongkat-ali-cafe", eso elegía
// "Tongkat ali beneficios.png" (lámina gráfica de beneficios con
// headline+iconos, verificado por inspección visual directa del archivo
// real) en vez de una fotografía limpia real del empaque físico.
//
// Convención real ya usada en la mayoría del catálogo (Mars_01_Producto/
// 02_Beneficios/03_Vive_Vida_Divina_Lifestyle, mismo patrón en
// cappuccino/extracto-tremella/ripped-capsules/sculpt-black/
// venus-capsules): "01_Producto" es la foto hero real del producto;
// "Beneficios"/"Lifestyle" son gráficos de apoyo reales, nunca el
// producto físico solo. Se detecta por palabra clave real en el nombre
// de archivo -- nunca se reordenan ni renombran los archivos reales.
const BENEFITS_FILENAME_RE = /benefici/i;
const LIFESTYLE_FILENAME_RE = /lifestyle|vive.?vida.?divina/i;
const PRIMARY_FILENAME_RE = /\b0?1[_-]?producto\b/i;

// Mapeo explícito y auditable (Paso 3/12 del encargo: "para productos con
// nomenclatura histórica irregular, usar un mapping explícito y
// auditable") -- SOLO para productos reales cuyo nombre de archivo NO seas
// clasificable por la convención de arriba. "tongkat-ali-cafe" no usa
// "01/02/03_" -- sus 3 archivos reales son "Tongkat ali beneficios.png"
// (lámina de beneficios, confirmada por inspección visual real),
// "Tongkat ali imagen.png" y "Tongkat ali.png" (ambas fotos reales
// limpias del empaque físico, 1254x1254, sin overlay de texto real,
// confirmadas por inspección visual real). Entre estas dos últimas se
// elige "Tongkat ali.png" -- nombre base real del producto sin sufijo
// descriptivo, mismo criterio real que "Sculpt_Black.png" (único archivo
// real de ese producto, también sin sufijo). "imagen.png" queda como
// PRODUCT_SECONDARY_REFERENCE real -- sigue siendo un asset real
// utilizable, solo no es el primario real.
const PRIMARY_ASSET_OVERRIDES = Object.freeze({
  tongkatalicafe: 'Tongkat ali.png',
});

function clasificarNombreReal(filename) {
  if (BENEFITS_FILENAME_RE.test(filename)) return 'BENEFITS';
  if (LIFESTYLE_FILENAME_RE.test(filename)) return 'LIFESTYLE';
  if (PRIMARY_FILENAME_RE.test(filename)) return 'PRODUCT_PRIMARY_CANDIDATE';
  return 'UNCLASSIFIED';
}

function normalizarSlugCatalogo(slug) {
  return String(slug ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Elige el índice real (dentro de rawFiles, mismo orden real que llega de
 * disco) del archivo que debe recibir role:'PRODUCT_PRIMARY' -- nunca
 * alfabético (Paso 3/12 del encargo). Prioridad real:
 * 1. mapeo explícito real (PRIMARY_ASSET_OVERRIDES) para nomenclatura
 *    histórica irregular;
 * 2. archivo real que matchea la convención real "01_Producto";
 * 3. primer archivo real SIN clasificar (nunca elige uno ya identificado
 *    como BENEFITS/LIFESTYLE si existe una alternativa real sin
 *    clasificar);
 * 4. fallback real: primer archivo real de la lista (mismo comportamiento
 *    preexistente -- nunca deja un producto real sin primario).
 */
function elegirIndicePrimarioReal(slug, rawFiles) {
  const overridden = PRIMARY_ASSET_OVERRIDES[normalizarSlugCatalogo(slug)];
  if (overridden) {
    const idx = rawFiles.findIndex((f) => f === overridden);
    if (idx >= 0) return idx;
  }
  const porConvencion = rawFiles.findIndex((f) => clasificarNombreReal(f) === 'PRODUCT_PRIMARY_CANDIDATE');
  if (porConvencion >= 0) return porConvencion;
  const sinClasificar = rawFiles.findIndex((f) => clasificarNombreReal(f) === 'UNCLASSIFIED');
  if (sinClasificar >= 0) return sinClasificar;
  return 0;
}

/** Registra una fotografía RAW real -- usa registerImageAsset() (con dimensiones reales) para JPEG/PNG (auditoría "Video Workspace + Voice Engine", 2026-08-23: assetRegistry.js ya soporta PNG); para otros formatos de imagen reales (ej. WebP) calcula hash+tamaño reales sin inventar dimensiones que este registro mínimo todavía no sabe leer. "role" real (Paso 3/12 del encargo): ya decidido por elegirIndicePrimarioReal() antes de llamar aquí -- nunca ASSET_ROLES[0] fijo. assetId real (sha256 del archivo real, ver assetRegistry.js) es independiente del role real -- reclasificar nunca cambia ningún assetId real ya existente (Paso 13/21 del encargo). */
function describeRawImage(filePath, productSlug, role) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    const asset = registerImageAsset({ sourcePath: filePath, productId: productSlug, role });
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
    role,
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

    // Índice real del archivo primario (Paso 3/12 del encargo) -- se decide
    // UNA vez por producto real, antes de registrar cada archivo real, para
    // que exactamente uno reciba role:'PRODUCT_PRIMARY' real y el resto
    // role:'PRODUCT_SECONDARY_REFERENCE' real (ambos ya válidos en
    // ASSET_ROLES/productIntegrity.js -- nunca un rol nuevo).
    const indicePrimarioReal = elegirIndicePrimarioReal(slug, rawFiles);
    const rawAssets = rawFiles.map((f, i) => {
      try {
        return describeRawImage(join(rawDir, f), slug, i === indicePrimarioReal ? ASSET_ROLES[0] : ASSET_ROLES[1]);
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
      nombreVisible: facts?.nombreVisible ?? facts?.nombreComercial ?? null,
      problema: facts?.problema ?? null,
      beneficios: facts?.beneficios ?? null,
      ingredientes: facts?.ingredientes ?? null,
      objetivoPrincipal: facts?.objetivoPrincipal ?? null,
      presentacion: facts?.presentacion ?? null,
      publicoObjetivo: facts?.publicoObjetivo ?? null,
      modoDeUso: facts?.modoDeUso ?? null,
      estadoComercial: facts?.estadoComercial ?? null,
      // dataQualityStatus (Paso 18/22 del encargo): VERIFIED/INCOMPLETE/
      // CONFLICT/MISSING, ya calculado real por productFactsLoader.js --
      // nunca recalculado aquí, solo expuesto para el Dashboard/Creative
      // pipeline.
      dataQualityStatus: facts?.dataQualityStatus ?? null,
      dataQualityDetail: facts?.dataQualityDetail ?? null,
      rawAssetCount: rawAssets.length,
      rawAssets,
    };
  });
}

/** Un producto real específico -- null si no tiene carpeta real de assets. */
export function getProduct(slug) {
  return listProductsWithAssets().find((p) => p.productSlug === slug) ?? null;
}
