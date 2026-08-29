// generation.js — endpoints POST reales hacia el Content Generation
// Engine. Cada handler solo: valida la solicitud contra assets/perfiles
// REALES ya conocidos, arma los argumentos, y llama a generateContent()
// (content-orchestrator/src/contentGenerationEngine.js) -- nunca
// reimplementa CREATE/EDIT/ADAPT en el servidor del dashboard.

import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sendJson, badRequest, serverError, readJsonBody, notFound } from '../lib/http.js';
import { resolveSafeMediaPath, toMediaUrl, PROJECT_ROOT } from '../lib/safePaths.js';
import { getProduct } from '../lib/productCatalog.js';
import { listExistingAudioAssets, generateNewVoiceover } from '../lib/voiceEngineClient.js';
import { parseContentGenerationRequest } from '../../../content-orchestrator/src/contentGenerationRequest.js';
import { generateContent } from '../../../content-orchestrator/src/contentGenerationEngine.js';
import { dividirEnFrases } from '../../../content-orchestrator/src/contentOrchestrator.js';
import { resolveCampaignCreativeCell, MissingStrategicMatchError } from '../../../content-orchestrator/src/campaignMode.js';
import { getOutputProfile } from '../../../content-orchestrator/src/outputProfiles.js';
import { buildCreativeProposal } from '../../../content-orchestrator/src/autonomousCreate.js';
import { buildHypothesisExperiment } from '../../../content-orchestrator/src/hypothesisCreativeEngine.js';
import { buildCampaignIntent, computeCampaignId } from '../../../content-orchestrator/src/campaignIntent.js';
import { saveBatch, listBatchesForCampaign, getCampaignBatchState, getBatch } from '../../../creative-intelligence/src/hypothesisBatchStore.js';
import { produceCreative } from '../../../content-orchestrator/src/creativeProductionOrchestrator.js';
import { previewVisualRecommendation, buildVisualStrategy } from '../../../content-orchestrator/src/creativeDirector.js';
import { buildScenePlan } from '../../../content-orchestrator/src/scenePlanner.js';
import { previewStructureOptions, buildCreativeStructure, listCompatibleStructures } from '../../../content-orchestrator/src/creativeStructureEngine.js';
import { listAvailableImageModels } from '../../../content-orchestrator/src/imageModelCatalog.js';
import { saveProductionJob } from '../../../content-orchestrator/src/productionJobStore.js';
import { buildDisplayName } from '../../../content-orchestrator/src/displayName.js';
import { buildProductGroundedEvidence } from '../../../content-orchestrator/src/productGroundedEvidence.js';
import { buildVideoScript, assertVoiceoverTextSafe, STATIC_FORMATS } from '../../../content-orchestrator/src/videoScriptGenerator.js';
import { buildCarouselSlidesContent } from '../../../content-orchestrator/src/carouselCompositor.js';
import { loadProductFacts } from '../../../content-orchestrator/src/productFactsLoader.js';
import { publish, listPublishTargets } from '../../../content-orchestrator/src/publishing/publishingService.js';
import { mediaHostingService } from '../lib/schedulerInstance.js';
import { selectCreativeAngle } from '../../../content-orchestrator/src/creativeAngleSelector.js';
import { selectHook, scoreHookText } from '../../../content-orchestrator/src/hookIntelligence.js';
import { selectRelevantClaims } from '../../../content-orchestrator/src/claimRelevance.js';
import { evaluateCreativeProposal } from '../../../content-orchestrator/src/creativeQualityAutoQA.js';
import { computeDiversityScore } from '../../../content-orchestrator/src/creativeVariantDiversity.js';

const FFMPEG_BIN_DIR = process.env.FFMPEG_BIN_DIR
  ?? 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const DASHBOARD_OUTPUT_ROOT = join(PROJECT_ROOT, 'video-production', 'dashboard-outputs');
// Creative Factory (2026-08-23): tamaño de batch por defecto cuando el
// Dashboard no manda "variantCount" explícito -- configurable por
// solicitud (Paso 6), este es solo el valor por defecto razonable.
const DEFAULT_BATCH_SIZE = 10;
// Corrección "Evolución integral del Creative Director" (2026-08-28, Paso
// 1/8 del encargo): 3 candidatos reales dejaban muy poco margen real para
// que selectCreativeAngle() (creativeAngleSelector.js) encontrara una
// variante real cuyo angle/hook coincidiera de verdad con userInstruction
// (7 ángulos × 11 tipos de hook posibles, ver marketingPlaybook.js) --
// 8 candidatos reales (dentro del mínimo/máximo real de
// buildHypothesisExperiment, 3..50) dan margen real sin generar
// desperdicio excesivo. Este flujo sigue exponiendo/usando SOLO UNA
// (variantIndex 0, la elegida por el selector real), nunca las demás.
const DIRECT_PROPOSAL_VARIANT_COUNT = 8;

function translateFinalAssetPackageForClient(pkg) {
  return {
    ...pkg,
    derivedAssets: pkg.derivedAssets.map((a) => ({ ...a, mediaUrl: toMediaUrl(a.path) })),
    outputAssets: pkg.outputAssets.map((a) => ({ ...a, mediaUrl: toMediaUrl(a.path) })),
    sourceAssets: pkg.sourceAssets.map((p) => ({ path: p, mediaUrl: toMediaUrl(p) })),
    // Bloque 2 (Carousel real) -- assetPackage.assets solo existe cuando assetPackageType es 'CAROUSEL'; para 'SINGLE' queda null tal cual.
    assetPackage: pkg.assetPackage ? { ...pkg.assetPackage, assets: pkg.assetPackage.assets.map((a) => ({ ...a, mediaUrl: toMediaUrl(a.path) })) } : null,
  };
}

