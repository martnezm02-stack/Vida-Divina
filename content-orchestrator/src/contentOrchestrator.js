// contentOrchestrator.js — Parte 3/9/12. El COORDINADOR (nunca el cerebro,
// nunca el renderer): recibe un ContentRequest ya resuelto (Campaign Mode o
// Direct Instruction) + los assets/copy reales que cada modo requiere, y
// encadena:
//
//   ContentRequest -> (ya resuelto por campaignMode.js / directInstructionAdapter.js)
//     -> AssetPackage (assetPackage.js, reutiliza assetRegistry.js)
//     -> HyperFrames (video-production/src/hyperframesRenderer.js, SIN reimplementar)
//     -> PostProduction por cada Output Profile pedido (postProduction.js)
//     -> Final Asset Package (uno o más MP4 reales, uno por plataforma)
//
// REGLA CENTRAL (Parte 17): no duplica CreativeCell, ProductionArtifact,
// VisualProductionPackage, Asset Registry, Voice Engine, Audio Asset
// Adapter, ni HyperFrames -- los importa y coordina tal cual.
//
// SEPARACIÓN CONTENIDO/PLATAFORMA (adenda "OUTPUT PROFILES
// MULTIPLATAFORMA"): HyperFrames renderiza UNA sola vez, en el aspect
// ratio "maestro" (9:16, el que ya soporta el compositor real). Cada
// Output Profile adicional se deriva de ESE MISMO render real vía
// PostProduction (RESIZE_TO_PROFILE + LOUDNESS_NORMALIZATION) -- nunca
// vuelve a ejecutar Creative Intelligence ni a regenerar voz por cada
// plataforma.

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { renderVisualProductionPackage } from '../../video-production/src/hyperframesRenderer.js';
import { createAssetPackage } from './assetPackage.js';
import { getOutputProfile, OUTPUT_PROFILE_NAMES } from './outputProfiles.js';
import { runPostProduction } from './postProduction.js';
import { deriveBrandSceneColors, assertBrandAvoidCompliance } from './brandVisualSystem.js';
import { saveProductionArtifact, productionArtifactExists } from '../../creative-intelligence/production/productionArtifactStore.js';
import { saveVisualProductionPackage, visualProductionPackageExists } from '../../creative-intelligence/production/visualProductionPackageStore.js';

const MASTER_OUTPUT_PROFILE = 'GENERIC_VERTICAL'; // 1080x1920 -- el aspect ratio que el compositor HyperFrames de este proyecto ya soporta de forma nativa (ver hyperframesRenderer.js#construirComposicionHtml).

/** VisualProductionPackage real (creative-intelligence/production/visualProductionPackage.js) -> argumentos planos que renderVisualProductionPackage() (HyperFrames) ya espera. Mapeo explícito y determinista, documentado -- no hay campo "hookText" en VisualProductionPackage, así que este es el único lugar del sistema donde esa traducción ocurre. */
function visualProductionPackageToRenderArgs(vpp, productFacts) {
  return {
    hookText: vpp.screenText[0],
    productTitle: productFacts?.nombreComercial ?? vpp.subjectDescription,
    productBody: vpp.screenText[1] ?? vpp.caption,
    ctaText: vpp.cta,
    whatsappLabel: vpp.whatsappCta,
    voiceoverLines: vpp.voiceover,
  };
}

/** Divide un voiceoverText literal (Direct Instruction) en líneas por frase, SOLO para el ritmo de subtítulos -- nunca cambia ni una palabra, solo dónde caen los cortes de oración (igual criterio que ya usa distribuirSubtitulos aguas abajo). */
function dividirEnFrases(texto) {
  const frases = texto.match(/[^.!?]+[.!?]+/g);
  return frases ? frases.map((f) => f.trim()) : [texto];
}

function productionBriefToRenderArgs(brief, productFacts) {
  const sceneProduct = brief.scenes.find((s) => s.role === 'product');
  return {
    hookText: brief.screenText[0] ?? brief.voiceoverText,
    productTitle: productFacts?.nombreComercial ?? 'Vida Divina',
    productBody: sceneProduct?.visualAssetId ? null : (productFacts?.beneficios ?? brief.cta),
    ctaText: brief.cta,
    whatsappLabel: 'WhatsApp',
    voiceoverLines: dividirEnFrases(brief.voiceoverText),
  };
}

