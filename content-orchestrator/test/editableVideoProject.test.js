// editableVideoProject.test.js — Editable Video Project (2026-08-24).
// Prueba pura (sin ffmpeg/Chrome real) -- verifica que un ProductionJob
// real ya producido se envuelve correctamente en un proyecto editable,
// SIN volver a correr ninguna capa estratégica.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  buildEditableProjectFromProductionJob, getLatestVersion, currentSceneBaseDuration, currentSceneNarration,
  currentSceneOnScreenText, currentSceneOnScreenTextVisible, currentSceneCaptionsVisibility,
} from '../src/editableVideoProject.js';

// Forma real de un ProductionJob (tomada de un job real ya producido --
// ver docs/PROJECT_STATE_CHECKPOINT_2026-08-21_HUMAN_IN_THE_LOOP_WORKSPACE.md
// y validación real de esta fase, campaña Sculpt Black).
const PROJECT_DIR = 'C:\\fake\\produce-xyz';
const JOB_REAL = Object.freeze({
  status: 'FULL_PRODUCTION',
  campaignId: 'sculpt-black-e440e6b81e', batchId: 'batch-1', generationId: 'gen-1', creativeId: 'creative-1',
  script: { onScreenText: { hook: 'Hay algo real.', cta: 'Escríbenos por WhatsApp.' } },
  scenePlan: {
    scenes: [
      { sceneId: 'scene-1', startSeconds: 0, duration: 4.78, narration: 'Hay algo real.', visualIntent: 'CONCEPT_OPENING', visualType: 'TYPOGRAPHIC', visualPrompt: 'x', textOverlay: 'Hay algo real.' },
      { sceneId: 'scene-2', startSeconds: 4.78, duration: 5.58, narration: 'Reishi real.', visualIntent: 'PRODUCT_REVEAL', visualType: 'PRODUCT_ASSET', visualPrompt: 'Reishi real.', textOverlay: null },
      { sceneId: 'scene-3', startSeconds: 10.36, duration: 4.78, narration: 'Escríbenos por WhatsApp.', visualIntent: 'CTA_BRAND', visualType: 'TYPOGRAPHIC', visualPrompt: 'x', textOverlay: 'Escríbenos por WhatsApp.' },
    ],
  },
  assetPlan: [
    { sceneId: 'scene-1', source: 'TYPOGRAPHIC', imageSourcePath: null },
    { sceneId: 'scene-2', source: 'EXISTING_PRODUCT_ASSET', imageSourcePath: 'C:\\fake\\Sculpt_Black.png' },
    { sceneId: 'scene-3', source: 'TYPOGRAPHIC', imageSourcePath: null },
  ],
  musicSelection: { status: 'NO_TRACK_AVAILABLE', track: null },
  masterPath: join(PROJECT_DIR, 'master.mp4'),
  outputs: [{ profileName: 'INSTAGRAM_REEL', outputPath: join(PROJECT_DIR, 'output-INSTAGRAM_REEL.mp4'), status: 'COMPLETADO' }],
  qualityReports: [{ profileName: 'INSTAGRAM_REEL', status: 'FULL_PRODUCTION' }],
  costReport: { entries: [], estimatedTotal: 0, currency: 'USD' },
});
const JOB_RECORD_REAL = Object.freeze({ productionJobId: 'job-1', projectDir: PROJECT_DIR, job: JOB_REAL, createdAt: '2026-08-24T00:00:00.000Z' });