export async function handleCreate(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }

  const {
    mode = 'CAMPAIGN', productId, hookText, ctaText, voiceoverText, productBody, audioSource, audioAssetPath,
    imageAssetPath, outputProfileNames, rawText, productionArtifact, visualProductionPackage,
    voiceoverSource = 'GENERATED', audioTextMismatch = false,
  } = body;

  if (!productId?.trim()) { badRequest(res, 'CREATE: "productId" es obligatorio -- no se inventa un producto.'); return; }
  if (!hookText?.trim() || !ctaText?.trim() || !voiceoverText?.trim()) {
    badRequest(res, 'CREATE: "hookText", "ctaText" y "voiceoverText" son obligatorios -- el motor nunca redacta el guion.');
    return;
  }
  // Auditoría "Video Workspace + Voice Engine" (2026-08-23), Parte 3: los
  // mismos guards de Claim Safety que ya corren sobre el copy generado
  // deben correr también sobre el voiceoverText real que se envía a Voice
  // Engine -- generado O editado por el usuario (REGLA FUNDAMENTAL: el
  // texto editado es la fuente de verdad, así que también debe pasar por
  // aquí, nunca solo el texto original). Antes de llamar a Voice Engine,
  // nunca después -- evita gastar una generación real de audio sobre un
  // texto que de todas formas se va a rechazar.
  try {
    assertVoiceoverTextSafe(voiceoverText, 'voiceoverText');
  } catch (err) {
    sendJson(res, 200, { status: 'VALIDATION_FAILED', errors: [err.message] });
    return;
  }
  // Sin fotografía real, la escena de producto usa un tratamiento tipográfico
  // (hyperframesRenderer.js#construirComposicionHtml) que requiere un texto real
  // -- nunca se rellena solo, lo escribe quien llama, igual que hook/CTA/voiceover.
  if (!imageAssetPath && !productBody?.trim()) {
    badRequest(res, 'CREATE: sin "imageAssetPath" real, se requiere "productBody" (texto real para la escena de producto sin fotografía) -- el motor nunca lo inventa.');
    return;
  }
  if (!Array.isArray(outputProfileNames) || outputProfileNames.length === 0) {
    badRequest(res, 'CREATE: se requiere al menos 1 Output Profile real.');
    return;
  }
  try {
    outputProfileNames.forEach((n) => getOutputProfile(n));
  } catch (err) {
    badRequest(res, err.message);
    return;
  }

  const product = getProduct(productId);
  const productTitle = product?.nombreComercial ?? productId;

  let campaignResolution = null;
  if (mode === 'CAMPAIGN') {
    try {
      campaignResolution = resolveCampaignCreativeCell({ productId });
    } catch (err) {
      if (!(err instanceof MissingStrategicMatchError)) {
        // Auditoría "Video Workspace + Voice Engine" (2026-08-23): contrato
        // real es "errors" (arreglo, ver finalAssetPackage() en
        // contentGenerationEngine.js) -- "error" singular aquí era una
        // inconsistencia real que la UI corregida ya no busca.
        sendJson(res, 200, { status: 'VALIDATION_FAILED', errors: [err.message] });
        return;
      }
      // Corrección (Fase 16, Parte 10): en este punto hookText/ctaText/
      // voiceoverText YA fueron validados como obligatorios (arriba, sin
      // excepción por modo) -- el usuario ya proveyó su copy real.
      // campaignResolution es exclusivamente metadata informativa para la
      // respuesta (ver más abajo, "campaignResolution:" en el JSON final);
      // renderArgs nunca la usa para producir el contenido. Bloquear el
      // render aquí sería un gate mal aplicado sobre un dato que ni
      // siquiera se necesita -- se degrada a null y se continúa, mismo
      // comportamiento que mode 'DIRECT' ya tenía. El gate SÍ sigue
      // activo cuando el copy no fue provisto: eso ya se rechazó arriba,
      // antes de llegar aquí, sin excepción.
      campaignResolution = null;
    }
  }

  // Resuelve el Audio Asset real -- SOLO desde la lista real ya conocida (nunca una ruta arbitraria del cliente) o generación real vía Voice Engine.
  let audioSourcePath;
  let audioDurationSeconds;
  if (audioSource === 'generate') {
    try {
      const resultado = await generateNewVoiceover({ text: voiceoverText });
      audioSourcePath = resultado.resolvedPath;
      audioDurationSeconds = resultado.durationSeconds;
    } catch (err) {
      sendJson(res, 200, { status: 'SOURCE_ASSET_REQUIRED', error: err.message });
      return;
    }
  } else {
    const existentes = listExistingAudioAssets();
    const encontrado = existentes.find((a) => a.path === audioAssetPath);
    if (!encontrado) { badRequest(res, `CREATE: "audioAssetPath" debe ser uno de los Audio Assets reales ya listados en /api/audio-assets (recibido: ${audioAssetPath}).`); return; }
    audioSourcePath = encontrado.path;
    audioDurationSeconds = encontrado.durationSeconds;
  }

  let imageAssetSourcePath = null;
  if (imageAssetPath) {
    const rawReal = (product?.rawAssets ?? []).find((a) => a.sourcePath === imageAssetPath);
    if (!rawReal) { badRequest(res, `CREATE: "imageAssetPath" debe ser una fotografía RAW real ya registrada para "${productId}" (recibido: ${imageAssetPath}).`); return; }
    imageAssetSourcePath = rawReal.sourcePath;
  }

  const request = parseContentGenerationRequest({ rawText: rawText || `Crear contenido de ${productTitle}.`, productId, forcedMode: 'CREATE' });
  const renderArgs = {
    hookText, productTitle, productBody: imageAssetSourcePath ? null : productBody, ctaText, whatsappLabel: 'WhatsApp',
    voiceoverLines: dividirEnFrases(voiceoverText),
  };

  const projectDir = join(DASHBOARD_OUTPUT_ROOT, `create-${randomUUID()}`, 'master-project');
  try {
    const result = generateContent(request, {
      renderArgs, productId, audioSourcePath, audioDurationSeconds, imageAssetSourcePath,
      productionArtifact: productionArtifact ?? null, visualProductionPackage: visualProductionPackage ?? null,
      outputProfileNames, projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    // Fix "Audio Source / Voiceover Consistency" (2026-08-23), Parte 5:
    // validación de consistencia NO bloqueante -- reutiliza el contrato
    // "warnings" ya existente de finalAssetPackage() (content-orchestrator/
    // src/contentGenerationEngine.js), sin inventar un contrato nuevo.
    // audioTextMismatch lo calcula el Dashboard (app.js#updateAudioConsistencyUI),
    // que sí conoce el estado real de la sesión de edición (qué texto
    // estaba vigente cuando se eligió "existing" a propósito) -- el
    // servidor, sin estado de sesión, no puede reconstruir esa relación
    // sin este flag explícito (Parte 6: "no falsificar la relación").
    const warnings = [...(result.warnings ?? [])];
    if (audioSource !== 'generate' && audioTextMismatch === true) {
      warnings.push('VOICEOVER_AUDIO_MISMATCH: el texto del voice-over no corresponde necesariamente al audio existente seleccionado. Genera un nuevo audio o confirma explícitamente que deseas utilizar el audio existente.');
    }
    sendJson(res, 200, {
      ...translateFinalAssetPackageForClient(result),
      warnings,
      campaignResolution: campaignResolution ? { creativeCellId: campaignResolution.creativeCell.creativeCellId, personaName: campaignResolution.persona.name, matchScore: campaignResolution.matchScore } : null,
      voiceoverSource: voiceoverSource === 'USER_EDITED' ? 'USER_EDITED' : 'GENERATED',
    });
  } catch (err) {
    serverError(res, err);
  }
}

export async function handleEdit(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { sourceAssetPath, operations, operationParams } = body;

  const realPath = resolveSafeMediaPath(sourceAssetPath);
  if (!realPath) { badRequest(res, `EDIT: "sourceAssetPath" no es un archivo real dentro de las raíces permitidas.`); return; }
  if (!Array.isArray(operations) || operations.length === 0) { badRequest(res, 'EDIT: se requiere al menos 1 operación.'); return; }

  const request = parseContentGenerationRequest({ rawText: 'Mejora este video.', sourceAsset: { type: 'VIDEO', path: realPath }, forcedMode: 'EDIT_ENHANCE' });
  const outputDir = join(DASHBOARD_OUTPUT_ROOT, `edit-${randomUUID()}`);
  try {
    const result = generateContent(request, { operations, operationParams: operationParams ?? {}, outputDir, ffmpegBinDir: FFMPEG_BIN_DIR });
    sendJson(res, 200, translateFinalAssetPackageForClient(result));
  } catch (err) {
    serverError(res, err);
  }
}

export async function handleAdapt(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { sourceAssetPath, outputProfileNames, postProductionOperations } = body;

  const realPath = resolveSafeMediaPath(sourceAssetPath);
  if (!realPath) { badRequest(res, `ADAPT: "sourceAssetPath" no es un archivo real dentro de las raíces permitidas.`); return; }
  if (!Array.isArray(outputProfileNames) || outputProfileNames.length === 0) { badRequest(res, 'ADAPT: se requiere al menos 1 Output Profile real.'); return; }
  try {
    outputProfileNames.forEach((n) => getOutputProfile(n));
  } catch (err) {
    badRequest(res, err.message);
    return;
  }

  const request = parseContentGenerationRequest({ rawText: 'Adapta este video.', sourceAsset: { type: 'VIDEO', path: realPath }, forcedMode: 'ADAPT', outputProfiles: outputProfileNames });
  const outputDir = join(DASHBOARD_OUTPUT_ROOT, `adapt-${randomUUID()}`);
  try {
    const result = generateContent(request, { postProductionOperations: postProductionOperations ?? ['LOUDNESS_NORMALIZATION', 'RESIZE_TO_PROFILE'], outputDir, ffmpegBinDir: FFMPEG_BIN_DIR });
    sendJson(res, 200, translateFinalAssetPackageForClient(result));
  } catch (err) {
    serverError(res, err);
  }
}

// ---------------------------------------------------------------------
// Bloque 1 — CREATE autónomo: userIntent -> Creative Proposal real
// ---------------------------------------------------------------------

export async function handleProposeCreative(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { userIntent, productId = null } = body;
  if (!userIntent?.trim()) { badRequest(res, 'proponer: "userIntent" es obligatorio.'); return; }
  try {
    const proposal = await buildCreativeProposal({ userIntent, productId });
    sendJson(res, 200, proposal);
  } catch (err) {
    serverError(res, err);
  }
}

/**
 * "Sugerir variantes (hipótesis)" en Crear Contenido (Fase 16, Parte 11) --
 * llama al MISMO hypothesisCreativeEngine que usa Crear Autónomo (nunca un
 * segundo motor). Requiere solo "productId" real (nunca inventa uno) --
 * sin userIntent, porque aquí no hay objetivo en prosa libre, solo un
 * producto ya seleccionado en el formulario manual. La variante elegida
 * por el usuario se prellena en el formulario y sigue siendo editable —
 * este endpoint nunca aprueba ni publica nada.
 */
// Creative Factory + Creative Strategy Engine (2026-08-23/24): "campaña"
// es, por defecto, 1:1 con productId (compatibilidad con llamadores sin
// brief real, ej. autonomousCreate.js) -- pero cuando SÍ hay un
// CampaignIntent real (targetAudience+problemOrNeed reales), la campaña
// se identifica por el BRIEF (computeCampaignId), no solo por el
// producto: dos campañas distintas para el mismo producto (ej.
// "vitalidad masculina" vs "control de peso") tienen su propio historial
// de batches real, nunca comparten fingerprints/offset entre sí.
function resolveCampaignId(productId, campaignIntent) {
  return campaignIntent ? computeCampaignId(campaignIntent) : productId;
}

/**
 * Núcleo real de "Sugerir variantes (hipótesis)" -- extraído tal cual del
 * handler HTTP (Adaptar contenido / Video de referencia, 2026-08-26) para
 * que la propuesta de adaptación desde un video de referencia reutilice
 * EXACTAMENTE el mismo Creative Strategy Engine + persistencia de Batch
 * real, en vez de duplicar esta orquestación o crear un segundo pipeline
 * (ver dashboard/server/routes/referenceAdaptation.js). Comportamiento
 * idéntico al que ya tenía handleSuggestHypothesisVariants -- ningún caso
 * nuevo, solo movido a una función reutilizable.
 */
export async function suggestHypothesisVariantsCore({ productId, variantCount, campaignIntent = null }) {
  const productGroundedEvidence = buildProductGroundedEvidence(productId);
  if (!productGroundedEvidence) {
    return { status: 'MISSING_CREATIVE_MATCH', productId, errors: [`suggest-hypothesis: "${productId}" no tiene hechos reales en docs/productos/.`] };
  }

  const campaignId = resolveCampaignId(productId, campaignIntent);
  const { nextBatchNumber, blueprintOffset, usedFingerprints } = getCampaignBatchState(campaignId);

  const result = buildHypothesisExperiment({
    productGroundedEvidence, variantCount, batchOffset: blueprintOffset, excludeFingerprints: usedFingerprints, campaignIntent,
  });
  if (result.status !== 'HYPOTHESIS_EXPERIMENT_READY') {
    return { ...result, productId, campaignId };
  }

  const batchId = randomUUID();
  const generationId = randomUUID();
  const createdAt = new Date().toISOString();
  const fingerprints = result.variantsDetail.map((v) => v.fingerprint);
  saveBatch({
    batchId, campaignId, batchNumber: nextBatchNumber, generationId, createdAt,
    variantCount: result.variantsDetail.length, blueprintOffsetStart: blueprintOffset,
    fingerprints, product: result.product, campaignIntent: result.campaignIntent,
    experiment: result.experiment,
    experimentQualityGate: result.experimentQualityGate, variantsDetail: result.variantsDetail,
    disclaimer: result.disclaimer,
  });

  return { ...result, productId, campaignId, batchId, batchNumber: nextBatchNumber, generationId, createdAt };
}

export async function handleSuggestHypothesisVariants(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const {
    productId, variantCount = DEFAULT_BATCH_SIZE,
    targetAudience, problemOrNeed, campaignTerritory, desiredOutcome, campaignObjective, awarenessStage,
  } = body;
  if (!productId?.trim()) { badRequest(res, 'suggest-hypothesis: "productId" es obligatorio -- no se inventa un producto.'); return; }
  if (!Number.isInteger(variantCount) || variantCount < 1) { badRequest(res, 'suggest-hypothesis: "variantCount" debe ser un entero >= 1 (batchSize configurable, ej. 10/20/50).'); return; }

  // CampaignIntent real SOLO si el llamador provee audiencia+problema
  // reales (el mínimo real de un brief, ver campaignIntent.js) -- sin
  // esto, comportamiento preexistente intacto (producto solo, sin
  // campaña). buildCampaignIntent() ya valida Claim Safety del brief
  // mismo -- "marca el conflicto" real, nunca a mitad del batch.
  let campaignIntent = null;
  if (targetAudience?.trim() || problemOrNeed?.trim()) {
    try {
      campaignIntent = buildCampaignIntent({
        productId, targetAudience, problemOrNeed, campaignTerritory, desiredOutcome, campaignObjective, awarenessStage,
      });
    } catch (err) {
      badRequest(res, err.message);
      return;
    }
  }

  try {
    const result = await suggestHypothesisVariantsCore({ productId, variantCount, campaignIntent });
    sendJson(res, 200, result);
  } catch (err) {
    serverError(res, err);
  }
}

/**
 * Corrección de flujo UI (Paso "Crear contenido" del encargo): "Crear
 * contenido" en modo instrucción directa (Producto+Instrucción+Hook+
 * formato) YA NO debe producir directamente vía handleCreate() -- debe
 * primero pasar por CampaignIntent -> Creative Strategy -> Creative
 * Director -> Creative Structure Engine y mostrar "Estructura sugerida"
 * ANTES de gastar un render real. Este endpoint es SOLO la mitad
 * "PROPOSAL": genera UNA variante real grounded (mismo
 * hypothesisCreativeEngine que "Sugerir variantes", nunca un segundo
 * motor) y la persiste como un Batch de 1 -- así el Dashboard puede
 * reutilizar TAL CUAL los endpoints ya existentes y probados
 * (/api/create/structure-recommendation, /api/create/produce) para el
 * resto del flujo, sin duplicar ni modificar Creative Structure Engine,
 * Krea, Provider Router ni Voice Engine.
 *
 * Hook/CTA literales del usuario ("Hook / contenido existente" del
 * formulario) sobrescriben el copy generado ANTES de persistir el Batch
 * (los Batches son inmutables, ver hypothesisBatchStore.js) -- mismo
 * criterio real ya usado en el proyecto: el texto que el usuario escribió
 * es la fuente de verdad, la IA nunca lo reemplaza en silencio.
 */
export async function handleProposeDirectCreative(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { productId, rawText, hookText = null, ctaText = null } = body;
  if (!productId?.trim()) { badRequest(res, 'propose-direct: "productId" es obligatorio -- no se inventa un producto.'); return; }
  if (!rawText?.trim()) { badRequest(res, 'propose-direct: "rawText" (instrucción/intención) es obligatorio -- sin instrucción real, usa el formulario manual (modo campaña/copy literal).'); return; }

  const productGroundedEvidence = buildProductGroundedEvidence(productId);
  if (!productGroundedEvidence) {
    sendJson(res, 200, { status: 'MISSING_CREATIVE_MATCH', productId, errors: [`propose-direct: "${productId}" no tiene hechos reales en docs/productos/.`] });
    return;
  }

  const campaignId = productId;
  const { nextBatchNumber, blueprintOffset, usedFingerprints } = getCampaignBatchState(campaignId);
  // buildHypothesisExperiment() exige variantCount real entre 3 y 50 (no
  // relajado aquí -- no es este endpoint quien decide ese mínimo). Se
  // piden DIRECT_PROPOSAL_VARIANT_COUNT variantes reales pero SOLO la
  // primera (índice 0) se expone/usa en este flujo de instrucción directa
  // -- "una instrucción -> una propuesta", nunca una lista para elegir.
  const result = buildHypothesisExperiment({
    productGroundedEvidence, variantCount: DIRECT_PROPOSAL_VARIANT_COUNT, batchOffset: blueprintOffset, excludeFingerprints: usedFingerprints, campaignIntent: null,
  });
  if (result.status !== 'HYPOTHESIS_EXPERIMENT_READY') {
    sendJson(res, 200, { ...result, productId, campaignId });
    return;
  }

  // Media Type (Corrección "Crear contenido", Paso 1/2 del encargo): este
  // endpoint solo alimenta el pipeline de VIDEO real (produceCreative,
  // nunca CAROUSEL) -- se evita, entre las variantes reales ya generadas,
  // cualquiera cuyo blueprint sea un formato ESTÁTICO real
  // (STATIC_FORMATS de videoScriptGenerator.js, ej. "Static comparison
  // frames"), que buildVideoScript() rechazaría más tarde con
  // "applicable:false" -- root cause real del bug reportado ("una
  // instrucción explícita de VIDEO puede terminar cayendo en un formato
  // estático"). Nunca se filtra en buildHypothesisExperiment() (no se
  // toca Creative Strategy Engine); se elige, entre las
  // DIRECT_PROPOSAL_VARIANT_COUNT variantes reales ya devueltas, la
  // primera compatible -- si NINGUNA lo es (extremadamente improbable,
  // solo 1 de 5 blueprints reales es estático), se reporta explícito en
  // vez de producir un video roto.
  const mediaType = 'VIDEO';
  const compatibleVariants = result.variantsDetail
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => !STATIC_FORMATS.includes(v.creativeVariant.format));
  if (compatibleVariants.length === 0) {
    sendJson(res, 200, {
      status: 'MEDIA_TYPE_MISMATCH', productId, campaignId, mediaType,
      errors: [`propose-direct: ninguna de las ${result.variantsDetail.length} variantes reales generadas para "${productId}" es compatible con VIDEO (todas cayeron en un formato estático real) -- reintenta la propuesta.`],
    });
    return;
  }

  // Creative Angle Selector (Corrección "Evolución integral del Creative
  // Director", 2026-08-28, Paso 1/3/4 del encargo): entre las variantes
  // reales YA GENERADAS y compatibles con VIDEO, elige la que mejor
  // coincide con userInstruction real (angle+hook YA definidos por el
  // blueprint real, nunca inventados aquí) -- root cause real corregido
  // del bug "userInstruction nunca influía en qué variante se usaba"
  // (antes: siempre la primera compatible por orden de rotación).
  const angleSelection = selectCreativeAngle({
    userInstruction: rawText, candidates: compatibleVariants.map(({ v }) => v),
  });
  const compatibleIndex = compatibleVariants[angleSelection.selectedIndex].i;

  // result.variantsDetail[*] viene congelado (Object.freeze, mismo criterio
  // real de inmutabilidad del resto del proyecto) -- el override de
  // hook/cta literal construye un objeto NUEVO, nunca muta el original.
  const originalVariant = result.variantsDetail[compatibleIndex];

  // previousHooks (Corrección "Hook Intelligence", 2026-08-28, Paso 8 del
  // encargo): hooks reales ya usados en batches anteriores de ESTA
  // campaña -- anti-repetición real entre corridas, nunca inventado.
  let previousHooks = [];
  try {
    previousHooks = listBatchesForCampaign(campaignId)
      .map((b) => b.variantsDetail?.[0])
      .filter(Boolean)
      .map((v) => ({ hook: v.copy?.hook, hookId: v.hookId }));
  } catch { /* campaña real sin batches previos -- lista vacía real, nunca bloquea. */ }

  // Claim Relevance (Paso 10/11/12 del encargo): recorta beneficios/
  // ingredientes reales de la variante elegida a los realmente relevantes
  // para su primaryAngle real -- ANTES de generar candidatos de hook
  // (mismos "facts" reales, nunca inventados, solo priorizados).
  const claimSelection = originalVariant.hookRegenerationContext
    ? selectRelevantClaims({ facts: originalVariant.hookRegenerationContext.facts, angleId: originalVariant.angleId })
    : null;
  const variantForHooks = claimSelection
    ? { ...originalVariant, hookRegenerationContext: { ...originalVariant.hookRegenerationContext, facts: claimSelection.filteredFacts } }
    : originalVariant;

  // Hook Intelligence (Paso 2/3/5/6/7 del encargo): varios candidatos
  // reales (generateVariantCopy() real, MISMO motor real de siempre)
  // evaluados con hookRelevanceScore real -- reemplaza el hook/copy real
  // de la variante ya elegida por el mejor candidato real encontrado.
  let hookSelection = null;
  try {
    hookSelection = selectHook({ variant: variantForHooks, userInstruction: rawText, previousHooks });
  } catch { /* ningún candidato real de hook pasó Claim Safety -- se conserva el copy/hook original real, nunca se bloquea la propuesta (Paso 29). */ }
  const finalCopy = hookSelection?.copy ?? originalVariant.copy;
  const finalHookId = hookSelection?.hookId ?? originalVariant.hookId;

  // Propagación real del hook/cta editado (Corrección "Cierre del
  // Creative Director", 2026-08-28, Paso 17/22 del encargo: "hook =
  // primera línea del script" / "actualizar coherentemente script
  // opening; voiceover opening") -- root cause real encontrado por el
  // E2E real de esta corrección: antes, hookText solo pisaba
  // copy.hook, dejando copy.script[0]/copy.voiceover[0] con el texto
  // real VIEJO (generateVariantCopy() los construye como
  // [hook, ...bodyLines], nunca se resincronizaban). Reconstruye ambos
  // arreglos reales reemplazando SOLO el primer elemento real, preserva
  // el resto (bodyLines reales intactos, nunca regenerados).
  const hookFinal = hookText?.trim() || null;
  const ctaFinal = ctaText?.trim() || null;
  const overriddenCopy = (hookFinal || ctaFinal)
    ? {
      ...finalCopy,
      ...(hookFinal ? { hook: hookFinal, headline: hookFinal } : {}),
      ...(ctaFinal ? { cta: ctaFinal } : {}),
      ...(hookFinal && Array.isArray(finalCopy.script) ? { script: [hookFinal, ...finalCopy.script.slice(1)] } : {}),
      ...(hookFinal && Array.isArray(finalCopy.voiceover) ? { voiceover: [hookFinal, ...finalCopy.voiceover.slice(1)] } : {}),
      primaryText: [hookFinal ?? finalCopy.hook, ...(finalCopy.bodyLines ?? []), ctaFinal ?? finalCopy.cta].join(' '),
    }
    : finalCopy;
  const variant = { ...originalVariant, hookId: finalHookId, copy: overriddenCopy };
  // La variante elegida real se mueve al índice 0 -- variantIndex:0 sigue
  // siendo el contrato real que structure-recommendation/produce esperan
  // (nunca se expone un índice distinto de 0 en este flujo de instrucción
  // directa, Paso "una instrucción -> una propuesta").
  const variantsDetail = [variant, ...result.variantsDetail.filter((_, i) => i !== compatibleIndex)];

  const batchId = randomUUID();
  const generationId = randomUUID();
  const createdAt = new Date().toISOString();
  saveBatch({
    batchId, campaignId, batchNumber: nextBatchNumber, generationId, createdAt,
    variantCount: variantsDetail.length, blueprintOffsetStart: blueprintOffset, fingerprints: variantsDetail.map((v) => v.fingerprint),
    product: result.product, campaignIntent: null, experiment: result.experiment,
    experimentQualityGate: result.experimentQualityGate, variantsDetail,
    disclaimer: result.disclaimer,
  });

  // hookMode/re-evaluación real (Corrección "Cierre del Creative
  // Director", 2026-08-28, Paso 22/23 del encargo): con hookText real
  // literal, el hook mostrado YA NO es el candidato real que eligió Hook
  // Intelligence -- se re-puntúa el TEXTO real del usuario (nunca se
  // sustituye), para que creativeQualityScore refleje la realidad, no un
  // score real obsoleto del candidato descartado.
  const hookEdited = Boolean(hookText?.trim());
  const finalHookRelevanceScore = hookEdited
    ? scoreHookText({
      hookText: hookText.trim(), angleId: variant.angleId, userInstruction: rawText, previousHooks,
    }).hookRelevanceScore
    : (hookSelection?.hookRelevanceScore ?? angleSelection.hookRelevanceScore);
  const finalRepetitionPenalty = hookEdited
    ? scoreHookText({
      hookText: hookText.trim(), angleId: variant.angleId, userInstruction: rawText, previousHooks,
    }).repetitionPenalty
    : (hookSelection?.repetitionPenalty ?? 0);

  // Structure preview real (SOLO para alimentar Auto-QA global -- el
  // Dashboard sigue pidiendo /api/create/structure-recommendation por
  // separado para "Cambiar estructura", nunca duplicado aquí).
  let structurePreview = null;
  try {
    structurePreview = previewStructureOptions({
      userInstruction: rawText, campaignIntent: null, creativeVariant: variant, productFacts: result.product, contentType: 'VIDEO',
    });
  } catch { /* preview real opcional -- Auto-QA usa su fallback neutro real sin ella. */ }

  // Auto-QA global real (Paso 1/2/7 del encargo "Cierre del Creative
  // Director") -- SOLO lee los datos reales ya construidos arriba, nunca
  // reconstruye hook/script/voiceover/visualIntent desde cero.
  const qualityEval = evaluateCreativeProposal({
    primaryAngle: angleSelection.primaryAngle,
    hadUserInstruction: Boolean(rawText?.trim()),
    hookRelevanceScore: finalHookRelevanceScore,
    hookRepetitionPenalty: finalRepetitionPenalty,
    relevantClaims: claimSelection,
    structureId: structurePreview?.recommended?.structureId ?? null,
    copy: variant.copy,
    visualIntent: null, // Visual Intent real solo existe tras consultar model-recommendation (paso posterior real) -- Auto-QA usa su fallback neutro real aquí, nunca inventa uno.
    visualContinuityContext: null,
  });

  sendJson(res, 200, {
    batchId, variantIndex: 0, mediaType, product: result.product, creativeVariant: variant, rawText, disclaimer: result.disclaimer,
    // Creative Angle Selector (Paso 29 del encargo): expuesto para que el
    // Dashboard muestre "Ángulo creativo"/"Hook sugerido" ANTES de producir.
    primaryAngle: angleSelection.primaryAngle,
    secondaryAngle: angleSelection.secondaryAngle,
    // Hook Intelligence (Paso 5/6/30 del encargo): hookType/score/status
    // reales del MEJOR candidato real ya evaluado (hookSelection) --
    // fallback real a angleSelection solo si Hook Intelligence real no
    // pudo construir ningún candidato (Claim Safety rechazó todos).
    hookType: hookSelection?.hookType ?? angleSelection.hookType,
    hookRelevanceScore: finalHookRelevanceScore,
    hookQualityStatus: hookEdited
      ? (finalHookRelevanceScore >= 0.65 ? 'ACCEPTED' : 'LOW_CONFIDENCE')
      : (hookSelection?.hookQualityStatus ?? 'LOW_CONFIDENCE'),
    hookCandidates: hookSelection?.candidates ?? [],
    // hookOriginal/hookEdited (Paso 20 del encargo): trazabilidad real del
    // hook real ya elegido por Hook Intelligence vs el texto real que el
    // usuario terminó usando -- nunca se pierde cuál era el real sugerido.
    hookOriginal: hookSelection?.hook ?? originalVariant.copy.hook,
    // Claim Relevance (Paso 10/11 del encargo): expuesto para "Claims
    // principales" en el Dashboard (Paso 30) -- nunca un claim inventado,
    // solo la clasificación real de los claims reales del producto.
    relevantClaims: claimSelection ? { core: claimSelection.core, supporting: claimSelection.supporting, irrelevant: claimSelection.irrelevant } : null,
    // hookMode (Paso 30 del encargo): "user_edited" real cuando el usuario
    // ya sobrescribió el hook con hookText literal -- nunca se sobrescribe
    // en silencio; "system_generated" es el default real (mismo hook que
    // ya eligió Hook Intelligence real arriba).
    hookMode: hookEdited ? 'user_edited' : 'system_generated',
    // Auto-QA global real (Paso 8/9 del encargo) -- el Dashboard muestra
    // SOLO "✅ Lista para producir" / "⚠️ Confianza baja", nunca los
    // cálculos internos completos (Paso 9: "no mostrar todos los
    // cálculos").
    creativeQualityScore: qualityEval.creativeQualityScore,
    creativeQualityStatus: qualityEval.creativeQualityStatus,
  });
}

