// assetResolver.js — Creative Production Orchestrator (2026-08-24).
// Decide, para CADA escena real del Scene Plan, qué activo visual real
// usar -- siguiendo la prioridad real pedida (Paso 4 del encargo):
//   1. Asset propio relevante ya existente (foto real de producto)
//   2. Generado localmente (ImageProvider real, NUNCA un mock aceptado
//      como visual real -- ver nota abajo)
//   3. Provider externo económico (stock -- no conectado en este entorno)
//   4. Provider premium (VideoProvider real, ej. MiniMax -- no conectado
//      en este entorno, ver video-generation/)
//   5. Fallback controlado: TYPOGRAPHIC (tratamiento tipográfico real de
//      HyperFrames, mismo mecanismo YA usado hoy cuando no hay fotografía
//      -- real y renderizable, nunca una imagen fabricada)
//
// REGLA CENTRAL: un resultado con isMock:true (ej. MockImageProvider)
// NUNCA se acepta como activo visual real para el render final -- un
// archivo ".mock" no es una imagen decodificable. Se registra como
// "disponible pero mock" (auditable) y se sigue bajando en la prioridad,
// nunca se finge que era una imagen real.

import { createHash, randomUUID } from 'node:crypto';
import { generateImage } from '../../image-generation/src/imageProvider.js';
import { recordLineage } from './assetLineage.js';

export const ASSET_SOURCES = Object.freeze(['EXISTING_PRODUCT_ASSET', 'GENERATED_IMAGE', 'STOCK_FOOTAGE', 'GENERATED_VIDEO', 'TYPOGRAPHIC']);

// Fuente única real del negative prompt por defecto -- Creative Director
// (creativeDirector.js) lo reutiliza por import, nunca lo duplica como
// string literal aparte (dos copias del mismo prompt real divergirían con
// el tiempo).
export const DEFAULT_NEGATIVE_PROMPT = 'texto en pantalla, marcas de agua, logos ajenos, contenido explícito, afirmaciones médicas';

/**
 * Request mínimo real y determinista para ImageProvider.generate() --
 * construido directamente desde una Scene real (nunca desde un
 * VisualProductionPackage completo: acoplaría este resolver a
 * creative-intelligence/ para un caso de uso mucho más simple -- una
 * imagen de apoyo por escena, no un asset de campaña completo). Cumple el
 * MISMO contrato real que generateImage() valida (ver
 * image-generation/src/imageProvider.js), solo con un origen distinto.
 */
function buildSceneImageRequest(scene, provider) {
  const generationPrompt = scene.visualPrompt;
  // Creative Director (creativeDirector.js) puede enriquecer la escena real
  // con negativePrompt/aspectRatio propios (misma escena real, campos
  // AÑADIDOS, nunca reemplazados) -- si no existen (llamador preexistente
  // sin Creative Director), se conserva el default real de siempre.
  const negativePrompt = scene.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT;
  const aspectRatio = scene.aspectRatio ?? '9:16';
  // productReferenceImageUrl (Krea MCP + Catálogo Real de Modelos,
  // 2026-08-27): reenvío ADITIVO real -- si la escena real ya trae una URL
  // pública real de la fotografía real del producto (ej. runway-gen4 vía
  // kreaMcpImageProvider.js, único modelo real con
  // referenceImagePreservation real), se reenvía tal cual. Ningún provider
  // real que no la necesite la usa; ninguno la inventa si falta.
  const generationFingerprint = createHash('sha256').update(JSON.stringify({
    generationPrompt, aspectRatio, providerName: provider.providerName, model: provider.model, productReferenceImageUrl: scene.productReferenceImageUrl ?? null,
  })).digest('hex');
  return Object.freeze({
    requestId: randomUUID(), visualProductionPackageId: null, providerName: provider.providerName, model: provider.model,
    generationPrompt, negativePrompt, aspectRatio, productReference: null,
    productReferenceImageUrl: scene.productReferenceImageUrl ?? null,
    generationFingerprint,
  });
}

/**
 * @param {{scene:object, imageProvider?:object, videoProvider?:object, stockProvider?:object}} args
 * @returns {{sceneId:string, source:string, imageSourcePath:?string, providerUsed:?string, isMock:boolean, attempted:object[]}}
 */