/**
 * Persiste, si se proveen, el ProductionArtifact y/o VisualProductionPackage
 * REALES (objetos completos de creative-intelligence/production/*.js) vía
 * los stores nuevos de esta fase -- nunca genera un id nuevo, nunca
 * reconstruye el objeto, solo lo guarda tal cual llegó. Idempotente: si el
 * id ya fue guardado antes (misma ejecución repetida, o el llamador ya lo
 * había persistido), no vuelve a intentar guardarlo ni lanza -- lo reporta
 * como `alreadyExisted: true` en vez de fallar (evitar que una repetición
 * legítima de un render con el mismo objeto real rompa el flujo).
 */
export function persistProductionAssets({ productionArtifact = null, visualProductionPackage = null }) {
  const result = {};
  if (productionArtifact) {
    result.productionArtifact = productionArtifactExists(productionArtifact.productionArtifactId)
      ? Object.freeze({ productionArtifactId: productionArtifact.productionArtifactId, alreadyExisted: true })
      : saveProductionArtifact(productionArtifact);
  }
  if (visualProductionPackage) {
    result.visualProductionPackage = visualProductionPackageExists(visualProductionPackage.visualProductionPackageId)
      ? Object.freeze({ visualProductionPackageId: visualProductionPackage.visualProductionPackageId, alreadyExisted: true })
      : saveVisualProductionPackage(visualProductionPackage);
  }
  return Object.freeze(result);
}

/**
 * Deriva un Final Asset por cada Output Profile pedido, a partir de UN
 * archivo maestro ya real en disco (`masterPath`) -- vía PostProduction,
 * sin volver a invocar HyperFrames. Extraído de renderAndPostProduce()
 * (Content Generation Engine, Parte 3) para que ADAPT mode
 * (contentGenerationEngine.js) pueda reutilizarlo EXACTAMENTE igual sobre
 * un MP4 arbitrario ya existente, sin duplicar esta lógica.
 *
 * @param {{
 *   masterPath: string, outputProfileNames: string[]|'ALL_VIDEO_PROFILES',
 *   postProductionOperations?: string[], operationParams?: object,
 *   outputDir: string, ffmpegBinDir?: string,
 * }} args
 * @returns {Array<{outputProfileName:string, status:string, [k:string]:*}>}
 */
export function deriveOutputsForProfiles({ masterPath, outputProfileNames, postProductionOperations = ['LOUDNESS_NORMALIZATION'], operationParams = {}, outputDir, ffmpegBinDir = null }) {
  const nombres = outputProfileNames === 'ALL_VIDEO_PROFILES'
    ? OUTPUT_PROFILE_NAMES.filter((n) => getOutputProfile(n).kind === 'VIDEO')
    : outputProfileNames;
  if (!Array.isArray(nombres) || nombres.length === 0) {
    throw new Error('deriveOutputsForProfiles: "outputProfileNames" debe tener al menos 1 perfil real (ver outputProfiles.js).');
  }
  const perfiles = nombres.map((n) => ({ name: n, profile: getOutputProfile(n) }));

  return perfiles.map(({ name, profile }) => {
    if (profile.kind !== 'VIDEO') {
      return { outputProfileName: name, status: 'SKIPPED_NON_VIDEO_PROFILE', reason: `outputProfiles.js#${name} es kind:"${profile.kind}" — la generación de CAROUSEL está fuera de alcance de esta fase (arquitectura preparada, ver reporte).` };
    }
    const outputPath = join(outputDir, `${randomUUID()}-${name}.mp4`);
    const pp = runPostProduction({
      inputPath: masterPath,
      outputPath,
      outputProfile: profile,
      operations: postProductionOperations,
      operationParams,
      ffmpegBinDir,
    });
    return { outputProfileName: name, ...pp };
  });
}

/**
 * Ejecuta el render REAL de un ProductionRequest ya resuelto (Campaign o
 * Direct Instruction) hacia UN MP4 maestro (GENERIC_VERTICAL), registra el
 * Asset Package real, y deriva un Final Asset Package por cada Output
 * Profile pedido vía PostProduction -- sin volver a renderizar con
 * HyperFrames por cada plataforma.
 *
 * @param {{
 *   contentRequestId: string,
 *   renderArgs: {hookText,productTitle,productBody,ctaText,whatsappLabel,voiceoverLines},
 *   audioSourcePath: string, audioDurationSeconds: number,
 *   imageAssetSourcePath?: string, productId: string,
 *   productionArtifact?: object|null, visualProductionPackage?: object|null,
 *     — objetos REALES (creative-intelligence/production/*.js); si se proveen,
 *       se persisten vía los stores nuevos (Parte 8) y sus ids reales
 *       (productionArtifactId/visualProductionPackageId) tienen prioridad
 *       sobre los ids planos de abajo -- nunca se inventa un id nuevo.
 *   visualProductionPackageId?: string, productionArtifactId?: string, audioAssetId?: string,
 *     — usados tal cual (sin persistencia) cuando no hay objeto real disponible
 *       (ej. Direct Instruction Mode, que no pasa por Creative Intelligence).
 *   outputProfileNames: string[], postProductionOperations?: string[],
 *   projectDir: string, ffmpegBinDir?: string,
 * }} args
 */