const MAX_MULTI_VARIANT_COUNT = 5;

/**
 * POST /api/create/propose-direct-variants — Corrección "Cierre del
 * Creative Director" (2026-08-28, Paso 11/24/25/26/40/41 del encargo).
 * Genera hasta MAX_MULTI_VARIANT_COUNT propuestas reales de UNA sola
 * llamada real -- MISMA secuencia real por variante que
 * handleProposeDirectCreative() (angle -> claims -> hook intelligence ->
 * structure/visual preview -> Auto-QA), repetida N veces, cada una
 * persistida como su propio Batch real e informando a la siguiente
 * ronda real vía previousAngles/previousHooks (diversidad real, nunca
 * artificial -- relevancia real sigue dominando, ver
 * creativeAngleSelector.js/hookIntelligence.js). Nunca reimplementa
 * Creative Structure Engine/Creative Director/Krea -- solo los consulta
 * N veces reales.
 */
export async function handleProposeDirectMultiVariant(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { productId, rawText, variantCount = MAX_MULTI_VARIANT_COUNT } = body;
  if (!productId?.trim()) { badRequest(res, 'propose-direct-variants: "productId" es obligatorio -- no se inventa un producto.'); return; }
  if (!rawText?.trim()) { badRequest(res, 'propose-direct-variants: "rawText" (instrucción/intención) es obligatorio.'); return; }
  const count = Math.min(MAX_MULTI_VARIANT_COUNT, Math.max(1, Number.isInteger(variantCount) ? variantCount : MAX_MULTI_VARIANT_COUNT));

  const productGroundedEvidence = buildProductGroundedEvidence(productId);
  if (!productGroundedEvidence) {
    sendJson(res, 200, { status: 'MISSING_CREATIVE_MATCH', productId, errors: [`propose-direct-variants: "${productId}" no tiene hechos reales en docs/productos/.`] });
    return;
  }

  const campaignId = productId;
  const productRawAssets = getProduct(productId)?.rawAssets ?? [];
  const variants = [];
  const previousAngles = [];
  const previousHooks = [];

  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { nextBatchNumber, blueprintOffset, usedFingerprints } = getCampaignBatchState(campaignId);
    const result = buildHypothesisExperiment({
      productGroundedEvidence, variantCount: DIRECT_PROPOSAL_VARIANT_COUNT, batchOffset: blueprintOffset, excludeFingerprints: usedFingerprints, campaignIntent: null,
    });
    if (result.status !== 'HYPOTHESIS_EXPERIMENT_READY') break; // sin más combinaciones reales -- se detiene, nunca inventa una variante faltante (Paso 25).

    const compatibleVariants = result.variantsDetail
      .map((v, idx) => ({ v, i: idx }))
      .filter(({ v }) => !STATIC_FORMATS.includes(v.creativeVariant.format));
    if (compatibleVariants.length === 0) continue; // esta ronda real no dio ningún candidato de VIDEO -- se reintenta la siguiente (acotado por "count").

    const angleSelection = selectCreativeAngle({
      userInstruction: rawText, candidates: compatibleVariants.map(({ v }) => v), previousAngles,
    });
    const compatibleIndex = compatibleVariants[angleSelection.selectedIndex].i;
    const originalVariant = result.variantsDetail[compatibleIndex];

    const claimSelection = originalVariant.hookRegenerationContext
      ? selectRelevantClaims({ facts: originalVariant.hookRegenerationContext.facts, angleId: originalVariant.angleId })
      : null;
    const variantForHooks = claimSelection
      ? { ...originalVariant, hookRegenerationContext: { ...originalVariant.hookRegenerationContext, facts: claimSelection.filteredFacts } }
      : originalVariant;

    let hookSelection = null;
    try {
      hookSelection = selectHook({ variant: variantForHooks, userInstruction: rawText, previousHooks });
    } catch { /* ningún candidato real pasó Claim Safety -- se conserva el hook/copy original real de la variante. */ }
    const finalCopy = hookSelection?.copy ?? originalVariant.copy;
    const finalHookId = hookSelection?.hookId ?? originalVariant.hookId;
    const variant = { ...originalVariant, hookId: finalHookId, copy: finalCopy };

    const variantsDetail = [variant, ...result.variantsDetail.filter((_, idx) => idx !== compatibleIndex)];
    const batchId = randomUUID();
    const generationId = randomUUID();
    const createdAt = new Date().toISOString();
    saveBatch({
      batchId, campaignId, batchNumber: nextBatchNumber, generationId, createdAt,
      variantCount: variantsDetail.length, blueprintOffsetStart: blueprintOffset, fingerprints: variantsDetail.map((v) => v.fingerprint),
      product: result.product, campaignIntent: null, experiment: result.experiment,
      experimentQualityGate: result.experimentQualityGate, variantsDetail, disclaimer: result.disclaimer,
    });

    let structurePreview = null;
    try {
      structurePreview = previewStructureOptions({
        userInstruction: rawText, campaignIntent: null, creativeVariant: variant, productFacts: result.product, contentType: 'VIDEO',
      });
    } catch { /* preview real opcional. */ }

    // visualPreview: "i" real como variantIndex (rota assignVisualTreatment()
    // real ya existente, Paso 18 del encargo -- reutiliza la MISMA
    // diversidad real de tratamiento visual entre variantes de un batch,
    // nunca un mecanismo nuevo).
    let visualPreview = null;
    try {
      visualPreview = previewVisualRecommendation({
        campaignIntent: null, productFacts: result.product, productRawAssets, variantIndex: i, campaignId,
        userInstruction: rawText, angleId: variant.angleId,
      });
    } catch { /* preview real opcional. */ }

    const qualityEval = evaluateCreativeProposal({
      primaryAngle: angleSelection.primaryAngle,
      hadUserInstruction: true,
      hookRelevanceScore: hookSelection?.hookRelevanceScore ?? angleSelection.hookRelevanceScore,
      hookRepetitionPenalty: hookSelection?.repetitionPenalty ?? 0,
      relevantClaims: claimSelection,
      structureId: structurePreview?.recommended?.structureId ?? null,
      copy: variant.copy,
      visualIntent: visualPreview?.visualIntent ?? null,
      visualContinuityContext: visualPreview?.visualContinuityContext ?? null,
    });

    variants.push(Object.freeze({
      batchId, variantIndex: 0, product: result.product, creativeVariant: variant,
      primaryAngle: angleSelection.primaryAngle, secondaryAngle: angleSelection.secondaryAngle,
      hookType: hookSelection?.hookType ?? angleSelection.hookType, hook: variant.copy.hook,
      hookRelevanceScore: hookSelection?.hookRelevanceScore ?? angleSelection.hookRelevanceScore,
      hookQualityStatus: hookSelection?.hookQualityStatus ?? 'LOW_CONFIDENCE',
      relevantClaims: claimSelection ? { core: claimSelection.core, supporting: claimSelection.supporting } : null,
      structureId: structurePreview?.recommended?.structureId ?? null,
      structureLabel: structurePreview?.recommended?.label ?? null,
      visualTreatment: visualPreview?.visualTreatment ?? null,
      // Campos ya calculados por previewVisualRecommendation() -- solo se
      // exponen aquí para que la tarjeta de comparación (UI de Variantes
      // Creativas, Paso 3/11 del encargo) los muestre sin una llamada de
      // red adicional por variante; nunca un segundo cálculo.
      visualTreatmentLabel: visualPreview?.visualTreatmentLabel ?? null,
      visualIntent: visualPreview?.visualIntent ?? null,
      recommendedModel: visualPreview?.recommendedModel
        ? { id: visualPreview.recommendedModel.id, displayName: visualPreview.recommendedModel.displayName }
        : null,
      productAssetAvailable: visualPreview?.assetRequirements?.productAssetAvailable ?? null,
      creativeQualityScore: qualityEval.creativeQualityScore,
      creativeQualityStatus: qualityEval.creativeQualityStatus,
    }));

    previousAngles.push(variant.angleId);
    previousHooks.push({ hook: variant.copy.hook, hookId: variant.hookId });
  }

  if (variants.length === 0) {
    sendJson(res, 200, { status: 'MEDIA_TYPE_MISMATCH', productId, campaignId, errors: [`propose-direct-variants: ninguna variante real compatible con VIDEO para "${productId}".`] });
    return;
  }

  // diversityScore real (Paso 25/26 del encargo) -- determinista, nunca
  // un modelo de IA adicional (Paso 26/43).
  const diversity = computeDiversityScore(variants);

  sendJson(res, 200, {
    productId, campaignId, mediaType: 'VIDEO', variantCount: variants.length, variants,
    diversityScore: diversity.diversityScore,
    diversityDetail: {
      distinctHooks: diversity.distinctHooks, distinctHookTypes: diversity.distinctHookTypes, distinctAngles: diversity.distinctAngles,
      distinctStructures: diversity.distinctStructures, distinctTreatments: diversity.distinctTreatments, exactDuplicateHooks: diversity.exactDuplicateHooks,
    },
  });
}

