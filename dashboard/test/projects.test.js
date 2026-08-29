// projects.test.js — Editable Video Project (2026-08-24). Suite HTTP real
// del Dashboard sobre /api/projects* -- el render real (Chrome+ffmpeg) ya
// está cubierto de punta a punta en
// content-orchestrator/test/projectRenderer.test.js; esta suite cubre
// SOLO el cableado HTTP (crear/editar/listar un proyecto real, biblioteca
// de música real) contra un ProductionJob real pero mínimo (sin invocar
// Chrome/ffmpeg aquí -- mismo criterio de aislamiento que
// server.test.js: stores propios, nunca comparte data real).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;
const TEST_JOB_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-projects-test-job-'));
const TEST_PROJECT_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-projects-test-project-'));
process.env.PRODUCTION_JOB_DATA_ROOT = TEST_JOB_DATA_ROOT;
process.env.EDITABLE_PROJECT_DATA_ROOT = TEST_PROJECT_DATA_ROOT;

const { server } = await import('../server/index.js');
const { saveProductionJob } = await import('../../content-orchestrator/src/productionJobStore.js');

let baseUrl;
before(() => new Promise((resolve, reject) => {
  if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
  server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  server.once('error', reject);
}));
after(async () => {
  await new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  fs.rmSync(TEST_JOB_DATA_ROOT, { recursive: true, force: true });
  fs.rmSync(TEST_PROJECT_DATA_ROOT, { recursive: true, force: true });
});

