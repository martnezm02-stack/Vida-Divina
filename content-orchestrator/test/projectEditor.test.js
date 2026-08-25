// projectEditor.test.js — Editable Video Project (2026-08-24). Prueba
// pura (sin ffmpeg/Chrome real) de applyProjectEdit()/classifyChangeset().

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyProjectEdit, classifyChangeset } from '../src/projectEditor.js';
import { buildEditableProjectFromProductionJob } from '../src/editableVideoProject.js';

const PROJECT_DIR = 'C:\\fake\\produce-xyz';
const REAL_PNG_PATH = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\sculpt-black\\raw\\Sculpt_Black.png';

const JOB_REAL = Object.freeze({
  status: 'FULL_PRODUCTION', campaignId: 'c1', batchId: 'b1', generationId: 'g1', creativeId: 'cr1',
  script: { onScreenText: { hook: 'Hook real.', cta: 'Escríbenos.' } },
  scenePlan: {
    scenes: [
      { sceneId: 'scene-1', startSeconds: 0, duration: 5, narration: 'Hook real.', visualIntent: 'CONCEPT_OPENING', visualType: 'TYPOGRAPHIC', visualPrompt: 'x', textOverlay: 'Hook real.' },
      { sceneId: 'scene-2', startSeconds: 5, duration: 4, narration: 'Escríbenos.', visualIntent: 'CTA_BRAND', visualType: 'TYPOGRAPHIC', visualPrompt: 'x', textOverlay: 'Escríbenos.' },
    ],
  },
  assetPlan: [
    { sceneId: 'scene-1', source: 'TYPOGRAPHIC', imageSourcePath: null },
    { sceneId: 'scene-2', source: 'TYPOGRAPHIC', imageSourcePath: null },
  ],
  musicSelection: { status: 'NO_TRACK_AVAILABLE', track: null },
  masterPath: `${PROJECT_DIR}\\master.mp4`,
  outputs: [{ profileName: 'INSTAGRAM_REEL', outputPath: `${PROJECT_DIR}\\output-INSTAGRAM_REEL.mp4`, status: 'COMPLETADO' }],
  qualityReports: [], costReport: { entries: [], estimatedTotal: 0, currency: 'USD' },
});
const JOB_RECORD_REAL = Object.freeze({ productionJobId: 'job-1', projectDir: PROJECT_DIR, job: JOB_REAL, createdAt: '2026-08-24T00:00:00.000Z' });

function proyectoBase() {
  return buildEditableProjectFromProductionJob({ jobRecord: JOB_RECORD_REAL });
}

describe('applyProjectEdit — ediciones reales, inmutables, validadas', () => {
  test('edita el captionStyle de UNA escena real sin tocar las demás', () => {
    const project = proyectoBase();
    const edited = applyProjectEdit(project, { scenes: { 'scene-1': { captionStyleOverride: { fontSizePx: 60 } } } });
    assert.equal(edited.scenes.find((s) => s.sceneId === 'scene-1').captionStyleOverride.fontSizePx, 60);
    assert.equal(edited.scenes.find((s) => s.sceneId === 'scene-2').captionStyleOverride, null);
    assert.notEqual(edited, project); // inmutable -- nunca muta el original.
  });

  test('ctaText de alto nivel se traduce al onScreenTextOverride real de la escena CTA', () => {
    const project = proyectoBase();
    const edited = applyProjectEdit(project, { ctaText: 'Escríbenos AHORA por WhatsApp' });
    const cta = edited.scenes.find((s) => s.sceneKind === 'CTA');
    assert.equal(cta.onScreenTextOverride, 'Escríbenos AHORA por WhatsApp');
  });

  test('assetOverride EXISTING_ASSET real exige que el archivo exista realmente', () => {
    const project = proyectoBase();
    assert.throws(() => applyProjectEdit(project, { scenes: { 'scene-1': { assetOverride: { source: 'EXISTING_ASSET', imageSourcePath: 'C:/no/existe.png' } } } }), /no existe realmente/);
  });

  test('assetOverride EXISTING_ASSET real con un archivo que sí existe se acepta', () => {
    const project = proyectoBase();
    const edited = applyProjectEdit(project, { scenes: { 'scene-1': { assetOverride: { source: 'EXISTING_ASSET', imageSourcePath: REAL_PNG_PATH } } } });
    assert.equal(edited.scenes.find((s) => s.sceneId === 'scene-1').assetOverride.imageSourcePath, REAL_PNG_PATH);
  });

  test('durationOverride real no puede exceder la duración original (nunca alarga)', () => {
    const project = proyectoBase();
    assert.throws(() => applyProjectEdit(project, { scenes: { 'scene-1': { durationOverride: 999 } } }), /no puede ser mayor/);
  });

  test('durationOverride real puede acortar', () => {
    const project = proyectoBase();
    const edited = applyProjectEdit(project, { scenes: { 'scene-1': { durationOverride: 2 } } });
    assert.equal(edited.scenes.find((s) => s.sceneId === 'scene-1').durationOverride, 2);
  });

  test('musicTrack real se puede establecer y quitar (null)', () => {
    const project = proyectoBase();
    const conMusica = applyProjectEdit(project, { musicTrack: { trackFilename: 'ambient-calm-01.wav', volume: 0.1, startSeconds: 0, fadeInSeconds: 0.5, fadeOutSeconds: 0.5 } });
    assert.equal(conMusica.musicTrack.trackFilename, 'ambient-calm-01.wav');
    const sinMusica = applyProjectEdit(conMusica, { musicTrack: null });
    assert.equal(sinMusica.musicTrack, null);
  });

  test('rechaza un sceneId real desconocido', () => {
    const project = proyectoBase();
    assert.throws(() => applyProjectEdit(project, { scenes: { 'scene-inventada': { onScreenTextOverride: 'x' } } }), /desconocido/);
  });

  test('voiceTrack.volume real se valida (>= 0)', () => {
    const project = proyectoBase();
    assert.throws(() => applyProjectEdit(project, { scenes: { 'scene-1': { voiceTrack: { volume: -1 } } } }), /volume/);
  });
});