/**
 * POST /api/create/regenerate-hook — Corrección "Cierre del Creative
 * Director" (2026-08-28, Paso 21/32 del encargo). Genera candidatos
 * NUEVOS reales para el MISMO ángulo/estructura/claims/audiencia ya
 * elegidos de una variante YA propuesta (batchId+variantIndex reales) --
 * excluye explícitamente el hookId real actual (y cualquier otro real ya
 * mostrado) de la búsqueda real. NUNCA persiste un batch nuevo (los
 * Batches son inmutables) -- devuelve el resultado real para que el
 * Dashboard lo use como "hookText" al aceptar la propuesta (mismo
 * mecanismo real ya existente, nunca uno nuevo).
 */
export async function handleRegenerateHook(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { batchId, variantIndex = 0, userInstruction = null, excludeHookIds = [] } = body;
  if (!batchId?.trim()) { badRequest(res, 'regenerate-hook: "batchId" es obligatorio.'); return; }

  let batch;
  try {
    batch = getBatch(batchId);
  } catch (err) {
    badRequest(res, err.message);
    return;
  }
  const variant = batch.variantsDetail[variantIndex];
  if (!variant) { badRequest(res, `regenerate-hook: el batch "${batchId}" no tiene una variante real en el índice ${variantIndex}.`); return; }

  const previousHooks = [];
  try {
    previousHooks.push(...listBatchesForCampaign(batch.campaignId)
      .map((b) => b.variantsDetail?.[variantIndex])
      .filter(Boolean)
      .map((v) => ({ hook: v.copy?.hook, hookId: v.hookId })));
  } catch { /* sin batches previos reales -- lista vacía real. */ }

  const claimSelection = variant.hookRegenerationContext
    ? selectRelevantClaims({ facts: variant.hookRegenerationContext.facts, angleId: variant.angleId })
    : null;
  const variantForHooks = claimSelection
    ? { ...variant, hookRegenerationContext: { ...variant.hookRegenerationContext, facts: claimSelection.filteredFacts } }
    : variant;

  let hookSelection;
  try {
    hookSelection = selectHook({
      variant: variantForHooks, userInstruction, previousHooks, excludeHookIds: [variant.hookId, ...excludeHookIds],
    });
  } catch (err) {
    sendJson(res, 200, { status: 'LOW_CONFIDENCE', error: err.message });
    return;
  }

  sendJson(res, 200, {
    hook: hookSelection.hook, hookId: hookSelection.hookId, hookType: hookSelection.hookType,
    hookRelevanceScore: hookSelection.hookRelevanceScore, hookQualityStatus: hookSelection.hookQualityStatus,
    hookMode: 'system_generated',
  });
}

