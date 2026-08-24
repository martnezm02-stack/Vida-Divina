// contentGenerationEngine.js — Content Generation Engine: punto de
// entrada superior único para CREATE / EDIT_ENHANCE / ADAPT.
//
// REGLA CENTRAL: esto NO es un segundo cerebro. generateContent() solo
// hace dispatch según request.mode (ya clasificado por
// contentGenerationRequest.js) hacia runCreate/runEdit/runAdapt, que a su
// vez SOLO coordinan lo que ya existe:
//   - CREATE reutiliza campaignMode.js/directInstructionAdapter.js +
//     contentOrchestrator.js#renderAndPostProduce (que a su vez reutiliza
//     HyperFrames + Voice Engine vía el Audio Asset ya generado + los
//     stores de persistencia).
//   - EDIT_ENHANCE reutiliza postProduction.js sobre un MP4 YA existente
//     -- nunca vuelve a invocar HyperFrames ni Voice Engine.
//   - ADAPT reutiliza contentOrchestrator.js#deriveOutputsForProfiles
//     sobre un MP4 YA existente -- misma razón.
//
// Ninguno de los tres modos redacta copy, inventa productos, fabrica
// fotografías, ni inventa claims -- todo el copy/asset real es explícito,
// provisto por quien llama (mismo límite ya documentado en
// directInstructionMode.js/campaignMode.js: requeriría un LLM).

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderAndPostProduce, deriveOutputsForProfiles } from './contentOrchestrator.js';
import { runPostProduction } from './postProduction.js';
import { getOutputProfile } from './outputProfiles.js';
import { hashFile, recordLineage } from './assetLineage.js';
import { captureProductImageState, assertProductImageUnchanged } from './productIntegrity.js';
import { renderCarousel } from '../../video-production/src/carouselRenderer.js';

// Vocabulario de estado del Final Asset Package -- explícito, nunca oculto.
export const GENERATION_STATUS = Object.freeze([
  'COMPLETED', 'PARTIAL', 'MISSING_PRODUCT_FACTS', 'SOURCE_ASSET_REQUIRED',
  'UNSUPPORTED_LOCAL_OPERATION', 'RENDER_FAILED', 'POSTPRODUCTION_FAILED', 'VALIDATION_FAILED',
]);

/** Dos operaciones deterministas sobre el mismo insumo pueden producir un archivo byte-idéntico (mismo hash) -- el registro de lineage ya es idempotente en disco (assetLineage.js), pero sin este dedupe el ARREGLO devuelto en el Final Asset Package repetiría la misma entrada una vez por cada output que resultó en ese mismo hash. */
function dedupeLineage(records) {
  const vistos = new Map();
  for (const r of records) if (!vistos.has(r.derivedAssetId)) vistos.set(r.derivedAssetId, r);
  return [...vistos.values()];
}

// assetPackageType -- extensión retrocompatible (Bloque 2, Carousel real):
// todo Final Asset Package existente (CREATE/EDIT_ENHANCE/ADAPT) queda
// 'SINGLE' automáticamente si no se especifica, así ningún consumidor
// existente (dashboard, tests) tiene que cambiar para seguir funcionando --
// solo CAROUSEL declara explícitamente 'CAROUSEL' y puebla `assetPackage`
// (además de `outputAssets`, que sigue poblado por compatibilidad con
// cualquier código que ya itere ese campo genéricamente).
export const ASSET_PACKAGE_TYPES = Object.freeze(['SINGLE', 'CAROUSEL']);

function finalAssetPackage({ requestId, mode, sourceAssets = [], derivedAssets = [], productionArtifact = null, visualProductionPackage = null, audioAssets = [], outputAssets = [], outputProfiles = [], lineage = [], status, errors = [], warnings = [], assetPackageType = 'SINGLE', assetPackage = null }) {
  return Object.freeze({
    requestId, mode,
    sourceAssets: Object.freeze([...sourceAssets]),
    derivedAssets: Object.freeze([...derivedAssets]),
    productionArtifact, visualProductionPackage,
    audioAssets: Object.freeze([...audioAssets]),
    outputAssets: Object.freeze([...outputAssets]),
    outputProfiles: Object.freeze([...outputProfiles]),
    lineage: Object.freeze(dedupeLineage(lineage)),
    status, errors: Object.freeze([...errors]), warnings: Object.freeze([...warnings]),
    assetPackageType,
    assetPackage: assetPackage ? Object.freeze({ ...assetPackage, assets: Object.freeze([...assetPackage.assets]) }) : null,
  });
}

