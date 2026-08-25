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