/**
 * Lista los Batches reales ya generados para una campaña (hoy: productId)
 * -- lo que permite al Dashboard mostrar "Batch #1 / #2 / #3..." sin
 * perder los lotes anteriores al pedir uno nuevo (Creative Factory, Paso
 * 7). Nunca genera nada -- solo lee el historial real ya persistido por
 * hypothesisBatchStore.js.
 */
export async function handleListHypothesisBatches(req, res, url) {
  // campaignId explícito (ej. ya conocido por el Dashboard de una
  // respuesta previa) alcanza por sí solo -- es la identidad real de la
  // campaña (ver computeCampaignId()). Sin él, se requiere "productId"
  // real, y opcionalmente el mismo brief (targetAudience+problemOrNeed)
  // que identificó la campaña originalmente para recomputar su
  // campaignId; sin ninguno de los dos, cae al productId solo
  // (comportamiento preexistente, campaña = producto).
  const explicitCampaignId = url.searchParams.get('campaignId');
  const productId = url.searchParams.get('productId');
  if (!explicitCampaignId && !productId?.trim()) { badRequest(res, 'hypothesis-batches: se requiere "campaignId" o "productId" real (query param).'); return; }
  const targetAudience = url.searchParams.get('targetAudience');
  const problemOrNeed = url.searchParams.get('problemOrNeed');
  let campaignId = explicitCampaignId || productId;
  if (!explicitCampaignId && (targetAudience?.trim() || problemOrNeed?.trim())) {
    try {
      const campaignIntent = buildCampaignIntent({
        productId,
        targetAudience,
        problemOrNeed,
        campaignTerritory: url.searchParams.get('campaignTerritory'),
      });
      campaignId = computeCampaignId(campaignIntent);
    } catch (err) {
      badRequest(res, err.message);
      return;
    }
  }
  const batches = listBatchesForCampaign(campaignId);
  sendJson(res, 200, { campaignId, batches });
}

/**
 * Auditoría "Video Workspace + Voice Engine" (2026-08-23), Parte 2/12:
 * adapta el copy YA generado de una CreativeVariant (hook/bodyLines/
 * sectionsUsed/cta/format/copyStyle, tal cual viene en
 * variant.copy/variant.creativeVariant/variant.copyStyle del resultado de
 * suggest-hypothesis) a un Video Script real -- nunca redacta copy nuevo,
 * solo llama a videoScriptGenerator.js. El resultado es el punto de
 * PARTIDA editable en el Dashboard, nunca se vuelve a llamar después de
 * que el usuario edita el voiceover (ver REGLA FUNDAMENTAL en
 * videoScriptGenerator.js).
 */
export async function handleVideoScript(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { hook, bodyLines, sectionsUsed, cta, format, copyStyle } = body;
  try {
    const videoScript = buildVideoScript({ hook, bodyLines, sectionsUsed, cta, format, copyStyle });
    sendJson(res, 200, videoScript);
  } catch (err) {
    badRequest(res, err.message);
  }
}

// ---------------------------------------------------------------------
// Bloque 2 — Carousel real
// ---------------------------------------------------------------------