// ---------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------

/**
 * CREATE: produce contenido nuevo. Requiere que quien llama ya haya
 * resuelto la estrategia (Campaign Mode vía campaignMode.js, o Direct
 * Instruction vía directInstructionAdapter.js) y construido el
 * ProductionArtifact/VisualProductionPackage reales (creative-intelligence/
 * production/*.js) -- este motor NUNCA redacta copy, solo coordina el
 * render+postproducción+persistencia+lineage de lo que ya está resuelto.
 *
 * @param {object} request — ContentGenerationRequest (mode:'CREATE').
 * @param {{
 *   renderArgs: object, productId: string,
 *   audioSourcePath: string, audioDurationSeconds: number, imageAssetSourcePath?: string,
 *   productionArtifact?: object|null, visualProductionPackage?: object|null,
 *   outputProfileNames: string[], postProductionOperations?: string[],
 *   projectDir: string, ffmpegBinDir?: string,
 * }} exec
 */
function runCreate(request, exec) {
  const { renderArgs, productId, audioSourcePath, audioDurationSeconds, imageAssetSourcePath = null, productionArtifact = null, visualProductionPackage = null, outputProfileNames, postProductionOperations = ['LOUDNESS_NORMALIZATION'], projectDir, ffmpegBinDir = null } = exec;

  if (!productId) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'CREATE', status: 'MISSING_PRODUCT_FACTS', errors: ['CREATE requiere "productId" real -- no se inventa un producto.'] });
  }
  if (!audioSourcePath || !existsSync(audioSourcePath)) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'CREATE', status: 'SOURCE_ASSET_REQUIRED', errors: [`CREATE requiere un Audio Asset real ya generado (voz oficial) en "${audioSourcePath}" -- no existe.`] });
  }

  let capturedImageState = null;
  if (imageAssetSourcePath) {
    try {
      capturedImageState = captureProductImageState(imageAssetSourcePath);
    } catch (err) {
      return finalAssetPackage({ requestId: request.requestId, mode: 'CREATE', status: 'SOURCE_ASSET_REQUIRED', errors: [err.message] });
    }
  }

  mkdirSync(join(projectDir, '..'), { recursive: true });

  let resultado;
  try {
    resultado = renderAndPostProduce({
      contentRequestId: request.requestId, renderArgs, audioSourcePath, audioDurationSeconds,
      imageAssetSourcePath, productId, productionArtifact, visualProductionPackage,
      outputProfileNames, postProductionOperations, projectDir, ffmpegBinDir,
    });
  } catch (err) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'CREATE', status: 'VALIDATION_FAILED', errors: [err.message] });
  }

  if (resultado.status !== 'COMPLETADO') {
    const status = resultado.status === 'ERROR_RENDER' ? 'RENDER_FAILED' : resultado.status === 'ERROR_VALIDACION' ? 'VALIDATION_FAILED' : 'RENDER_FAILED';
    return finalAssetPackage({ requestId: request.requestId, mode: 'CREATE', status, errors: [resultado.error ?? 'CREATE: el render maestro falló.'] });
  }

  // Integridad de producto: la fotografía RAW nunca debe cambiar por el hecho de renderizar.
  if (capturedImageState) assertProductImageUnchanged(capturedImageState);

  // Lineage real: el render maestro deriva de la voz + (opcional) la foto real.
  const masterHash = hashFile(resultado.masterResult.outputPath);
  const sourceIds = [hashFile(audioSourcePath)];
  if (imageAssetSourcePath) sourceIds.push(hashFile(imageAssetSourcePath));
  const lineageRecords = [recordLineage({
    derivedAssetId: masterHash, derivedAssetPath: resultado.masterResult.outputPath,
    sourceAssetIds: sourceIds, sourceAssetPaths: [audioSourcePath, ...(imageAssetSourcePath ? [imageAssetSourcePath] : [])],
    operation: 'HYPERFRAMES_RENDER', productionArtifactId: resultado.masterResult.productionArtifactId, visualProductionPackageId: resultado.masterResult.visualProductionPackageId,
  })];

  const outputAssets = [];
  for (const out of resultado.outputs) {
    if (out.status !== 'COMPLETADO' && out.status !== 'PARTIAL') continue;
    const derivedHash = hashFile(out.outputPath);
    lineageRecords.push(recordLineage({
      derivedAssetId: derivedHash, derivedAssetPath: out.outputPath, sourceAssetIds: [masterHash], sourceAssetPaths: [resultado.masterResult.outputPath],
      operation: `POSTPRODUCTION:${(out.operationsApplied ?? []).join('+')}`, outputProfileName: out.outputProfileName,
      productionArtifactId: resultado.masterResult.productionArtifactId, visualProductionPackageId: resultado.masterResult.visualProductionPackageId,
    }));
    outputAssets.push({ assetId: derivedHash, path: out.outputPath, outputProfileName: out.outputProfileName, probe: out.probe });
  }

  const huboSkips = resultado.outputs.some((o) => o.status !== 'COMPLETADO');
  return finalAssetPackage({
    requestId: request.requestId, mode: 'CREATE',
    sourceAssets: [audioSourcePath, ...(imageAssetSourcePath ? [imageAssetSourcePath] : [])],
    derivedAssets: [{ assetId: masterHash, path: resultado.masterResult.outputPath, role: 'MASTER' }],
    productionArtifact: resultado.persistedAssets?.productionArtifact ?? null,
    visualProductionPackage: resultado.persistedAssets?.visualProductionPackage ?? null,
    audioAssets: [{ path: audioSourcePath, hash: sourceIds[0] }],
    outputAssets, outputProfiles: outputProfileNames, lineage: lineageRecords,
    status: huboSkips ? 'PARTIAL' : 'COMPLETED',
    warnings: resultado.outputs.filter((o) => o.status !== 'COMPLETADO').map((o) => `${o.outputProfileName}: ${o.status}${o.reason ? ` (${o.reason})` : ''}`),
  });
}

