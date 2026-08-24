// generation.js — endpoints POST reales hacia el Content Generation
// Engine. Cada handler solo: valida la solicitud contra assets/perfiles
// REALES ya conocidos, arma los argumentos, y llama a generateContent()
// (content-orchestrator/src/contentGenerationEngine.js) -- nunca
// reimplementa CREATE/EDIT/ADAPT en el servidor del dashboard.

import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sendJson, badRequest, serverError, readJsonBody } from '../lib/http.js';
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
import { buildProductGroundedEvidence } from '../../../content-orchestrator/src/productGroundedEvidence.js';
import { buildVideoScript, assertVoiceoverTextSafe } from '../../../content-orchestrator/src/videoScriptGenerator.js';
import { buildCarouselSlidesContent } from '../../../content-orchestrator/src/carouselCompositor.js';
import { loadProductFacts } from '../../../content-orchestrator/src/productFactsLoader.js';
import { publish, listPublishTargets } from '../../../content-orchestrator/src/publishing/publishingService.js';
import { mediaHostingService } from '../lib/schedulerInstance.js';

const FFMPEG_BIN_DIR = process.env.FFMPEG_BIN_DIR
  ?? 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const DASHBOARD_OUTPUT_ROOT = join(PROJECT_ROOT, 'video-production', 'dashboard-outputs');

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
export async function handleSuggestHypothesisVariants(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { badRequest(res, err.message); return; }
  const { productId } = body;
  if (!productId?.trim()) { badRequest(res, 'suggest-hypothesis: "productId" es obligatorio -- no se inventa un producto.'); return; }

  let productGroundedEvidence;
  try {
    productGroundedEvidence = buildProductGroundedEvidence(productId);
  } catch (err) {
    serverError(res, err);
    return;
  }
  if (!productGroundedEvidence) {
    sendJson(res, 200, { status: 'MISSING_CREATIVE_MATCH', productId, errors: [`suggest-hypothesis: "${productId}" no tiene hechos reales en docs/productos/.`] });
    return;
  }

  try {
    const result = buildHypothesisExperiment({ productGroundedEvidence });
    sendJson(res, 200, { ...result, productId });
  } catch (err) {
    serverError(res, err);
  }
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
  const { userIntent, slideCount = 5, productId = null } = body;
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
    const content = buildCarouselSlidesContent({
      hook: proposal.hook, cta: proposal.cta,
      productFacts: facts,
      slideCount,
    });
    sendJson(res, 200, { ...proposal, carousel: content });
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