/** Igual que handleProposeCreative, pero además arma el contenido de slides (texto, sin renderizar todavía) -- separado de la producción real para que el usuario confirme antes de gastar un render. */
export async function handleProposeCarousel(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { userIntent, slideCount = 5, productId = null, selectedStructureId = null } = body;
  if (!userIntent?.trim()) { badRequest(res, 'proponer carrusel: "userIntent" es obligatorio.'); return; }
  if (!(Number.isInteger(slideCount) && slideCount >= 3)) { badRequest(res, 'proponer carrusel: "slideCount" debe ser un entero >= 3.'); return; }

  let proposal;
  try {
    proposal = await buildCreativeProposal({ userIntent, productId });
  } catch (err) {
    serverError(res, err);
    return;
  }
  if (proposal.status !== 'PROPOSAL_READY') { sendJson(res, 200, proposal); return; }

  try {
    const facts = loadProductFacts(proposal.product.productId);
    // Creative Structure Engine (Paso 5/7/18 del encargo): "userIntent" ya
    // ES la instrucción real del usuario para esta pieza -- mismo campo,
    // nunca duplicado -- influye REALMENTE en la estructura recomendada.
    // "selectedStructureId" (opcional) permite re-pedir la propuesta con
    // otra estructura real del catálogo ("Cambiar estructura", Paso 9).
    const creativeStructure = buildCreativeStructure({
      userInstruction: userIntent,
      productFacts: facts,
      contentType: 'CAROUSEL',
      selectedStructureId,
    });
    const content = buildCarouselSlidesContent({
      hook: proposal.hook, cta: proposal.cta,
      productFacts: facts,
      slideCount,
      creativeStructure,
    });
    const structureOptions = listCompatibleStructures({ contentType: 'CAROUSEL' })
      .map((s) => ({ structureId: s.structureId, label: s.label, stages: s.stages, objective: s.objective }));
    sendJson(res, 200, { ...proposal, carousel: content, structureOptions });
  } catch (err) {
    serverError(res, err);
  }
}

export async function handleCreateCarousel(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { productId, slides, backgroundImageAssetPath = null } = body;
  if (!productId?.trim()) { badRequest(res, 'CAROUSEL: "productId" es obligatorio -- no se inventa un producto.'); return; }
  if (!Array.isArray(slides) || slides.length === 0) { badRequest(res, 'CAROUSEL: "slides" es obligatorio (ver /api/carousel/propose) -- el motor nunca redacta el contenido.'); return; }

  let backgroundImageSourcePath = null;
  if (backgroundImageAssetPath) {
    const product = getProduct(productId);
    const rawReal = (product?.rawAssets ?? []).find((a) => a.sourcePath === backgroundImageAssetPath);
    if (!rawReal) { badRequest(res, `CAROUSEL: "backgroundImageAssetPath" debe ser una fotografía RAW real ya registrada para "${productId}".`); return; }
    backgroundImageSourcePath = rawReal.sourcePath;
  }

  const request = parseContentGenerationRequest({ rawText: `Carrusel de ${productId}.`, productId, forcedMode: 'CAROUSEL' });
  const projectDir = join(DASHBOARD_OUTPUT_ROOT, `carousel-${randomUUID()}`);
  try {
    const result = generateContent(request, {
      slides: slides.map((s) => ({ ...s, backgroundImageSourcePath: s.useProductImage ? backgroundImageSourcePath : null })),
      projectDir,
    });
    sendJson(res, 200, translateFinalAssetPackageForClient(result));
  } catch (err) {
    serverError(res, err);
  }
}

// ---------------------------------------------------------------------
// Bloque 3 — Publicación real
// ---------------------------------------------------------------------

export async function handlePublishTargets(req, res) {
  sendJson(res, 200, listPublishTargets());
}

/**
 * PUBLICAR AHORA (Bloque 3 -- "publicación inmediata", sin pasar por
 * CALENDARIO/PublishingScheduler): si el cliente no manda ya un mediaUrl
 * real (compatibilidad con el flujo manual anterior), aloja el/los
 * asset(s) del Final Asset Package real vía MediaHostingService antes de
 * llamar a publish() -- MediaHostingService -> PublishingService ->
 * MetaAdapter/FacebookAdapter, sin duplicar la lógica de ninguno de los
 * dos. El click de "PUBLICAR" sobre contenido recién producido es en sí
 * mismo la aprobación humana inmediata (distinta del ciclo
 * DRAFT->APPROVED->SCHEDULED de CALENDARIO, que existe para diferir esa
 * decisión en el tiempo) -- por eso aquí se trata el asset como
 * FINAL+approved. Si faltan credenciales R2, se deja mediaUrl/mediaUrls en
 * null y el adapter real (metaAdapter.js/facebookAdapter.js) devuelve su
 * propio CONFIGURATION_REQUIRED ya existente -- ningún camino de error nuevo.
 */
async function autoHostIfNeeded(assetPackage, platform, mediaUrl, mediaUrls) {
  if (platform === 'WHATSAPP') return { mediaUrl, mediaUrls };
  const isCarousel = assetPackage.assetPackageType === 'CAROUSEL';
  if (isCarousel) {
    if (mediaUrls) return { mediaUrl, mediaUrls };
    const assets = assetPackage.assetPackage?.assets ?? [];
    const urls = [];
    for (const asset of assets) {
      const result = await mediaHostingService.upload({ assetId: asset.assetId, localPath: asset.path, assetKind: 'FINAL', approved: true });
      if (result.status !== 'UPLOADED') return { mediaUrl, mediaUrls: null };
      urls.push(result.publicUrl);
    }
    return { mediaUrl, mediaUrls: urls };
  }
  if (mediaUrl) return { mediaUrl, mediaUrls };
  const outputAsset = assetPackage.outputAssets?.[0];
  if (!outputAsset) return { mediaUrl, mediaUrls };
  const result = await mediaHostingService.upload({ assetId: outputAsset.assetId, localPath: outputAsset.path, assetKind: 'FINAL', approved: true });
  return { mediaUrl: result.status === 'UPLOADED' ? result.publicUrl : null, mediaUrls };
}

export async function handlePublish(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { assetPackage, platform, destination = null, mediaUrl = null, mediaUrls = null, caption = null } = body;
  if (!assetPackage) { badRequest(res, 'PUBLICAR: "assetPackage" es obligatorio (el resultado real ya producido).'); return; }
  if (!platform) { badRequest(res, 'PUBLICAR: "platform" es obligatorio.'); return; }
  try {
    const hosted = await autoHostIfNeeded(assetPackage, platform, mediaUrl, mediaUrls);
    const result = await publish(assetPackage, platform, destination, { mediaUrl: hosted.mediaUrl, mediaUrls: hosted.mediaUrls, caption });
    sendJson(res, 200, result);
  } catch (err) {
    serverError(res, err);
  }
}

// ---------------------------------------------------------------------
// Bloque 4 — Creative Production Orchestrator (2026-08-24): Creative
// Variant (ya generada y persistida por hypothesisBatchStore.js) -> pieza
// audiovisual real completa (guion, escenas, voz real, captions, música
// si hay, composición ffmpeg real, QA, múltiples formatos). NUNCA
// regenera la campaña/copy -- recibe la creatividad estratégica YA
// APROBADA (un batch/variante ya persistido) tal cual.
// ---------------------------------------------------------------------

// Modelo Sugerido + Selección Manual (2026-08-27): vista previa real ANTES
// de producir (antes del voiceover real, costoso) -- "el sistema
// recomienda, el usuario decide", regla central del encargo. GET, no POST:
// solo lee/calcula, nunca genera nada real.
export async function handleModelRecommendation(req, res, url) {
  const batchId = url.searchParams.get('batchId');
  const variantIndexRaw = url.searchParams.get('variantIndex');
  const variantIndex = Number(variantIndexRaw);
  if (!batchId?.trim()) { badRequest(res, 'model-recommendation: "batchId" es obligatorio (query param).'); return; }
  if (!variantIndexRaw?.trim() || !Number.isInteger(variantIndex) || variantIndex < 0) { badRequest(res, 'model-recommendation: "variantIndex" debe ser un entero >= 0 real (query param).'); return; }

  let batch;
  try {
    batch = getBatch(batchId);
  } catch (err) {
    badRequest(res, err.message);
    return;
  }
  if (!batch.variantsDetail[variantIndex]) { badRequest(res, `model-recommendation: el batch "${batchId}" no tiene una variante real en el índice ${variantIndex}.`); return; }

  // Generation Settings (Paso 12/13 del encargo): selección manual real ya
  // hecha por el usuario en esta vista previa -- mismo criterio real que
  // structure-recommendation (query params opcionales, null = recomendación
  // aceptada tal cual).
  const selectedModelId = url.searchParams.get('selectedModelId') || null;
  const selectedQuality = url.searchParams.get('selectedQuality') || null;
  // Visual Continuity Context (Corrección "Crear contenido", Paso 8 del
  // encargo): mismo query param real ya usado por structure-recommendation
  // -- la vista previa de modelo/calidad debe reflejar el MISMO
  // sujeto/entorno que luego verá el usuario en las escenas reales.
  const userInstruction = url.searchParams.get('userInstruction') || null;

  const product = getProduct(batch.product?.productId ?? '');
  const preview = previewVisualRecommendation({
    campaignIntent: batch.campaignIntent ?? null,
    productFacts: batch.product ?? null,
    productRawAssets: product?.rawAssets ?? [],
    variantIndex,
    campaignId: batch.campaignId,
    selectedModelId, selectedQuality, userInstruction,
    // Creative Angle (Paso 18/29 del encargo): angleId real YA elegido
    // (batch.variantsDetail[variantIndex].angleId), nunca recalculado.
    angleId: batch.variantsDetail[variantIndex]?.angleId ?? null,
  });
  sendJson(res, 200, preview);
}

// Creative Structure Engine (Paso 9/16 del encargo): "Estructura sugerida"
// real ANTES de producir (antes del voiceover real, costoso) -- mismo
// patrón real ya validado por handleModelRecommendation ("el sistema
// recomienda, el usuario decide"). GET, no POST: solo lee/calcula, nunca
// genera nada real. "userInstruction" (query param opcional) es el mismo
// texto libre real que el usuario ya escribió en el Dashboard (ej. campo
// "Instrucción/Intención") -- influye REALMENTE en la estructura
// recomendada (Paso 7 del encargo).
export async function handleStructureRecommendation(req, res, url) {
  const batchId = url.searchParams.get('batchId');
  const variantIndexRaw = url.searchParams.get('variantIndex');
  const variantIndex = Number(variantIndexRaw);
  const userInstruction = url.searchParams.get('userInstruction');
  if (!batchId?.trim()) { badRequest(res, 'structure-recommendation: "batchId" es obligatorio (query param).'); return; }
  if (!variantIndexRaw?.trim() || !Number.isInteger(variantIndex) || variantIndex < 0) { badRequest(res, 'structure-recommendation: "variantIndex" debe ser un entero >= 0 real (query param).'); return; }

  let batch;
  try {
    batch = getBatch(batchId);
  } catch (err) {
    badRequest(res, err.message);
    return;
  }
  const creativeVariant = batch.variantsDetail[variantIndex];
  if (!creativeVariant) { badRequest(res, `structure-recommendation: el batch "${batchId}" no tiene una variante real en el índice ${variantIndex}.`); return; }

  const preview = previewStructureOptions({
    userInstruction: userInstruction?.trim() || null,
    campaignIntent: batch.campaignIntent ?? null,
    creativeVariant,
    productFacts: batch.product ?? null,
    platform: batch.campaignIntent?.platform ?? null,
    contentType: 'VIDEO',
    angle: creativeVariant?.creativeVariant?.angleText ?? null,
    hook: creativeVariant?.copy?.hook ?? null,
  });
  sendJson(res, 200, preview);
}