// ---------------------------------------------------------------------
// EDIT / ENHANCE
// ---------------------------------------------------------------------

/**
 * EDIT_ENHANCE: toma UN video/asset ya existente y aplica operaciones
 * locales reales (postProduction.js) -- NUNCA regenera voz ni vuelve a
 * invocar HyperFrames (MINIMAL_REPROCESSING). El original nunca se
 * sobrescribe: siempre se escribe a un outputPath nuevo.
 *
 * @param {object} request — ContentGenerationRequest (mode:'EDIT_ENHANCE', sourceAsset requerido).
 * @param {{
 *   operations: string[], operationParams?: object, outputProfile?: object,
 *   outputDir: string, ffmpegBinDir?: string, productImagePathsToVerify?: string[],
 * }} exec
 */
function runEdit(request, exec) {
  const sourcePath = request.sourceAsset?.path;
  if (!sourcePath || !existsSync(sourcePath)) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'EDIT_ENHANCE', status: 'SOURCE_ASSET_REQUIRED', errors: [`EDIT_ENHANCE requiere "sourceAsset.path" real -- "${sourcePath}" no existe.`] });
  }
  const { operations, operationParams = {}, outputProfile = null, outputDir, ffmpegBinDir = null, productImagePathsToVerify = [] } = exec;
  if (!Array.isArray(operations) || operations.length === 0) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'EDIT_ENHANCE', status: 'VALIDATION_FAILED', errors: ['EDIT_ENHANCE requiere "operations" (al menos 1 operación real).'] });
  }

  mkdirSync(outputDir, { recursive: true });
  const sourceHashBefore = hashFile(sourcePath);
  const capturedProductImages = productImagePathsToVerify.filter((p) => existsSync(p)).map((p) => captureProductImageState(p));

  const outputPath = join(outputDir, `${sourceHashBefore.slice(0, 12)}-edited-${Date.now()}.mp4`);
  let pp;
  try {
    pp = runPostProduction({
      inputPath: sourcePath, outputPath,
      outputProfile: outputProfile ?? getOutputProfile('GENERIC_VERTICAL'),
      operations, operationParams, ffmpegBinDir,
    });
  } catch (err) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'EDIT_ENHANCE', status: 'VALIDATION_FAILED', errors: [err.message] });
  }

  // Conservar el original intacto -- verificación real, no una suposición.
  const sourceHashAfter = hashFile(sourcePath);
  if (sourceHashAfter !== sourceHashBefore) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'EDIT_ENHANCE', status: 'VALIDATION_FAILED', errors: [`EDIT_ENHANCE: el archivo fuente "${sourcePath}" cambió durante la operación -- violación de integridad, el original debe permanecer intacto.`] });
  }
  for (const state of capturedProductImages) assertProductImageUnchanged(state);

  if (pp.status === 'ERROR') {
    return finalAssetPackage({ requestId: request.requestId, mode: 'EDIT_ENHANCE', status: 'POSTPRODUCTION_FAILED', sourceAssets: [sourcePath], errors: [pp.error] });
  }

  const derivedHash = hashFile(outputPath);
  const lineageRecord = recordLineage({
    derivedAssetId: derivedHash, derivedAssetPath: outputPath, sourceAssetIds: [sourceHashBefore], sourceAssetPaths: [sourcePath],
    operation: `EDIT:${pp.operationsApplied.join('+')}`,
  });

  const noSoportadas = (pp.operationsSkipped ?? []).filter((s) => s.reason === 'UNSUPPORTED_LOCAL_OPERATION' || s.reason === 'NOT_IMPLEMENTED_YET');
  const faltanAssets = (pp.operationsSkipped ?? []).filter((s) => s.reason === 'SOURCE_ASSET_REQUIRED');

  let status = 'COMPLETED';
  if (pp.operationsApplied.length === 0) status = noSoportadas.length > 0 ? 'UNSUPPORTED_LOCAL_OPERATION' : 'SOURCE_ASSET_REQUIRED';
  else if (pp.status === 'PARTIAL') status = 'PARTIAL';

  return finalAssetPackage({
    requestId: request.requestId, mode: 'EDIT_ENHANCE',
    sourceAssets: [sourcePath],
    derivedAssets: [{ assetId: derivedHash, path: outputPath, role: 'EDITED' }],
    outputAssets: [{ assetId: derivedHash, path: outputPath, probe: pp.probe }],
    lineage: [lineageRecord],
    status,
    errors: pp.status === 'ERROR' ? [pp.error] : [],
    warnings: [...noSoportadas, ...faltanAssets].map((s) => `${s.operation}: ${s.reason}${s.detail ? ` — ${s.detail}` : ''}`),
  });
}