async function get(p) {
  const res = await fetch(`${baseUrl}${p}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function post(p, body) {
  const res = await fetch(`${baseUrl}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const PROJECT_DIR = 'C:\\fake\\produce-http-test';
const JOB_REAL = Object.freeze({
  status: 'FULL_PRODUCTION', campaignId: 'c1', batchId: 'b1', generationId: 'g1', creativeId: 'creative-http-1',
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

let productionJobId;
before(() => {
  ({ productionJobId } = saveProductionJob({ job: JOB_REAL, projectDir: PROJECT_DIR }));
});

describe('POST /api/projects — crea un EditableVideoProject real sobre un ProductionJob real', () => {
  test('sin productionJobId responde 400', async () => {
    const { status, body } = await post('/api/projects', {});
    assert.equal(status, 400);
    assert.match(body.error, /productionJobId/);
  });

  test('un productionJobId real inexistente responde 404', async () => {
    const { status } = await post('/api/projects', { productionJobId: 'no-existe-real' });
    assert.equal(status, 404);
  });

  test('crea el proyecto real con 2 escenas y versión 1', async () => {
    const { status, body } = await post('/api/projects', { productionJobId });
    assert.equal(status, 200);
    assert.equal(body.scenes.length, 2);
    assert.equal(body.versions.length, 1);
    assert.equal(body.productionJobId, productionJobId);
  });
});

describe('GET /api/projects/:id y GET /api/projects?creativeId= — recuperación real', () => {
  let projectId;
  before(async () => {
    const { body } = await post('/api/projects', { productionJobId });
    projectId = body.projectId;
  });

  test('GET /api/projects/:id devuelve el proyecto real ya guardado', async () => {
    const { status, body } = await get(`/api/projects/${projectId}`);
    assert.equal(status, 200);
    assert.equal(body.projectId, projectId);
  });

  test('GET /api/projects/:id sobre un id real inexistente responde 404', async () => {
    const { status } = await get('/api/projects/no-existe-real');
    assert.equal(status, 404);
  });

  test('GET /api/projects?creativeId= lista los proyectos reales de esa creatividad', async () => {
    const { status, body } = await get('/api/projects?creativeId=creative-http-1');
    assert.equal(status, 200);
    assert.ok(body.projects.some((p) => p.projectId === projectId));
  });
});

describe('POST /api/projects/:id/edit — Save real del draft, sin renderizar', () => {
  let projectId;
  before(async () => {
    const { body } = await post('/api/projects', { productionJobId });
    projectId = body.projectId;
  });

  test('aplica un cambio real de captionStyle y CTA, devuelve el changeset pendiente', async () => {
    const { status, body } = await post(`/api/projects/${projectId}/edit`, {
      edits: { ctaText: 'Escríbenos YA', scenes: { 'scene-1': { captionStyleOverride: { fontSizePx: 55 } } } },
    });
    assert.equal(status, 200);
    assert.equal(body.project.scenes.find((s) => s.sceneKind === 'CTA').onScreenTextOverride, 'Escríbenos YA');
    assert.equal(body.project.scenes.find((s) => s.sceneId === 'scene-1').captionStyleOverride.fontSizePx, 55);
    assert.deepEqual([...body.pendingChangeset.rerenderedSceneIds].sort(), ['scene-1', 'scene-2']);
  });

  test('una edición real inválida (asset inexistente) responde 400, nunca 500', async () => {
    const { status, body } = await post(`/api/projects/${projectId}/edit`, {
      edits: { scenes: { 'scene-1': { assetOverride: { source: 'EXISTING_ASSET', imageSourcePath: 'C:/no/existe.png' } } } },
    });
    assert.equal(status, 400);
    assert.match(body.error, /no existe realmente/);
  });
});

describe('GET /api/music-library — biblioteca real con licencia conocida', () => {
  test('devuelve las pistas reales sintetizadas de esta fase, cada una con licencia real', async () => {
    const { status, body } = await get('/api/music-library');
    assert.equal(status, 200);
    assert.ok(body.tracks.length >= 2);
    for (const track of body.tracks) {
      assert.ok(track.license, `la pista "${track.filename}" no trae licencia real -- nunca debería listarse.`);
      assert.ok(track.license.license?.trim());
    }
  });
});

// Fix Editor Hook/Voiceover/Captions (2026-08-25).
describe('GET /api/caption-style-options — opciones/presets reales de captionStyle.js (nunca duplicados en el cliente)', () => {
  test('expone posiciones/alineaciones/animaciones/modos/presets reales', async () => {
    const { status, body } = await get('/api/caption-style-options');
    assert.equal(status, 200);
    assert.deepEqual(body.visibilityModes, ['AUTO', 'SHOW', 'HIDE']);
    assert.deepEqual(body.presetNames, ['CLASSIC', 'BOLD', 'MINIMAL', 'HIGHLIGHT', 'SOCIAL_DYNAMIC']);
    assert.equal(body.presets.BOLD.presetId, 'BOLD');
    assert.equal(body.presets.BOLD.fontWeight, 800);
    assert.equal(body.presets.CLASSIC.position, 'bottom');
  });
});

describe('POST /api/projects/:id/edit — captions Auto/Mostrar/Ocultar + Hook visible/oculto (Problema 1/2)', () => {
  let projectId;
  before(async () => {
    const { body } = await post('/api/projects', { productionJobId });
    projectId = body.projectId;
  });

  test('captionsVisibility real se guarda y se refleja en la escena', async () => {
    const { status, body } = await post(`/api/projects/${projectId}/edit`, {
      edits: { scenes: { 'scene-1': { captionsVisibility: 'HIDE' } } },
    });
    assert.equal(status, 200);
    assert.equal(body.project.scenes.find((s) => s.sceneId === 'scene-1').captionsVisibility, 'HIDE');
  });

  test('captionsVisibility inválida responde 400, nunca 500', async () => {
    const { status, body } = await post(`/api/projects/${projectId}/edit`, {
      edits: { scenes: { 'scene-1': { captionsVisibility: 'DIAGONAL' } } },
    });
    assert.equal(status, 400);
    assert.match(body.error, /captionsVisibility/);
  });

  test('onScreenTextVisible real se guarda sin tocar voiceoverTextOverride ni voiceTrack (Regla de Capas)', async () => {
    const { status, body } = await post(`/api/projects/${projectId}/edit`, {
      edits: { scenes: { 'scene-1': { onScreenTextVisible: false } } },
    });
    assert.equal(status, 200);
    const scene1 = body.project.scenes.find((s) => s.sceneId === 'scene-1');
    assert.equal(scene1.onScreenTextVisible, false);
    assert.equal(scene1.voiceoverTextOverride, null);
    assert.equal(scene1.voiceTrack.isRegenerated, false);
  });

  test('voiceoverTextOverride real se guarda como draft SIN regenerar voz (voiceTrack intacto)', async () => {
    const { status, body } = await post(`/api/projects/${projectId}/edit`, {
      edits: { scenes: { 'scene-1': { voiceoverTextOverride: 'Un guion hablado real distinto.' } } },
    });
    assert.equal(status, 200);
    const scene1 = body.project.scenes.find((s) => s.sceneId === 'scene-1');
    assert.equal(scene1.voiceoverTextOverride, 'Un guion hablado real distinto.');
    assert.equal(scene1.voiceTrack.isRegenerated, false);
    assert.equal(scene1.onScreenText, 'Hook real.'); // el Hook nunca cambia al editar voiceover.
  });
});

describe('POST /api/projects/:id/scenes/:sceneId/regenerate-voice — Problema 4 (Voice Engine real, único camino)', () => {
  let projectId;
  before(async () => {
    const { body } = await post('/api/projects', { productionJobId });
    projectId = body.projectId;
  });

  test('sceneId real inexistente responde 404', async () => {
    const { status, body } = await post(`/api/projects/${projectId}/scenes/scene-inventada/regenerate-voice`, { voiceoverText: 'x' });
    assert.equal(status, 404);
    assert.match(body.error, /scene-inventada/);
  });

  test('projectId real inexistente responde 404', async () => {
    const { status } = await post('/api/projects/no-existe-real/scenes/scene-1/regenerate-voice', { voiceoverText: 'x' });
    assert.equal(status, 404);
  });

  test('un voiceoverText con un claim prohibido real se rechaza (200 + VALIDATION_FAILED) ANTES de llamar a Voice Engine', async () => {
    const { status, body } = await post(`/api/projects/${projectId}/scenes/scene-1/regenerate-voice`, {
      voiceoverText: 'Este producto cura el envejecimiento por completo.',
    });
    assert.equal(status, 200);
    assert.equal(body.status, 'VALIDATION_FAILED');
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  });

  test('Voice Engine real disponible: regenera la voz de la escena y sincroniza narración/duración', async (t) => {
    const health = await fetch('http://localhost:8000/health').catch(() => null);
    if (!health?.ok) { t.skip('Voice Engine no está reachable en este entorno -- se omite (cubierto por unit tests de projectEditor.js).'); return; }

    const marker = `EDITOR VOICE REGEN TEST ${Date.now()}`;
    const { status, body } = await post(`/api/projects/${projectId}/scenes/scene-1/regenerate-voice`, { voiceoverText: marker });
    assert.equal(status, 200);
    const scene1 = body.project.scenes.find((s) => s.sceneId === 'scene-1');
    assert.equal(scene1.voiceoverTextOverride, marker);
    assert.equal(scene1.voiceTrack.isRegenerated, true);
    assert.ok(scene1.voiceTrack.regeneratedAt);
    assert.ok(body.pendingChangeset.voiceRegeneratedSceneIds.includes('scene-1'));
    assert.ok(body.pendingChangeset.rerenderedSceneIds.includes('scene-1'));

    // AUDIO CONSISTENCY (Corrección "Consistencia de audio y
    // persistencia de ediciones de captions", 2026-08-29, Paso 2/6/7 del
    // encargo): la regeneración real deja lineage real de timing/params
    // -- nunca solo sourcePath/duración crudos.
    assert.equal(typeof scene1.voiceTrack.targetDurationMs, 'number');
    assert.equal(typeof scene1.voiceTrack.actualDurationMs, 'number');
    assert.equal(typeof scene1.voiceTrack.voiceTimingMismatch, 'boolean');
    assert.ok(scene1.voiceTrack.voiceParams, 'voiceParams real (Paso 2/7) debe quedar persistido tras regenerar');
    assert.equal(scene1.voiceTrack.voiceParams.voiceProfileId, 'manuel_es_mx');
    assert.equal(typeof body.voiceTimingMismatch, 'boolean');
  });

  test('una SEGUNDA regeneración real de la MISMA escena reutiliza los MISMOS voiceParams reales ya usados (Paso 2/7: consistencia entre regeneraciones sucesivas)', async (t) => {
    const health = await fetch('http://localhost:8000/health').catch(() => null);
    if (!health?.ok) { t.skip('Voice Engine no está reachable en este entorno -- se omite (cubierto por unit tests de projectEditor.js).'); return; }

    const { body: after1 } = await post(`/api/projects/${projectId}/scenes/scene-1/regenerate-voice`, { voiceoverText: `Primera regeneración real ${Date.now()}` });
    const voiceParams1 = after1.project.scenes.find((s) => s.sceneId === 'scene-1').voiceTrack.voiceParams;

    const { body: after2 } = await post(`/api/projects/${projectId}/scenes/scene-1/regenerate-voice`, { voiceoverText: `Segunda regeneración real ${Date.now()}` });
    const voiceParams2 = after2.project.scenes.find((s) => s.sceneId === 'scene-1').voiceTrack.voiceParams;

    assert.deepEqual(voiceParams2, voiceParams1, 'los parámetros reales de voz deben ser IDÉNTICOS entre regeneraciones sucesivas de la MISMA escena');
  });
});