// GET /api/create/visual-plan-preview — Corrección "Hacer auditable la
// propuesta antes de producir" (2026-08-28, Paso 1/2/3/5/12 del encargo).
// Vista previa real de Plan Visual + Prompts ANTES de producir -- reusa
// EXACTAMENTE la misma secuencia real de produceCreative() (Pasos 1/1b/2/2b
// de creativeProductionOrchestrator.js: buildVideoScript ->
// buildCreativeStructure -> buildScenePlan -> buildVisualStrategy), pero se
// detiene ahí -- NUNCA llama a resolveAssetPlan()/generateImage() (Asset
// Resolver/Krea MCP/Provider Router), que es el único paso real que
// consume una generación externa (Paso 5 del encargo: "revisar un prompt
// NO debe llamar a Krea"). generatedPrompt por escena es EXACTAMENTE
// scene.visualPrompt vía imageGenerationRequests[].promptSpec.generationPrompt
// -- el MISMO string real que assetResolver.js#buildSceneImageRequest usará
// después como generationPrompt (Paso 12: source of truth único, nunca
// reconstruido). GET, no POST: solo lee/calcula, nunca genera nada real.
export async function handleVisualPlanPreview(req, res, url) {
  const batchId = url.searchParams.get('batchId');
  const variantIndexRaw = url.searchParams.get('variantIndex');
  const variantIndex = Number(variantIndexRaw);
  if (!batchId?.trim()) { badRequest(res, 'visual-plan-preview: "batchId" es obligatorio (query param).'); return; }
  if (!variantIndexRaw?.trim() || !Number.isInteger(variantIndex) || variantIndex < 0) { badRequest(res, 'visual-plan-preview: "variantIndex" debe ser un entero >= 0 real (query param).'); return; }

  let batch;
  try {
    batch = getBatch(batchId);
  } catch (err) {
    badRequest(res, err.message);
    return;
  }
  const creativeVariant = batch.variantsDetail[variantIndex];
  if (!creativeVariant) { badRequest(res, `visual-plan-preview: el batch "${batchId}" no tiene una variante real en el índice ${variantIndex}.`); return; }

  const userInstruction = url.searchParams.get('userInstruction') || null;
  const selectedModelId = url.searchParams.get('selectedModelId') || null;
  const selectedQuality = url.searchParams.get('selectedQuality') || null;
  const selectedStructureId = url.searchParams.get('selectedStructureId') || null;

  const product = getProduct(batch.product?.productId ?? '');
  const productFacts = batch.product ?? null;
  const productRawAssets = product?.rawAssets ?? [];

  // 1. SCRIPT -- mismo real que produceCreative() (videoScriptGenerator.js,
  // sin cambios, sin llamada externa).
  const videoScript = buildVideoScript({
    hook: creativeVariant.copy.hook, bodyLines: creativeVariant.copy.bodyLines,
    sectionsUsed: creativeVariant.copy.sectionsUsed, cta: creativeVariant.copy.cta,
    format: creativeVariant.creativeVariant.format, copyStyle: creativeVariant.copyStyle,
  });
  if (!videoScript.applicable) {
    sendJson(res, 200, { status: 'NOT_APPLICABLE', reason: videoScript.reason, scenes: [] });
    return;
  }

  // 1b. CREATIVE STRUCTURE -- mismo real que produceCreative().
  const creativeStructure = buildCreativeStructure({
    userInstruction, campaignIntent: batch.campaignIntent ?? null, creativeVariant, productFacts,
    platform: batch.campaignIntent?.platform ?? null, contentType: 'VIDEO',
    angle: creativeVariant?.creativeVariant?.angleText ?? null, hook: creativeVariant?.copy?.hook ?? null,
    selectedStructureId,
  });

  // 2. SCENE PLAN -- mismo real que produceCreative(), sin el reescalado a
  // audio real (ese audio todavía no existe antes de producir -- Paso 4 del
  // encargo: "sin consumir una generación externa"; el reescalado solo
  // ajusta duration/startSeconds proporcionalmente, nunca narration/
  // visualPrompt/estructura, así que la vista previa sigue siendo honesta).
  const scenePlan = buildScenePlan({
    videoScript, productRawAssets, campaignIntent: batch.campaignIntent ?? null, creativeStructure,
  });

  // 2b. CREATIVE DIRECTOR -- mismo real que produceCreative(). Se detiene
  // aquí: NUNCA se llama resolveAssetPlan()/generateImage() (Paso 5 del
  // encargo).
  const visualStrategy = buildVisualStrategy({
    creativeVariant, campaignIntent: batch.campaignIntent ?? null, productFacts, productRawAssets, scenePlan,
    format: creativeVariant.creativeVariant.format, variantIndex, campaignId: batch.campaignId, batchId,
    selectedModelId, selectedQuality, userInstruction,
  });

  const promptRequestBySceneId = new Map(visualStrategy.imageGenerationRequests.map((r) => [r.sceneId, r]));
  const scenes = visualStrategy.sceneVisuals.map((s) => {
    const requiresProduct = s.visualIntent === 'PRODUCT_REVEAL';
    const promptRequest = promptRequestBySceneId.get(s.sceneId);
    return Object.freeze({
      sceneId: s.sceneId,
      sectionType: s.sectionType,
      narrativePurpose: s.narrativePurpose ?? null,
      action: s.action ?? null,
      emotionalState: s.emotionalState ?? null,
      shotType: s.shotType ?? null,
      cameraAngle: s.cameraAngle ?? null,
      requiresProduct,
      visualSource: s.visualSource,
      // generatedPrompt (Paso 3/4 del encargo): EXACTAMENTE
      // promptSpec.generationPrompt (== scene.visualPrompt) cuando esta
      // escena real requiere generación; null real (nunca inventado) para
      // una escena que usará la fotografía real del producto directamente
      // -- esa nunca genera un prompt real porque nunca llama a Krea.
      generatedPrompt: promptRequest?.promptSpec?.generationPrompt ?? null,
      promptPendingReason: promptRequest ? null
        : s.visualSource === 'EXISTING_PRODUCT_ASSET'
          ? 'Esta escena usa la fotografía real del producto -- no requiere generación, nunca se envía a Krea.'
          : null,
    });
  });

  sendJson(res, 200, {
    status: 'READY',
    scenes,
    generationSettings: visualStrategy.generationSettings,
    recommendedModel: visualStrategy.recommendedModel,
    selectedModel: visualStrategy.selectedModel,
    selectionMode: visualStrategy.selectionMode,
    assetRequirements: visualStrategy.assetRequirements,
    visualIntent: visualStrategy.visualIntent,
  });
}

