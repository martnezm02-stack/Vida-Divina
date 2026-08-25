// enhancementProvider.js — Creative Production Orchestrator (2026-08-24).
// EnhancementProvider real -- NUNCA reimplementa ffmpeg/postproducción,
// es una envoltura delgada sobre postProduction.js (runPostProduction()),
// que ya es real y funcional (LOUDNESS_NORMALIZATION, RESIZE_TO_PROFILE,
// TEXT_OVERLAY, MUSIC_REPLACEMENT, MULTI_SCENE_CONCAT...). Existe como
// interfaz separada solo para que ProviderRouter pueda tratar
// "enhancement" como un task más, con el mismo vocabulario
// (isConfigured/providerName) que Image/Video/Music -- nunca duplica
// lógica ffmpeg.

import { runPostProduction, SUPPORTED_OPERATIONS } from './postProduction.js';

export class LocalFfmpegEnhancementProvider {
  providerName = 'local_ffmpeg';
  model = 'ffmpeg';
  capabilities = Object.freeze({ operations: SUPPORTED_OPERATIONS });

  /** ffmpeg local siempre disponible en este entorno real (ver docs/CONTENT_GENERATION_ENGINE.md) -- nunca requiere credencial. */
  isConfigured() {
    return true;
  }

  /** Delegación directa y real -- ver runPostProduction() para status/forma real del resultado. */
  apply({
    inputPath, outputPath, outputProfile, operations, operationParams = {}, ffmpegBinDir = null,
  }) {
    return runPostProduction({
      inputPath, outputPath, outputProfile, operations, operationParams, backend: 'local_ffmpeg', ffmpegBinDir,
    });
  }
}