export async function resolveSceneAsset({
  scene, imageProvider = null, videoProvider = null, stockProvider = null,
}) {
  const attempted = [];

  // 1. Asset propio real ya existente -- decidido por scenePlanner.js (ya
  // verificó que el archivo real existe, vía productCatalog.js).
  if (scene.visualType === 'PRODUCT_ASSET' && scene.assetRequirements.productImageSourcePath) {
    attempted.push({ source: 'EXISTING_PRODUCT_ASSET', outcome: 'USED' });
    return Object.freeze({
      sceneId: scene.sceneId, source: 'EXISTING_PRODUCT_ASSET',
      imageSourcePath: scene.assetRequirements.productImageSourcePath, providerUsed: null, isMock: false,
      cost: Object.freeze({ estimatedCost: 0, actualCost: 0, currency: 'USD', costStatus: 'KNOWN' }),
      // Prompt Auditable (Corrección "Crear contenido", Paso 13 del
      // encargo): sin generación real, no hay prompt real que auditar --
      // null explícito, nunca reconstruido.
      generatedPrompt: null,
      attempted: Object.freeze(attempted),
    });
  }

  // 2. Generado localmente -- SOLO se acepta si NO es un resultado mock
  // (ver nota de cabecera). Hoy, con MockImageProvider como único
  // ImageProvider real conectado, esta rama SIEMPRE cae al fallback --
  // honesto, no fabrica una imagen usable de un archivo ".mock".
  if (imageProvider) {
    try {
      const request = buildSceneImageRequest(scene, imageProvider);
      const result = await generateImage({ provider: imageProvider, request });
      if (result.status === 'SUCCESS' && result.isMock === false) {
        attempted.push({ source: 'GENERATED_IMAGE', outcome: 'USED', providerUsed: result.providerName });
        // Lineage real (Editable Video Project, Paso 24 del encargo
        // Creative Director) -- reutiliza assetLineage.js, nunca un
        // segundo sistema de lineage paralelo. sourceAssetIds vacío: una
        // imagen generada por IA a partir de un prompt real no "deriva" de
        // ningún archivo real preexistente (no confundir con una foto de
        // producto real, que nunca pasa por esta rama).
        recordLineage({
          derivedAssetId: result.asset.assetId ?? createHash('sha256').update(result.asset.sourcePath).digest('hex'),
          derivedAssetPath: result.asset.sourcePath,
          sourceAssetIds: [],
          sourceAssetPaths: [],
          operation: `CREATIVE_DIRECTOR_IMAGE_GENERATION:${result.providerName}`,
        });
        return Object.freeze({
          sceneId: scene.sceneId, source: 'GENERATED_IMAGE',
          imageSourcePath: result.asset.sourcePath, providerUsed: result.providerName, isMock: false,
          cost: Object.freeze({ estimatedCost: result.estimatedCost ?? 0, actualCost: result.actualCost ?? 0, currency: result.currency ?? 'USD', costStatus: result.costStatus ?? 'KNOWN' }),
          // Prompt Auditable (Paso 13 del encargo): EXACTAMENTE
          // request.generationPrompt -- el mismo string real ya enviado a
          // generateImage() arriba, nunca reconstruido después a partir de
          // scene.visualPrompt (que podría, en teoría, divergir a futuro).
          generatedPrompt: request.generationPrompt,
          attempted: Object.freeze(attempted),
        });
      }
      attempted.push({
        source: 'GENERATED_IMAGE', outcome: result.isMock ? 'SKIPPED_MOCK_NOT_USABLE' : 'SKIPPED',
        providerUsed: result.providerName, detail: result.error ?? null,
      });
    } catch (err) {
      attempted.push({ source: 'GENERATED_IMAGE', outcome: 'ERROR', detail: err.message });
    }
  }

  // 3. Stock -- sin provider real conectado en este entorno.
  if (stockProvider) {
    attempted.push({ source: 'STOCK_FOOTAGE', outcome: 'NOT_CONFIGURED' });
  }

  // 4. Premium (video generado real, ej. MiniMaxVideoProvider) -- sin
  // credencial real en este entorno (ver video-generation/).
  if (videoProvider && !videoProvider.isConfigured()) {
    attempted.push({ source: 'GENERATED_VIDEO', outcome: 'NOT_CONFIGURED', providerUsed: videoProvider.providerName });
  }

  // 5. Fallback controlado y real -- SIEMPRE disponible.
  attempted.push({ source: 'TYPOGRAPHIC', outcome: 'USED' });
  return Object.freeze({
    sceneId: scene.sceneId, source: 'TYPOGRAPHIC', imageSourcePath: null, providerUsed: null, isMock: false,
    cost: Object.freeze({ estimatedCost: 0, actualCost: 0, currency: 'USD', costStatus: 'KNOWN' }),
    generatedPrompt: null,
    attempted: Object.freeze(attempted),
  });
}

export async function resolveAssetPlan({ scenes, imageProvider = null, videoProvider = null, stockProvider = null }) {
  const resolutions = [];
  for (const scene of scenes) {
    // eslint-disable-next-line no-await-in-loop
    resolutions.push(await resolveSceneAsset({
      scene, imageProvider, videoProvider, stockProvider,
    }));
  }
  return Object.freeze(resolutions);
}
