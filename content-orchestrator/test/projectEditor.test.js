// projectEditor.test.js — Editable Video Project (2026-08-24). Prueba
// pura (sin ffmpeg/Chrome real) de applyProjectEdit()/classifyChangeset().

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyProjectEdit, applyVoiceRegeneration, classifyChangeset } from '../src/projectEditor.js';
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

  // Fix Editor Hook/Voiceover/Captions (2026-08-25) -- REGLA DE CAPAS: HOOK/
  // ON-SCREEN TEXT, VOICEOVER y CAPTIONS son TRES campos independientes.
  describe('Regla de Capas -- Hook/On-Screen Text, Voiceover y Captions nunca se pisan entre sí', () => {
    test('captionsVisibility real se edita y se valida (Auto/Mostrar/Ocultar)', () => {
      const project = proyectoBase();
      const edited = applyProjectEdit(project, { scenes: { 'scene-1': { captionsVisibility: 'HIDE' } } });
      assert.equal(edited.scenes.find((s) => s.sceneId === 'scene-1').captionsVisibility, 'HIDE');
      assert.throws(() => applyProjectEdit(project, { scenes: { 'scene-1': { captionsVisibility: 'DIAGONAL' } } }), /captionsVisibility/);
    });

    test('onScreenTextVisible real se edita y se valida boolean', () => {
      const project = proyectoBase();
      const edited = applyProjectEdit(project, { scenes: { 'scene-1': { onScreenTextVisible: false } } });
      assert.equal(edited.scenes.find((s) => s.sceneId === 'scene-1').onScreenTextVisible, false);
      assert.throws(() => applyProjectEdit(project, { scenes: { 'scene-1': { onScreenTextVisible: 'no' } } }), /onScreenTextVisible/);
    });

    test('editar voiceoverTextOverride NUNCA toca onScreenText/onScreenTextOverride ni voiceTrack (Problema 4: no regenera al escribir)', () => {
      const project = proyectoBase();
      const edited = applyProjectEdit(project, { scenes: { 'scene-1': { voiceoverTextOverride: 'Un guion hablado real distinto del Hook.' } } });
      const scene1 = edited.scenes.find((s) => s.sceneId === 'scene-1');
      assert.equal(scene1.voiceoverTextOverride, 'Un guion hablado real distinto del Hook.');
      assert.equal(scene1.onScreenText, 'Hook real.');
      assert.equal(scene1.onScreenTextOverride, null);
      assert.equal(scene1.voiceTrack.sourcePath, project.scenes[0].voiceTrack.sourcePath);
      assert.equal(scene1.voiceTrack.isRegenerated, false);
    });

    test('editar onScreenTextOverride NUNCA toca voiceoverTextOverride ni voiceTrack (Problema 4, dirección inversa)', () => {
      const project = proyectoBase();
      const edited = applyProjectEdit(project, { scenes: { 'scene-1': { onScreenTextOverride: 'Un Hook nuevo real.' } } });
      const scene1 = edited.scenes.find((s) => s.sceneId === 'scene-1');
      assert.equal(scene1.onScreenTextOverride, 'Un Hook nuevo real.');
      assert.equal(scene1.voiceoverTextOverride, null);
      assert.equal(scene1.voiceTrack.isRegenerated, false);
    });

    test('rechaza voiceoverTextOverride vacío', () => {
      const project = proyectoBase();
      assert.throws(() => applyProjectEdit(project, { scenes: { 'scene-1': { voiceoverTextOverride: '   ' } } }), /voiceoverTextOverride/);
    });
  });
});