describe('buildEditableProjectFromProductionJob — envuelve un ProductionJob real sin duplicar su copy/estrategia', () => {
  test('produce 1 proyecto real con 3 escenas, referenciando (no copiando) el productionJobId', () => {
    const project = buildEditableProjectFromProductionJob({ jobRecord: JOB_RECORD_REAL });
    assert.equal(project.productionJobId, 'job-1');
    assert.equal(project.campaignId, 'sculpt-black-e440e6b81e');
    assert.equal(project.scenes.length, 3);
    assert.equal(project.versions.length, 1);
    assert.equal(project.versions[0].versionNumber, 1);
  });

  test('cada escena real referencia sus clips base reales por convención de disco (scene-N/proj.mp4, scene-N-audio.wav)', () => {
    const project = buildEditableProjectFromProductionJob({ jobRecord: JOB_RECORD_REAL });
    const scene2 = project.scenes.find((s) => s.sceneId === 'scene-2');
    assert.equal(scene2.baseClipPath, join(PROJECT_DIR, 'scene-2', 'proj.mp4'));
    assert.equal(scene2.baseAudioPath, join(PROJECT_DIR, 'scene-2-audio.wav'));
    assert.equal(scene2.baseImageSourcePath, 'C:\\fake\\Sculpt_Black.png');
    assert.equal(scene2.sceneKind, 'PRODUCT');
  });

  test('deriva sceneKind CTA/CONCEPT correctamente para las escenas tipográficas', () => {
    const project = buildEditableProjectFromProductionJob({ jobRecord: JOB_RECORD_REAL });
    assert.equal(project.scenes.find((s) => s.sceneId === 'scene-1').sceneKind, 'CONCEPT');
    assert.equal(project.scenes.find((s) => s.sceneId === 'scene-3').sceneKind, 'CTA');
  });

  test('ninguna escena real trae overrides al construir el proyecto (estado inicial = producción original, byte-idéntica)', () => {
    const project = buildEditableProjectFromProductionJob({ jobRecord: JOB_RECORD_REAL });
    for (const scene of project.scenes) {
      assert.equal(scene.captionStyleOverride, null);
      assert.equal(scene.textOverlaysOverride, null);
      assert.equal(scene.assetOverride, null);
      assert.equal(scene.onScreenTextOverride, null);
      assert.equal(scene.voiceTrack.isRegenerated, false);
    }
  });

  test('la versión 1 real ya trae sceneClipPaths apuntando a los clips base reales', () => {
    const project = buildEditableProjectFromProductionJob({ jobRecord: JOB_RECORD_REAL });
    const v1 = getLatestVersion(project);
    assert.equal(v1.sceneClipPaths['scene-2'], join(PROJECT_DIR, 'scene-2', 'proj.mp4'));
  });

  test('sin música real disponible en el ProductionJob, el proyecto real nace sin musicTrack', () => {
    const project = buildEditableProjectFromProductionJob({ jobRecord: JOB_RECORD_REAL });
    assert.equal(project.musicTrack, null);
  });

  test('rechaza envolver un ProductionJob real que falló', () => {
    assert.throws(() => buildEditableProjectFromProductionJob({
      jobRecord: { ...JOB_RECORD_REAL, job: { status: 'FAILED' } },
    }), /FAILED/);
  });

  // Fix Editor Hook/Voiceover/Captions (2026-08-25).
  test('cada escena real nace con las TRES capas separadas en su estado default (Auto/visible/sin regenerar)', () => {
    const project = buildEditableProjectFromProductionJob({ jobRecord: JOB_RECORD_REAL });
    for (const scene of project.scenes) {
      assert.equal(scene.captionsVisibility, 'AUTO');
      assert.equal(scene.onScreenTextVisible, true);
      assert.equal(scene.voiceoverTextOverride, null);
      assert.equal(scene.voiceTrack.durationSeconds, scene.duration);
      assert.equal(scene.voiceTrack.regeneratedAt, null);
    }
  });
});

describe('Helpers de "valor efectivo actual" — fuente única de verdad para projectEditor.js/projectRenderer.js (Fix Editor Hook/Voiceover/Captions)', () => {
  const project = buildEditableProjectFromProductionJob({ jobRecord: JOB_RECORD_REAL });
  const sceneNueva = project.scenes[0];

  test('sin overrides, los helpers devuelven los valores base reales de producción', () => {
    assert.equal(currentSceneBaseDuration(sceneNueva), sceneNueva.duration);
    assert.equal(currentSceneNarration(sceneNueva), sceneNueva.narration);
    assert.equal(currentSceneOnScreenText(sceneNueva), sceneNueva.onScreenText);
    assert.equal(currentSceneOnScreenTextVisible(sceneNueva), true);
    assert.equal(currentSceneCaptionsVisibility(sceneNueva), 'AUTO');
  });

  test('con voz regenerada real, currentSceneBaseDuration usa la duración del audio NUEVO, nunca la original', () => {
    const regenerada = { ...sceneNueva, voiceTrack: { ...sceneNueva.voiceTrack, isRegenerated: true, durationSeconds: 9.9 } };
    assert.equal(currentSceneBaseDuration(regenerada), 9.9);
  });

  test('con voiceoverTextOverride real, currentSceneNarration usa el override -- el onScreenText NUNCA se ve afectado', () => {
    const editada = { ...sceneNueva, voiceoverTextOverride: 'Un guion hablado real distinto.' };
    assert.equal(currentSceneNarration(editada), 'Un guion hablado real distinto.');
    assert.equal(currentSceneOnScreenText(editada), sceneNueva.onScreenText);
  });

  // Backward compatibility real: un proyecto guardado en disco ANTES de
  // este fix (JSON.parse crudo, ver editableProjectStore.js) no trae estos
  // campos -- simulado aquí quitándolos explícitamente del objeto escena.
  test('backward compatibility -- una escena real SIN estos campos (proyecto viejo) se comporta EXACTAMENTE igual que antes de este fix', () => {
    const { captionsVisibility, onScreenTextVisible, voiceoverTextOverride, ...escenaVieja } = sceneNueva;
    const voiceTrackViejo = { sourcePath: sceneNueva.voiceTrack.sourcePath, volume: 1, isRegenerated: false };
    const escenaLegacy = { ...escenaVieja, voiceTrack: voiceTrackViejo };
    assert.equal(currentSceneBaseDuration(escenaLegacy), sceneNueva.duration);
    assert.equal(currentSceneNarration(escenaLegacy), sceneNueva.narration);
    assert.equal(currentSceneOnScreenTextVisible(escenaLegacy), true);
    assert.equal(currentSceneCaptionsVisibility(escenaLegacy), 'AUTO');
  });
});