export function renderAndPostProduce({
  contentRequestId, renderArgs, audioSourcePath, audioDurationSeconds,
  imageAssetSourcePath = null, productId,
  productionArtifact = null, visualProductionPackage = null,
  visualProductionPackageId = null, productionArtifactId = null, audioAssetId = null,
  outputProfileNames, postProductionOperations = ['LOUDNESS_NORMALIZATION'],
  projectDir, ffmpegBinDir = null,
}) {
  if (!Array.isArray(outputProfileNames) || outputProfileNames.length === 0) {
    throw new Error('renderAndPostProduce: "outputProfileNames" debe tener al menos 1 perfil real (ver outputProfiles.js).');
  }

  // --- Persistencia real (Fase "Persistencia de Production Artifacts y
  // Visual Production Packages") -- solo si se proveyó el objeto real;
  // deriva los ids desde el objeto persistido, nunca desde un string aparte.
  const persistedAssets = persistProductionAssets({ productionArtifact, visualProductionPackage });
  const finalProductionArtifactId = productionArtifact?.productionArtifactId ?? productionArtifactId;
  const finalVisualProductionPackageId = visualProductionPackage?.visualProductionPackageId ?? visualProductionPackageId;
  // Validado temprano -- ningún perfil desconocido silenciosamente ignorado.
  outputProfileNames.forEach((n) => getOutputProfile(n));

  assertBrandAvoidCompliance([renderArgs.hookText, renderArgs.productTitle, renderArgs.productBody, renderArgs.ctaText].filter(Boolean).join(' \n '), 'renderArgs combinado');

  // --- Asset Package real (Parte 5) ---
  const entries = [
    { sourcePath: audioSourcePath, type: 'AUDIO_VOICE', role: 'VOICEOVER', productId },
  ];
  if (imageAssetSourcePath) {
    entries.push({ sourcePath: imageAssetSourcePath, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY', productId });
  }
  const assetPackage = createAssetPackage({ contentRequestId, entries });
  if (!assetPackage.hasAllAssetsAvailable) {
    throw new Error(`renderAndPostProduce: el Asset Package tiene assets requeridos faltantes: ${assetPackage.missingAssetPaths.join(', ')} — no se renderiza sin los assets reales.`);
  }

  // --- HyperFrames: UN SOLO render maestro (Parte 12 / adenda) ---
  const masterProfile = getOutputProfile(MASTER_OUTPUT_PROFILE);
  const imageEntry = assetPackage.entries.find((e) => e.type === 'PRODUCT_IMAGE') ?? null;
  const masterResult = renderVisualProductionPackage({
    projectDir,
    visualProductionPackageId: finalVisualProductionPackageId,
    productionArtifactId: finalProductionArtifactId,
    audioAssetId,
    audioSourcePath,
    audioDurationSeconds,
    imageAsset: imageEntry ? { assetId: imageEntry.assetId, sourcePath: imageEntry.sourcePath } : null,
    hookText: renderArgs.hookText,
    productTitle: renderArgs.productTitle,
    productBody: renderArgs.productBody,
    ctaText: renderArgs.ctaText,
    whatsappLabel: renderArgs.whatsappLabel,
    voiceoverLines: renderArgs.voiceoverLines,
    ffmpegBinDir,
    brandColors: deriveBrandSceneColors(),
  });

  if (masterResult.status !== 'COMPLETADO') {
    return { status: masterResult.status, error: masterResult.error, assetPackage, masterResult, outputs: [] };
  }

  // --- PostProduction: un Final Asset por Output Profile pedido, todos derivados del mismo render maestro ---
  const outputs = deriveOutputsForProfiles({
    masterPath: masterResult.outputPath,
    outputProfileNames,
    postProductionOperations,
    outputDir: join(projectDir, '..'),
    ffmpegBinDir,
  });

  return Object.freeze({
    status: 'COMPLETADO',
    assetPackage,
    persistedAssets,
    masterResult,
    outputs: Object.freeze(outputs),
  });
}

export { visualProductionPackageToRenderArgs, productionBriefToRenderArgs, dividirEnFrases, MASTER_OUTPUT_PROFILE };

// deriveOutputsForProfiles y persistProductionAssets ya se exportan en su
// declaración (`export function`) arriba -- no se re-exportan aquí para
// evitar una lista de exports desincronizable en dos lugares.