// ---------------------------------------------------------------------
// ADAPT
// ---------------------------------------------------------------------

/**
 * ADAPT: toma UN video ya existente y deriva versiones para N Output
 * Profiles reales -- NUNCA regenera voz, imágenes ni video (solo
 * PostProduction sobre el mismo master real). Reutiliza
 * deriveOutputsForProfiles() (contentOrchestrator.js) sin duplicarla.
 *
 * @param {object} request — ContentGenerationRequest (mode:'ADAPT', sourceAsset requerido).
 * @param {{ postProductionOperations?: string[], operationParams?: object, outputDir: string, ffmpegBinDir?: string }} exec
 */
function runAdapt(request, exec) {
  const sourcePath = request.sourceAsset?.path;
  if (!sourcePath || !existsSync(sourcePath)) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'ADAPT', status: 'SOURCE_ASSET_REQUIRED', errors: [`ADAPT requiere "sourceAsset.path" real -- "${sourcePath}" no existe.`] });
  }
  if (request.outputProfiles !== 'ALL_VIDEO_PROFILES' && (!Array.isArray(request.outputProfiles) || request.outputProfiles.length === 0)) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'ADAPT', status: 'VALIDATION_FAILED', errors: ['ADAPT requiere al menos 1 Output Profile real (ver outputProfiles.js) o "todas las versiones".'] });
  }

  const { postProductionOperations = ['LOUDNESS_NORMALIZATION', 'RESIZE_TO_PROFILE'], operationParams = {}, outputDir, ffmpegBinDir = null } = exec;
  mkdirSync(outputDir, { recursive: true });

  const sourceHash = hashFile(sourcePath);
  let outputs;
  try {
    outputs = deriveOutputsForProfiles({ masterPath: sourcePath, outputProfileNames: request.outputProfiles, postProductionOperations, operationParams, outputDir, ffmpegBinDir });
  } catch (err) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'ADAPT', status: 'VALIDATION_FAILED', errors: [err.message] });
  }

  const lineageRecords = [];
  const outputAssets = [];
  for (const out of outputs) {
    if (out.status !== 'COMPLETADO' && out.status !== 'PARTIAL') continue;
    const derivedHash = hashFile(out.outputPath);
    lineageRecords.push(recordLineage({
      derivedAssetId: derivedHash, derivedAssetPath: out.outputPath, sourceAssetIds: [sourceHash], sourceAssetPaths: [sourcePath],
      operation: `ADAPT:${(out.operationsApplied ?? []).join('+')}`, outputProfileName: out.outputProfileName,
    }));
    outputAssets.push({ assetId: derivedHash, path: out.outputPath, outputProfileName: out.outputProfileName, probe: out.probe });
  }

  const fallidos = outputs.filter((o) => o.status !== 'COMPLETADO' && o.status !== 'PARTIAL');
  const parciales = outputs.filter((o) => o.status === 'PARTIAL');
  let status = 'COMPLETED';
  if (outputAssets.length === 0) status = 'RENDER_FAILED';
  else if (fallidos.length > 0 || parciales.length > 0) status = 'PARTIAL';

  return finalAssetPackage({
    requestId: request.requestId, mode: 'ADAPT',
    sourceAssets: [sourcePath],
    outputAssets, outputProfiles: request.outputProfiles === 'ALL_VIDEO_PROFILES' ? outputs.map((o) => o.outputProfileName) : request.outputProfiles,
    lineage: lineageRecords,
    status,
    warnings: [...fallidos, ...parciales].map((o) => `${o.outputProfileName}: ${o.status}${o.reason ? ` (${o.reason})` : ''}`),
    errors: fallidos.filter((o) => o.error).map((o) => `${o.outputProfileName}: ${o.error}`),
  });
}