export async function handleProduceCreative(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const {
    batchId, variantIndex, outputProfileNames = ['INSTAGRAM_REEL', 'INSTAGRAM_FEED'],
    // Modelo Sugerido + Selección Manual: null real = el usuario aceptó la
    // recomendación (selectionMode "automatic"); un id real del catálogo
    // (imageModelCatalog.js) = el usuario lo cambió (selectionMode
    // "user_selected", sobrescribe la recomendación para ESTA generación).
    imageModelId = null,
    // Generation Settings: mismo patrón real -- null = calidad recomendada
    // aceptada tal cual, una calidad real de generationSettings.js#QUALITY_TIERS
    // sobrescribe la recomendación para ESTA generación.
    selectedQuality = null,
    // Creative Structure Engine: mismo patrón real -- null = recomendación
    // aceptada tal cual, un structureId real de creativeStructureEngine.js
    // sobrescribe la estructura para ESTA generación.
    userInstruction = null, selectedStructureId = null,
  } = body;
  if (!batchId?.trim()) { badRequest(res, 'produce: "batchId" es obligatorio -- la creatividad debe venir de un batch real ya generado, nunca inventada aquí.'); return; }
  if (!Number.isInteger(variantIndex) || variantIndex < 0) { badRequest(res, 'produce: "variantIndex" debe ser un entero >= 0 real.'); return; }

  let batch;
  try {
    batch = getBatch(batchId);
  } catch (err) {
    badRequest(res, err.message);
    return;
  }
  const creativeVariant = batch.variantsDetail[variantIndex];
  if (!creativeVariant) { badRequest(res, `produce: el batch "${batchId}" no tiene una variante real en el índice ${variantIndex} (tiene ${batch.variantsDetail.length}).`); return; }

  const productId = batch.product.productId;
  const product = getProduct(productId);
  const productRawAssets = product?.rawAssets ?? [];

  // Modelo Sugerido + Selección Manual (Validación D/E): valida el modelo
  // real elegido por el usuario ANTES de pagar el costo real de generar un
  // voiceover (más abajo) -- nunca deja que una selección inválida se
  // descubra recién después de ese costo real.
  if (imageModelId) {
    const disponibles = listAvailableImageModels({ productReferenceAvailable: productRawAssets.length > 0 });
    if (!disponibles.some((m) => m.id === imageModelId)) {
      badRequest(res, `produce: "imageModelId" ("${imageModelId}") no es un modelo real disponible ahora (credencial ausente o requiere una referencia de producto real que no existe) -- modelos reales disponibles: ${disponibles.map((m) => m.id).join(', ') || 'ninguno'}.`);
      return;
    }
  }

  // El mismo Video Script real que produceCreative() volverá a construir
  // internamente -- se recalcula aquí SOLO para conocer voiceoverText
  // ANTES de pedir el audio real (mismo texto, función pura/determinista,
  // nunca diverge).
  const videoScript = buildVideoScript({
    hook: creativeVariant.copy.hook, bodyLines: creativeVariant.copy.bodyLines,
    sectionsUsed: creativeVariant.copy.sectionsUsed, cta: creativeVariant.copy.cta,
    format: creativeVariant.creativeVariant.format, copyStyle: creativeVariant.copyStyle,
  });
  if (!videoScript.applicable) { sendJson(res, 200, { status: 'FAILED', error: videoScript.reason }); return; }

  try {
    assertVoiceoverTextSafe(videoScript.voiceoverText);
  } catch (err) {
    sendJson(res, 200, { status: 'VALIDATION_FAILED', errors: [err.message] });
    return;
  }

  let audioSourcePath;
  let audioDurationSeconds;
  try {
    const resultado = await generateNewVoiceover({ text: videoScript.voiceoverText });
    audioSourcePath = resultado.resolvedPath;
    audioDurationSeconds = resultado.durationSeconds;
  } catch (err) {
    sendJson(res, 200, { status: 'SOURCE_ASSET_REQUIRED', error: err.message });
    return;
  }

  const projectDir = join(DASHBOARD_OUTPUT_ROOT, `produce-${randomUUID()}`);
  try {
    const job = await produceCreative({
      creativeVariant, campaignIntent: batch.campaignIntent ?? null, productRawAssets,
      audioSourcePath, audioDurationSeconds, outputProfileNames, projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
      campaignId: batch.campaignId, batchId: batch.batchId, generationId: batch.generationId,
      creativeId: `${batch.batchId}-v${variantIndex}`,
      // Creative Director (Paso 1/3/28 del encargo): "product" ya trae
      // nombreVisible real (hypothesisCreativeEngine.js), y variantIndex
      // real (posición dentro de ESTE batch) garantiza diversidad real de
      // tratamiento visual entre variantes producidas del mismo batch.
      productFacts: batch.product ?? null, variantIndex, selectedModelId: imageModelId, selectedQuality,
      userInstruction, selectedStructureId,
    });
    // Persistencia real (Editable Video Project, 2026-08-24): antes de esta
    // fase el ProductionJob solo vivía en esta respuesta HTTP -- se
    // guarda aquí para que el Dashboard pueda abrirlo después como un
    // proyecto editable (ver dashboard/server/routes/projects.js), sin
    // volver a producirlo. Un job FAILED no trae escenas reales que
    // envolver -- no se persiste (nada que editar).
    let productionJobId = null;
    if (job.status !== 'FAILED') {
      ({ productionJobId } = saveProductionJob({ job, projectDir }));
    }
    sendJson(res, 200, {
      ...job,
      productionJobId,
      outputs: job.outputs.map((o) => ({
        ...o,
        mediaUrl: o.outputPath ? toMediaUrl(o.outputPath) : null,
        // displayName (Corrección "Flujo creativo integral", Paso 17/18 del
        // encargo): nombre humano real -- v1 siempre para la producción
        // original (una V2+ real solo existe vía render del Editable Video
        // Project, ver projects.js).
        ...buildDisplayName({
          nombreVisible: batch.product?.nombreVisible, nombreComercial: batch.product?.nombreComercial,
          conceptId: creativeVariant.conceptId, angleId: creativeVariant.angleId,
          outputProfileName: o.profileName, versionNumber: 1,
        }),
      })),
    });
  } catch (err) {
    serverError(res, err);
  }
}

// produce-start / produce-status (Corrección E2E "Crear contenido", polling,
// 2026-08-28): /api/create/produce (arriba) NO cambia -- sigue siendo la
// misma llamada síncrona real de siempre, para no romper a ningún llamador
// existente (dashboard/public/app.js incluido). Este par de endpoints es
// SOLO una forma alternativa de invocar exactamente el mismo pipeline real
// (produceCreative/generateNewVoiceover/saveProductionJob, sin tocar una
// sola línea de ninguno) para un cliente que no puede sostener una única
// conexión HTTP abierta durante los varios minutos reales que tarda una
// producción real -- nunca un segundo sistema de jobs: el resultado final
// es el mismo ProductionJob real, y se persiste con el mismo
// saveProductionJob() de siempre. `produceJobsInFlight` es memoria de
// proceso, no un store nuevo -- solo cubre el hueco real que no cubre
// productionJobStore.js (que nunca guarda un estado "en progreso", solo el
// resultado final ya inmutable): aquí vive el estado mientras la
// producción real todavía está corriendo.
const produceJobsInFlight = new Map(); // jobId -> { status: 'RUNNING'|'COMPLETED'|'FAILED', result, error, startedAt, finishedAt }

export async function handleProduceCreativeStart(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const {
    batchId, variantIndex, outputProfileNames = ['INSTAGRAM_REEL', 'INSTAGRAM_FEED'],
    imageModelId = null, selectedQuality = null,
    userInstruction = null, selectedStructureId = null,
  } = body;
  if (!batchId?.trim()) { badRequest(res, 'produce-start: "batchId" es obligatorio -- la creatividad debe venir de un batch real ya generado, nunca inventada aquí.'); return; }
  if (!Number.isInteger(variantIndex) || variantIndex < 0) { badRequest(res, 'produce-start: "variantIndex" debe ser un entero >= 0 real.'); return; }

  let batch;
  try {
    batch = getBatch(batchId);
  } catch (err) {
    badRequest(res, err.message);
    return;
  }
  const creativeVariant = batch.variantsDetail[variantIndex];
  if (!creativeVariant) { badRequest(res, `produce-start: el batch "${batchId}" no tiene una variante real en el índice ${variantIndex} (tiene ${batch.variantsDetail.length}).`); return; }

  const productId = batch.product.productId;
  const product = getProduct(productId);
  const productRawAssets = product?.rawAssets ?? [];

  if (imageModelId) {
    const disponibles = listAvailableImageModels({ productReferenceAvailable: productRawAssets.length > 0 });
    if (!disponibles.some((m) => m.id === imageModelId)) {
      badRequest(res, `produce-start: "imageModelId" ("${imageModelId}") no es un modelo real disponible ahora (credencial ausente o requiere una referencia de producto real que no existe) -- modelos reales disponibles: ${disponibles.map((m) => m.id).join(', ') || 'ninguno'}.`);
      return;
    }
  }

  const jobId = randomUUID();
  produceJobsInFlight.set(jobId, { status: 'RUNNING', startedAt: new Date().toISOString() });
  sendJson(res, 202, { jobId, status: 'RUNNING' });

  // Fire-and-forget real: nunca se espera aquí -- la respuesta HTTP ya se
  // envió arriba. Mismos pasos reales que handleProduceCreative(), sin
  // reimplementarlos (produceCreative/generateNewVoiceover/saveProductionJob
  // son exactamente las mismas funciones importadas arriba).
  (async () => {
    try {
      const videoScript = buildVideoScript({
        hook: creativeVariant.copy.hook, bodyLines: creativeVariant.copy.bodyLines,
        sectionsUsed: creativeVariant.copy.sectionsUsed, cta: creativeVariant.copy.cta,
        format: creativeVariant.creativeVariant.format, copyStyle: creativeVariant.copyStyle,
      });
      if (!videoScript.applicable) {
        produceJobsInFlight.set(jobId, { status: 'FAILED', result: { status: 'FAILED', error: videoScript.reason }, finishedAt: new Date().toISOString() });
        return;
      }

      try {
        assertVoiceoverTextSafe(videoScript.voiceoverText);
      } catch (err) {
        produceJobsInFlight.set(jobId, { status: 'VALIDATION_FAILED', result: { status: 'VALIDATION_FAILED', errors: [err.message] }, finishedAt: new Date().toISOString() });
        return;
      }

      let audioSourcePath;
      let audioDurationSeconds;
      try {
        const resultado = await generateNewVoiceover({ text: videoScript.voiceoverText });
        audioSourcePath = resultado.resolvedPath;
        audioDurationSeconds = resultado.durationSeconds;
      } catch (err) {
        produceJobsInFlight.set(jobId, { status: 'SOURCE_ASSET_REQUIRED', result: { status: 'SOURCE_ASSET_REQUIRED', error: err.message }, finishedAt: new Date().toISOString() });
        return;
      }

      const projectDir = join(DASHBOARD_OUTPUT_ROOT, `produce-${randomUUID()}`);
      const job = await produceCreative({
        creativeVariant, campaignIntent: batch.campaignIntent ?? null, productRawAssets,
        audioSourcePath, audioDurationSeconds, outputProfileNames, projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
        campaignId: batch.campaignId, batchId: batch.batchId, generationId: batch.generationId,
        creativeId: `${batch.batchId}-v${variantIndex}`,
        productFacts: batch.product ?? null, variantIndex, selectedModelId: imageModelId, selectedQuality,
        userInstruction, selectedStructureId,
      });
      let productionJobId = null;
      if (job.status !== 'FAILED') {
        ({ productionJobId } = saveProductionJob({ job, projectDir }));
      }
      produceJobsInFlight.set(jobId, {
        status: job.status,
        result: {
          ...job,
          productionJobId,
          outputs: job.outputs.map((o) => ({
            ...o,
            mediaUrl: o.outputPath ? toMediaUrl(o.outputPath) : null,
            ...buildDisplayName({
              nombreVisible: batch.product?.nombreVisible, nombreComercial: batch.product?.nombreComercial,
              conceptId: creativeVariant.conceptId, angleId: creativeVariant.angleId,
              outputProfileName: o.profileName, versionNumber: 1,
            }),
          })),
        },
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      produceJobsInFlight.set(jobId, { status: 'FAILED', result: { status: 'FAILED', error: err.message }, finishedAt: new Date().toISOString() });
    }
  })();
}

export function handleProduceCreativeStatus(req, res, url) {
  const jobId = url.searchParams.get('jobId');
  if (!jobId?.trim()) { badRequest(res, 'produce-status: "jobId" es obligatorio (query param).'); return; }
  const entry = produceJobsInFlight.get(jobId);
  if (!entry) { notFound(res, `produce-status: no existe ningún job en memoria con jobId "${jobId}" (nunca se lanzó en este proceso, o el servidor se reinició desde entonces).`); return; }
  if (entry.status === 'RUNNING') { sendJson(res, 200, { jobId, status: 'RUNNING' }); return; }
  sendJson(res, 200, { jobId, ...entry.result });
}
