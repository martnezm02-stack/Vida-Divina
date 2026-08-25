// miniMaxVideoProvider.js — adapter real hacia MiniMax H3
// (https://github.com/MiniMax-AI/MiniMax-H3, investigado 2026-08-24):
// modelo omni-modal de 33B parámetros, genera video CON audio nativo,
// hasta 2K/24fps, clips de 4-15s, español soportado -- candidato real de
// VideoProvider para el Creative Production Orchestrator.
//
// ESTADO REAL: sin credencial (MINIMAX_API_KEY) en este entorno --
// isConfigured() es false, generateVideo() (videoProvider.js) nunca
// siquiera llama a generate() de este archivo. Este adapter existe para
// que, el día que exista la credencial, conectar MiniMax sea cambiar una
// variable de entorno, NUNCA tocar ProviderRouter/Orchestrator ni ningún
// llamador (mismo principio que motivó separar VideoProvider de sus
// implementaciones).
//
// Endpoint/forma de request tomados del README público del repositorio
// (no de la documentación completa de la API, que requiere cuenta) --
// VERIFICAR contra https://platform.minimax.io/docs/api-reference/
// video-generation-v2-create antes del primer uso real con una credencial
// real. Patrón async task-based (create -> poll por status) es el
// documentado; nombres exactos de campos JSON pueden requerir ajuste.

import { createVideoGenerationResult } from '../videoGenerationResult.js';

const API_BASE_URL = process.env.MINIMAX_API_BASE_URL ?? 'https://api.minimax.io';
const CREATE_ENDPOINT = '/video-generation-v2-create';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // ~5 min de espera real máxima -- generación de video real puede tardar minutos.

export class MiniMaxVideoProvider {
  providerName = 'minimax';
  model = 'MiniMax-H3';
  capabilities = Object.freeze({
    textToVideo: true, imageToVideo: true, nativeAudio: true, maxDurationSeconds: 15, aspectRatioControl: true,
  });

  /** Nunca asume una credencial -- real y explícito, sin ella ninguna llamada de red se intenta jamás (ver videoProvider.js#generateVideo). */
  isConfigured() {
    return Boolean(process.env.MINIMAX_API_KEY?.trim());
  }

  /**
   * Llamada real -- generateVideo() (videoProvider.js) SOLO invoca esto
   * cuando isConfigured() ya fue true, así que aquí SIEMPRE hay token
   * real. Nunca se llega aquí sin credencial; nunca se simula un
   * resultado si la llamada real falla (el error real sube tal cual).
   */
  async generate(request) {
    const token = process.env.MINIMAX_API_KEY;
    const createRes = await fetch(`${API_BASE_URL}${CREATE_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: this.model,
        prompt: request.generationPrompt,
        negative_prompt: request.negativePrompt,
        duration: request.durationSeconds,
        ratio: request.aspectRatio,
      }),
    });
    if (!createRes.ok) {
      const detalle = await createRes.text().catch(() => '');
      return createVideoGenerationResult({
        status: 'PROVIDER_ERROR', requestId: request.requestId, providerName: this.providerName, model: this.model,
        isMock: false, generationFingerprint: request.generationFingerprint,
        error: `MiniMaxVideoProvider: la API respondió ${createRes.status} al crear la tarea real: ${detalle}`,
      });
    }
    const created = await createRes.json();
    const taskId = created?.task?.id ?? created?.task_id;
    if (!taskId) {
      return createVideoGenerationResult({
        status: 'PROVIDER_ERROR', requestId: request.requestId, providerName: this.providerName, model: this.model,
        isMock: false, generationFingerprint: request.generationFingerprint,
        error: `MiniMaxVideoProvider: la API no devolvió un task.id real -- respuesta: ${JSON.stringify(created)}`,
      });
    }

    const t0 = Date.now();
    for (let intento = 0; intento < MAX_POLL_ATTEMPTS; intento += 1) {
      await new Promise((resolve) => { setTimeout(resolve, POLL_INTERVAL_MS); });
      // eslint-disable-next-line no-await-in-loop
      const statusRes = await fetch(`${API_BASE_URL}${CREATE_ENDPOINT}/${taskId}`, { headers: { Authorization: `Bearer ${token}` } });
      // eslint-disable-next-line no-await-in-loop
      const statusBody = await statusRes.json().catch(() => null);
      const status = statusBody?.task?.status;
      if (status === 'succeeded') {
        const videoUrl = statusBody.task.content?.video_url ?? statusBody.task.content?.url;
        if (!videoUrl) {
          return createVideoGenerationResult({
            status: 'PROVIDER_ERROR', requestId: request.requestId, providerName: this.providerName, model: this.model,
            isMock: false, generationFingerprint: request.generationFingerprint,
            error: `MiniMaxVideoProvider: la tarea real terminó "succeeded" pero sin video_url real -- respuesta: ${JSON.stringify(statusBody)}`,
          });
        }
        return createVideoGenerationResult({
          status: 'SUCCESS', requestId: request.requestId, providerName: this.providerName, model: this.model,
          isMock: false, generationFingerprint: request.generationFingerprint,
          asset: {
            assetId: taskId, sourcePath: videoUrl, type: 'GENERATED_VIDEO', format: 'mp4',
            durationSeconds: statusBody.task.duration ?? request.durationSeconds, width: null, height: null,
          },
          generationTimeMs: Date.now() - t0,
        });
      }
      if (status === 'failed') {
        return createVideoGenerationResult({
          status: 'PROVIDER_ERROR', requestId: request.requestId, providerName: this.providerName, model: this.model,
          isMock: false, generationFingerprint: request.generationFingerprint,
          error: `MiniMaxVideoProvider: la tarea real "${taskId}" falló del lado del proveedor -- respuesta: ${JSON.stringify(statusBody)}`,
        });
      }
      // 'processing'/'queued'/etc -- sigue el poll real.
    }
    return createVideoGenerationResult({
      status: 'PROVIDER_ERROR', requestId: request.requestId, providerName: this.providerName, model: this.model,
      isMock: false, generationFingerprint: request.generationFingerprint,
      error: `MiniMaxVideoProvider: la tarea real "${taskId}" no terminó tras ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s de poll real -- nunca se fabrica un resultado.`,
    });
  }
}
