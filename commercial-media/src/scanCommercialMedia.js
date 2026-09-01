// scanCommercialMedia.js — Commercial Media Intake: la única función que
// el usuario necesita ejecutar (encargo §1, §5, §36, §37). Flujo:
// archivo -> validación -> hash -> probe -> clasificación -> registry.
//
// UX objetivo (§53): "coloco el archivo en commercial-media/incoming/ y
// ejecuto scan-commercial-media" -- nunca necesita conocer rutas internas,
// hash, ni el registry.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMediaFile, probeMediaFile, SUPPORTED_EXTENSIONS } from './mediaInspector.js';
import { classifyCommercialMedia } from './classifier.js';
import { categoryForProduct, nombreVisibleForProduct } from './productKeywordMatcher.js';
import { upsertCommercialMedia } from './commercialMediaStore.js';
import { intentForMediaType } from './mediaTypes.js';

export const INCOMING_DIR = process.env.COMMERCIAL_MEDIA_INCOMING_DIR
  ? join(process.env.COMMERCIAL_MEDIA_INCOMING_DIR)
  : fileURLToPath(new URL('../incoming', import.meta.url));

const MANIFEST_FILENAME = 'manifest.json';

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** manifest.json real (§6) en incoming/: arreglo de objetos {file, ...campos}. Ausente o inválido => {} (nunca bloquea el scan). */
function loadManifests(incomingDir) {
  const manifestPath = join(incomingDir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const byFile = {};
    for (const entry of entries) {
      if (entry?.file) byFile[entry.file] = entry;
    }
    return byFile;
  } catch (err) {
    console.error(`[scan-commercial-media] "${MANIFEST_FILENAME}" existe pero no se pudo leer como JSON real -- se ignora, ningún archivo se bloquea por esto: ${err.message}`);
    return {};
  }
}

const TYPE_LABELS = Object.freeze({
  VIDEO_TESTIMONIAL: 'Testimonio', AUDIO_OFICIAL: 'Audio Oficial', PRODUCT_EXPLANATION_VIDEO: 'Explicación de Producto',
  PRODUCT_MEDIA: 'Media de Producto', BUSINESS_MODEL_VIDEO: 'Modelo de Negocio', BUSINESS_MODEL_AUDIO: 'Modelo de Negocio (Audio)',
  DISTRIBUTION_EXPLANATION: 'Explicación de Distribución', BRAND_MEDIA: 'Marca',
});

/** Nunca un UUID (§11); si el manifest/clasificación ya trae un nombre humano real, se usa tal cual -- si no, se construye uno legible a partir de datos reales (producto + tipo), nunca inventado. */
function buildFallbackDisplayName(fileName, classification) {
  if (classification.displayName && classification.displayName !== fileName) return classification.displayName;
  const nombreVisible = classification.productId ? nombreVisibleForProduct(classification.productId) : null;
  const tipoLabel = TYPE_LABELS[classification.mediaType] ?? null;
  const partes = [nombreVisible, tipoLabel].filter(Boolean);
  if (partes.length > 0) return partes.join(' — ');
  // Último recurso real: nombre de archivo humanizado (sin extensión, guiones/underscores a espacio) -- nunca el mediaId/UUID.
  return basename(fileName, extname(fileName)).replace(/[_-]+/g, ' ').trim();
}

function listCandidateFiles(incomingDir) {
  if (!existsSync(incomingDir)) return [];
  return readdirSync(incomingDir).filter((f) => {
    if (f === MANIFEST_FILENAME || f.startsWith('.')) return false;
    return SUPPORTED_EXTENSIONS.includes(extname(f).toLowerCase());
  });
}

/**
 * Escanea commercial-media/incoming/ (§36): valida, clasifica y registra
 * cada archivo real nuevo/cambiado. `dryRun:true` (§37) ejecuta el mismo
 * pipeline sin escribir en el registry -- útil para revisar antes de
 * confirmar.
 */
export function scanCommercialMedia({ dryRun = false, incomingDir = INCOMING_DIR } = {}) {
  mkdirSync(incomingDir, { recursive: true });
  const manifests = loadManifests(incomingDir);
  const files = listCandidateFiles(incomingDir);

  const report = { registered: [], updated: [], needsMetadata: [], invalid: [], dryRun };

  for (const fileName of files) {
    const filePath = join(incomingDir, fileName);
    const validation = validateMediaFile(filePath);
    if (!validation.valid) {
      report.invalid.push({ fileName, errors: validation.errors });
      continue;
    }

    const contentHash = hashFile(filePath);
    const probe = probeMediaFile(filePath, validation.kind);
    const manifest = manifests[fileName] ?? null;
    const classification = classifyCommercialMedia({ fileName, kind: validation.kind, manifest });
    const category = classification.productId ? categoryForProduct(classification.productId) : classification.category;
    const displayName = buildFallbackDisplayName(fileName, classification);

    const fields = {
      displayName,
      filePath,
      sourcePath: filePath,
      mimeType: validation.mimeType,
      mediaType: classification.mediaType,
      businessIntent: classification.businessIntent,
      productId: classification.productId,
      category,
      audience: classification.audience,
      needTags: classification.needTags,
      language: manifest?.language ?? 'es',
      durationSeconds: probe.durationSeconds,
      fileSizeBytes: validation.fileSizeBytes,
      contentHash,
      classificationConfidence: classification.classificationConfidence,
      classificationReason: classification.classificationReason,
    };

    if (dryRun) {
      report[fields.businessIntent === 'NEEDS_METADATA' ? 'needsMetadata' : 'registered'].push({ fileName, wouldRegister: true, ...fields });
      continue;
    }

    const { record, wasNew } = upsertCommercialMedia(fields);
    if (record.businessIntent === 'NEEDS_METADATA') report.needsMetadata.push(record);
    else report[wasNew ? 'registered' : 'updated'].push(record);
  }

  return Object.freeze(report);
}

export { intentForMediaType }; // reexport de conveniencia para el CLI.