describe('applyVoiceRegeneration — Problema 4 "EDITAR VOICEOVER DEBE REGENERAR LA VOZ", único camino real', () => {
  const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'apply-voice-regen-test-'));
  const NUEVO_AUDIO_PATH = join(TEST_TMP_DIR, 'nuevo-voiceover.wav');
  writeFileSync(NUEVO_AUDIO_PATH, Buffer.from('RIFF....WAVEfmt '));
  after(() => rmSync(TEST_TMP_DIR, { recursive: true, force: true }));

  test('sceneId real desconocido lanza', () => {
    const project = proyectoBase();
    assert.throws(() => applyVoiceRegeneration(project, 'scene-inventada', { audioSourcePath: NUEVO_AUDIO_PATH, audioDurationSeconds: 3 }), /desconocido/);
  });

  test('audioSourcePath real que no existe lanza', () => {
    const project = proyectoBase();
    assert.throws(() => applyVoiceRegeneration(project, 'scene-1', { audioSourcePath: 'C:/no/existe-real.wav', audioDurationSeconds: 3 }), /no existe realmente/);
  });

  test('audioDurationSeconds inválido lanza', () => {
    const project = proyectoBase();
    assert.throws(() => applyVoiceRegeneration(project, 'scene-1', { audioSourcePath: NUEVO_AUDIO_PATH, audioDurationSeconds: 0 }), /audioDurationSeconds/);
  });

  test('actualiza voiceTrack real (sourcePath/duración/lineage) y resetea durationOverride, SIN tocar el Hook', () => {
    const project = proyectoBase();
    const conOverridePrevio = applyProjectEdit(project, { scenes: { 'scene-1': { durationOverride: 2 } } });
    const regenerada = applyVoiceRegeneration(conOverridePrevio, 'scene-1', { audioSourcePath: NUEVO_AUDIO_PATH, audioDurationSeconds: 3.7 });
    const scene1 = regenerada.scenes.find((s) => s.sceneId === 'scene-1');
    assert.equal(scene1.voiceTrack.sourcePath, NUEVO_AUDIO_PATH);
    assert.equal(scene1.voiceTrack.durationSeconds, 3.7);
    assert.equal(scene1.voiceTrack.isRegenerated, true);
    assert.ok(scene1.voiceTrack.regeneratedAt);
    assert.equal(scene1.durationOverride, null); // el recorte anterior era relativo a la duración BASE anterior -- ya no aplica.
    assert.equal(scene1.onScreenText, 'Hook real.'); // el Hook NUNCA cambia al regenerar voz.
  });

  test('nunca muta el proyecto original (inmutable, mismo criterio que applyProjectEdit)', () => {
    const project = proyectoBase();
    const regenerada = applyVoiceRegeneration(project, 'scene-1', { audioSourcePath: NUEVO_AUDIO_PATH, audioDurationSeconds: 3.7 });
    assert.notEqual(regenerada, project);
    assert.equal(project.scenes.find((s) => s.sceneId === 'scene-1').voiceTrack.isRegenerated, false);
  });

  test('classifyChangeset detecta la regeneración real: re-render + voiceRegeneratedSceneIds', () => {
    const project = proyectoBase();
    const regenerada = applyVoiceRegeneration(project, 'scene-1', { audioSourcePath: NUEVO_AUDIO_PATH, audioDurationSeconds: 3.7 });
    const changeset = classifyChangeset(project.versions[0], regenerada);
    assert.ok(changeset.rerenderedSceneIds.includes('scene-1'));
    assert.ok(changeset.voiceRegeneratedSceneIds.includes('scene-1'));
    assert.deepEqual([...changeset.reusedSceneIds], ['scene-2']);
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

  // RENDER SOURCE OF TRUTH (Corrección "Consistencia de audio y
  // persistencia de ediciones de captions", 2026-08-29, Paso 9/13/24 del
  // encargo) -- caso real reportado: "usuario desactiva subtítulos, el
  // render final los vuelve a mostrar". Confirma que classifyChangeset()
  // real SIEMPRE detecta un cambio real de captionsVisibility (nunca lo
  // ignora en silencio) -- root cause real del bug estaba en el
  // FRONTEND (editor.js no capturaba el formulario antes de renderizar,
  // ver editor.js#captureCurrentSceneFormIfOpen), nunca aquí.
  test('B/D: desactivar captions real (captionsVisibility HIDE) SIEMPRE marca la escena real para re-render', () => {
    const project = proyectoBase();
    const edited = applyProjectEdit(project, { scenes: { 'scene-1': { captionsVisibility: 'HIDE' } } });
    const changeset = classifyChangeset(project.versions[0], edited);
    assert.deepEqual([...changeset.rerenderedSceneIds], ['scene-1']);
  });

  // TEXT OVERRIDE (Paso 12/24 del encargo) -- caso real reportado:
  // "usuario cambia el texto del CTA, el render final sigue mostrando el
  // texto anterior". classifyChangeset() real SIEMPRE detecta un cambio
  // real de onScreenTextOverride.
  test('C: editar el texto en pantalla real (onScreenTextOverride, ej. CTA) SIEMPRE marca la escena real para re-render', () => {
    const project = proyectoBase();
    const edited = applyProjectEdit(project, { ctaText: 'Escríbenos al +521416556' });
    const ctaSceneId = project.scenes.find((s) => s.sceneKind === 'CTA')?.sceneId ?? 'scene-2';
    const changeset = classifyChangeset(project.versions[0], edited);
    assert.ok(changeset.rerenderedSceneIds.includes(ctaSceneId), `la escena CTA real "${ctaSceneId}" debe marcarse para re-render tras editar su texto real`);
  });
});