describe('classifyChangeset — decide qué escenas reales necesitan re-render vs reutilización', () => {
  test('sin cambios reales, todas las escenas se reutilizan', () => {
    const project = proyectoBase();
    const changeset = classifyChangeset(project.versions[0], project);
    assert.deepEqual([...changeset.rerenderedSceneIds], []);
    assert.deepEqual([...changeset.reusedSceneIds], ['scene-1', 'scene-2']);
    assert.equal(changeset.noVisualChanges, true);
  });

  test('cambiar el captionStyle de UNA escena solo marca esa escena para re-render', () => {
    const project = proyectoBase();
    const edited = applyProjectEdit(project, { scenes: { 'scene-1': { captionStyleOverride: { fontSizePx: 60 } } } });
    const changeset = classifyChangeset(project.versions[0], edited);
    assert.deepEqual([...changeset.rerenderedSceneIds], ['scene-1']);
    assert.deepEqual([...changeset.reusedSceneIds], ['scene-2']);
  });

  test('cambiar el globalCaptionStyle afecta a las escenas SIN override propio, nunca a las que ya tienen uno', () => {
    const project = proyectoBase();
    const conOverridePropio = applyProjectEdit(project, { scenes: { 'scene-2': { captionStyleOverride: { fontSizePx: 30 } } } });
    // Renderiza una v2 "virtual" (solo para el snapshot de comparación) tratando conOverridePropio como si ya estuviera en versions[0].
    const v1ConOverride = { ...project.versions[0], projectSnapshot: { ...project.versions[0].projectSnapshot, scenes: conOverridePropio.scenes } };
    const conGlobal = applyProjectEdit(conOverridePropio, { globalCaptionStyle: { fontSizePx: 70 } });
    const changeset = classifyChangeset(v1ConOverride, conGlobal);
    assert.deepEqual([...changeset.rerenderedSceneIds], ['scene-1']); // scene-2 tiene su propio override -- el global no la toca.
  });

  test('solo música cambiada -> musicOnly real, cero escenas para re-render', () => {
    const project = proyectoBase();
    const edited = applyProjectEdit(project, { musicTrack: { trackFilename: 'ambient-calm-01.wav', volume: 0.1, startSeconds: 0, fadeInSeconds: 0.5, fadeOutSeconds: 0.5 } });
    const changeset = classifyChangeset(project.versions[0], edited);
    assert.equal(changeset.musicOnly, true);
    assert.equal(changeset.rerenderedSceneIds.length, 0);
  });

  test('solo formatos de salida cambiados -> formatsOnly real', () => {
    const project = proyectoBase();
    const edited = applyProjectEdit(project, { outputProfileNames: ['INSTAGRAM_REEL', 'INSTAGRAM_FEED'] });
    const changeset = classifyChangeset(project.versions[0], edited);
    assert.equal(changeset.formatsOnly, true);
  });
});