// ---------------------------------------------------------------------
// CAROUSEL (Bloque 2 — Carousel real)
// ---------------------------------------------------------------------

/**
 * CAROUSEL: produce N slide assets reales (1 request -> N imágenes reales)
 * a partir de contenido YA resuelto (carouselCompositor.js#buildCarouselSlidesContent,
 * o slides explícitos provistos por quien llama) -- reutiliza el MISMO
 * renderer real (video-production/src/carouselRenderer.js -> HyperFrames
 * `snapshot`), nunca un renderer paralelo. Igual que CREATE, este motor
 * nunca redacta copy: `slides` debe llegar ya resuelto.
 *
 * @param {object} request — ContentGenerationRequest (mode:'CAROUSEL').
 * @param {{
 *   slides: Array<{headline:string, body?:string|null, cta?:string|null, backgroundImageSourcePath?:string|null}>,
 *   projectDir: string, brandColors?: object,
 * }} exec
 */
function runCreateCarousel(request, exec) {
  const { slides, projectDir, brandColors = undefined } = exec;
  if (!Array.isArray(slides) || slides.length === 0) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'CAROUSEL', status: 'VALIDATION_FAILED', errors: ['CAROUSEL requiere "slides" (al menos 1, ya resuelto por carouselCompositor.js) -- el motor nunca redacta el contenido de los slides.'] });
  }

  const capturedImageStates = slides
    .filter((s) => s.backgroundImageSourcePath)
    .map((s) => {
      try {
        return captureProductImageState(s.backgroundImageSourcePath);
      } catch (err) {
        return { error: err };
      }
    });
  const errorCaptura = capturedImageStates.find((c) => c?.error);
  if (errorCaptura) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'CAROUSEL', status: 'SOURCE_ASSET_REQUIRED', errors: [errorCaptura.error.message] });
  }

  mkdirSync(join(projectDir, '..'), { recursive: true });

  let resultados;
  try {
    resultados = renderCarousel({ projectDir, slides, ...(brandColors ? { brandColors } : {}) });
  } catch (err) {
    return finalAssetPackage({ requestId: request.requestId, mode: 'CAROUSEL', status: 'VALIDATION_FAILED', errors: [err.message] });
  }

  for (const state of capturedImageStates) if (!state.error) assertProductImageUnchanged(state);

  const lineageRecords = [];
  const outputAssets = [];
  const packageAssets = [];
  for (const r of resultados) {
    if (r.status !== 'COMPLETADO') continue;
    const sourceAssetPaths = slides[r.slideIndex - 1].backgroundImageSourcePath ? [slides[r.slideIndex - 1].backgroundImageSourcePath] : [];
    lineageRecords.push(recordLineage({
      derivedAssetId: r.assetId, derivedAssetPath: r.outputPath,
      sourceAssetIds: sourceAssetPaths.map((p) => hashFile(p)), sourceAssetPaths,
      operation: `CAROUSEL_SLIDE:${r.slideIndex}/${r.totalSlides}`,
    }));
    const entry = { assetId: r.assetId, path: r.outputPath, slideIndex: r.slideIndex, totalSlides: r.totalSlides, width: r.width, height: r.height };
    outputAssets.push(entry);
    packageAssets.push({ ...entry, type: 'IMAGE', role: 'CAROUSEL_SLIDE' });
  }

  const fallidos = resultados.filter((r) => r.status !== 'COMPLETADO');
  let status = 'COMPLETED';
  if (outputAssets.length === 0) status = 'RENDER_FAILED';
  else if (fallidos.length > 0) status = 'PARTIAL';

  return finalAssetPackage({
    requestId: request.requestId, mode: 'CAROUSEL',
    sourceAssets: slides.filter((s) => s.backgroundImageSourcePath).map((s) => s.backgroundImageSourcePath),
    outputAssets, lineage: lineageRecords, status,
    assetPackageType: 'CAROUSEL',
    assetPackage: { type: 'CAROUSEL', assets: packageAssets },
    warnings: fallidos.map((r) => `slide ${r.slideIndex}/${r.totalSlides}: ${r.status}${r.error ? ` — ${r.error}` : ''}`),
    errors: fallidos.length === resultados.length ? fallidos.map((r) => r.error).filter(Boolean) : [],
  });
}

// ---------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------

/**
 * Punto de entrada único del Content Generation Engine. Dispatch
 * explícito por request.mode (ya clasificado por
 * contentGenerationRequest.js#parseContentGenerationRequest) -- nunca
 * intenta re-adivinar el modo aquí.
 *
 * @param {object} request — ContentGenerationRequest real.
 * @param {object} exec — parámetros de ejecución específicos del modo (ver runCreate/runEdit/runAdapt).
 */
export function generateContent(request, exec = {}) {
  if (!request?.mode) throw new Error('generateContent: "request" debe ser un ContentGenerationRequest real (ver contentGenerationRequest.js#parseContentGenerationRequest).');
  switch (request.mode) {
    case 'CREATE': return runCreate(request, exec);
    case 'EDIT_ENHANCE': return runEdit(request, exec);
    case 'ADAPT': return runAdapt(request, exec);
    case 'CAROUSEL': return runCreateCarousel(request, exec);
    default:
      throw new Error(`generateContent: modo desconocido "${request.mode}".`);
  }
}

export { runCreate, runEdit, runAdapt, runCreateCarousel };
