// videoGenerationRequest.js — adaptador determinista: una Scene real (ver
// content-orchestrator/src/scenePlanner.js) -> solicitud plana que un
// VideoProvider.generate() puede consumir. Mismo criterio que
// image-generation/src/imageGenerationRequest.js -- nunca redacta texto
// nuevo, nunca inventa duración/aspectRatio, solo transporta campos que YA
// existen en la Scene/CampaignIntent reales.

import { randomUUID, createHash } from 'node:crypto';

/** Hash real y determinista -- mismo insumo generativo -> mismo fingerprint (mismo criterio que computeGenerationFingerprint de image-generation). */
export function computeVideoGenerationFingerprint({ generationPrompt, durationSeconds, aspectRatio, providerName, model }) {
  const payload = JSON.stringify({ generationPrompt, durationSeconds, aspectRatio, providerName, model });
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * @param {{sceneId:string, visualIntent:string, narration:string, durationSeconds:number, aspectRatio:string, providerName:string, model:string, negativePrompt?:string}} args
 */
export function createVideoGenerationRequest({
  sceneId, visualIntent, narration, durationSeconds, aspectRatio, providerName, model,
  negativePrompt = 'texto en pantalla, marcas de agua, logos ajenos, contenido explícito',
}) {
  if (!sceneId?.trim()) throw new Error('createVideoGenerationRequest: "sceneId" es obligatorio.');
  if (!visualIntent?.trim()) throw new Error('createVideoGenerationRequest: "visualIntent" es obligatorio -- nunca se genera video sin una intención visual real ya decidida por el Scene Planner.');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('createVideoGenerationRequest: "durationSeconds" debe ser un número real > 0.');
  if (!aspectRatio?.trim()) throw new Error('createVideoGenerationRequest: "aspectRatio" es obligatorio.');
  if (!providerName?.trim() || !model?.trim()) throw new Error('createVideoGenerationRequest: "providerName"/"model" son obligatorios.');

  // El prompt real es la intención visual + narración de ESA escena --
  // nunca el campaignIntent completo (evita que un prompt de una escena
  // "cuente" el guion completo, root cause típico de video genérico).
  const generationPrompt = `${visualIntent}. Contexto real de la escena: "${narration}".`;
  const generationFingerprint = computeVideoGenerationFingerprint({ generationPrompt, durationSeconds, aspectRatio, providerName, model });

  return Object.freeze({
    requestId: randomUUID(),
    sceneId,
    generationPrompt,
    negativePrompt,
    durationSeconds,
    aspectRatio,
    providerName,
    model,
    generationFingerprint,
  });
}
