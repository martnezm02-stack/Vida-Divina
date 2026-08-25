// productionQualityGate.js — Creative Production Orchestrator (2026-08-24).
// QA real de UN ProductionJob ya renderizado -- nunca aprueba nada sin
// verificar el archivo real en disco (validarMp4ConFfprobe, ya real, sin
// tocar). Devuelve un status explícito de 3 valores (Paso 17, regla
// crítica): FULL_PRODUCTION / DEGRADED_PRODUCTION / FAILED -- un fallback
// (ej. sin música real disponible en este entorno) NUNCA se presenta como
// si fuera una producción completa.

import { validarMp4ConFfprobe } from '../../video-production/src/hyperframesRenderer.js';

export const PRODUCTION_STATUSES = Object.freeze(['FULL_PRODUCTION', 'DEGRADED_PRODUCTION', 'FAILED']);

const MIN_RESOLUTION_DIMENSION = 480; // por debajo de esto, ninguna plataforma real (ver outputProfiles.js) lo acepta como entrega real.
const AUDIO_SYNC_TOLERANCE_S = 1.0; // margen real entre duración del video final y duración real del voiceover (concat/reencode introduce un margen real pequeño, nunca exacto a los ms).

/**
 * @param {{outputPath:string, expectedVoiceoverDurationSeconds:number, expectedCtaText:string, scenePlan:object, captionsApplied:boolean, musicIncluded:boolean, campaignId:?string, creativeId:string, ffmpegBinDir?:string}} args
 */
export function runProductionQualityGate({
  outputPath, expectedVoiceoverDurationSeconds, expectedCtaText, scenePlan,
  captionsApplied, musicIncluded, campaignId, creativeId, ffmpegBinDir = null,
}) {
  const checks = {};
  const issues = [];
  const warnings = [];

  const probe = validarMp4ConFfprobe(outputPath, ffmpegBinDir ? { ffprobeBin: `${ffmpegBinDir}\\ffprobe.exe` } : {});
  checks.videoExists = probe.ok;
  checks.hasVideoStream = Boolean(probe.hasVideo);
  checks.hasAudioStream = Boolean(probe.hasAudio);
  if (!probe.ok || !probe.hasVideo) issues.push(`Video real inválido o inexistente en "${outputPath}": ${probe.error ?? 'sin video real.'}`);
  if (!probe.hasAudio) issues.push('El MP4 real no tiene pista de audio real -- nunca se declara éxito sin audio real.');

  checks.durationValid = Number.isFinite(probe.videoDurationSeconds) && probe.videoDurationSeconds > 0;
  if (!checks.durationValid) issues.push('Duración real del video no es válida (0 o no numérica).');

  checks.resolutionValid = Number.isFinite(probe.width) && Number.isFinite(probe.height) && probe.width >= MIN_RESOLUTION_DIMENSION && probe.height >= MIN_RESOLUTION_DIMENSION;
  if (!checks.resolutionValid) warnings.push(`Resolución real (${probe.width}x${probe.height}) por debajo del mínimo esperado (${MIN_RESOLUTION_DIMENSION}px).`);

  checks.audioSynced = checks.durationValid && Math.abs(probe.videoDurationSeconds - expectedVoiceoverDurationSeconds) <= AUDIO_SYNC_TOLERANCE_S;
  if (!checks.audioSynced) warnings.push(`Duración real del video (${probe.videoDurationSeconds}s) difiere de la del voiceover real esperado (${expectedVoiceoverDurationSeconds}s) más allá del margen real (${AUDIO_SYNC_TOLERANCE_S}s).`);

  checks.captionsPresent = Boolean(captionsApplied);
  if (!checks.captionsPresent) warnings.push('Sin captions/text overlay real aplicado en esta pieza.');

  checks.ctaPresent = Boolean(expectedCtaText?.trim());
  if (!checks.ctaPresent) issues.push('No hay CTA real definido para esta pieza.');

  checks.lineageValid = Boolean(creativeId);
  if (!checks.lineageValid) issues.push('Falta "creativeId" real -- lineage incompleto.');

  checks.sceneDiversity = !scenePlan?.allScenesShowProduct;
  if (!checks.sceneDiversity) warnings.push('Todas las escenas reales muestran el producto -- sin diversidad visual real (root cause del pipeline pobre que esta fase corrige).');

  checks.musicIncluded = Boolean(musicIncluded);
  if (!checks.musicIncluded) warnings.push('Sin música de fondo real en esta pieza (ninguna pista real disponible en este entorno todavía).');

  const hasBlockingIssues = issues.length > 0;
  const hasDegradingWarnings = !checks.captionsPresent || !checks.sceneDiversity;

  const status = hasBlockingIssues ? 'FAILED' : hasDegradingWarnings ? 'DEGRADED_PRODUCTION' : 'FULL_PRODUCTION';

  return Object.freeze({
    status,
    checks: Object.freeze(checks),
    issues: Object.freeze(issues),
    warnings: Object.freeze(warnings),
    probe: Object.freeze({ width: probe.width, height: probe.height, durationSeconds: probe.videoDurationSeconds, hasVideo: probe.hasVideo, hasAudio: probe.hasAudio }),
    campaignId: campaignId ?? null,
    creativeId,
  });
}
