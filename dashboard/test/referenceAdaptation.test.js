// referenceAdaptation.test.js — Adaptar contenido / Video de referencia
// (2026-08-26). Servidor real, puerto efímero (mismo criterio que el resto
// de la suite). Cubre el flujo completo real: cargar referencia -> analizar
// -> reutilizar el análisis ya persistido -> generar propuestas reales ->
// verificar que cada propuesta trae los inputs (batchId/variantIndex) del
// pipeline YA existente -- nunca lanza una producción real por sí solo.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

// Aísla el store real de ReferenceAnalysis (y de lineage, que comparte la
// misma raíz) a un directorio temporal -- nunca escribe datos de prueba en
// content-orchestrator/data/ real (mismo criterio que server.test.js con
// HYPOTHESIS_BATCH_DATA_ROOT).
const TEST_CO_DATA_ROOT = mkdtempSync(join(tmpdir(), 'dash-refadapt-co-data-'));
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_CO_DATA_ROOT;

const { server } = await import('../server/index.js');

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'dash-refadapt-video-'));
const REFERENCE_VIDEO = join(TEST_TMP_DIR, 'referencia.mp4');

function generarVideoDeReferenciaReal() {
  const ffmpegBin = join(FFMPEG_BIN_DIR, 'ffmpeg.exe');
  const r = spawnSync(ffmpegBin, [
    '-y', '-f', 'lavfi', '-i', 'color=c=0x441C11:s=640x360:d=6:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6:sample_rate=48000',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    REFERENCE_VIDEO,
  ], { encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`No se pudo generar el video de referencia real de prueba: ${r.stderr}`);
}

let baseUrl;
let ingestedReferenceDir; // carpeta real bajo video-production/reference-analysis/<hash> -- se limpia en after().
before(() => new Promise((resolve, reject) => {
  generarVideoDeReferenciaReal();
  if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
  server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  server.once('error', reject);
}));
after(async () => {
  await new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  rmSync(TEST_CO_DATA_ROOT, { recursive: true, force: true });
  if (ingestedReferenceDir) rmSync(ingestedReferenceDir, { recursive: true, force: true });
});

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('POST /api/adapt/reference/analyze', () => {
  test('un sourcePath real inexistente -- 400, nunca inventa un análisis', async () => {
    const { status, body } = await post('/api/adapt/reference/analyze', { sourcePath: join(TEST_TMP_DIR, 'no-existe.mp4') });
    assert.equal(status, 400);
    assert.match(body.error, /no existe/);
  });

  test('analiza un video de referencia real -- duración/formato reales, estructura de escenas, keyframes reales, campos semánticos explícitamente no disponibles', async () => {
    const { status, body } = await post('/api/adapt/reference/analyze', { sourcePath: REFERENCE_VIDEO });
    assert.equal(status, 200);
    assert.equal(body.reused, false);
    const { analysis } = body;
    ingestedReferenceDir = join('C:\\Users\\manue\\Vida Divina\\video-production\\reference-analysis', analysis.referenceId);
    assert.ok(Math.abs(analysis.duration - 6) < 0.5);
    assert.equal(analysis.aspectRatio, '16:9');
    assert.ok(analysis.pacing.sceneCount >= 1);
    assert.ok(Array.isArray(analysis.scenes) && analysis.scenes.length >= 1);
    assert.ok(Array.isArray(analysis.keyframes) && analysis.keyframes.length >= 1);
    assert.ok(analysis.keyframes[0].mediaUrl.startsWith('/media/video-production/'));
    assert.equal(analysis.transcript.available, false);
    assert.equal(analysis.hook.available, false);
  });

  test('reanalizar el MISMO video real reutiliza el análisis ya persistido -- nunca vuelve a correr ffmpeg/ffprobe', async () => {
    const { status, body } = await post('/api/adapt/reference/analyze', { sourcePath: REFERENCE_VIDEO });
    assert.equal(status, 200);
    assert.equal(body.reused, true);
  });

  test('GET /api/adapt/reference/analyses incluye el análisis real recién creado', async () => {
    const { status, body } = await get('/api/adapt/reference/analyses');
    assert.equal(status, 200);
    assert.ok(body.some((a) => a.referenceId === ingestedReferenceDir.split(/[\\/]/).pop()));
  });
});

describe('POST /api/adapt/reference/propose', () => {
  let referenceId;
  before(async () => {
    const { body } = await post('/api/adapt/reference/analyze', { sourcePath: REFERENCE_VIDEO });
    referenceId = body.analysis.referenceId;
  });

  test('sin referenceId real -- 400', async () => {
    const { status } = await post('/api/adapt/reference/propose', { productId: 'te-divina' });
    assert.equal(status, 400);
  });

  test('referenceId real pero productId inexistente -- 400, nunca inventa un producto', async () => {
    const { status, body } = await post('/api/adapt/reference/propose', { referenceId, productId: 'producto-que-no-existe' });
    assert.equal(status, 400);
    assert.match(body.error, /producto real/);
  });

  test('referenceId que no existe -- 404', async () => {
    const { status } = await post('/api/adapt/reference/propose', { referenceId: 'id-inventado', productId: 'te-divina' });
    assert.equal(status, 404);
  });

  test('genera 2-3 propuestas reales para un producto real, cada una lista para producirse vía el pipeline YA existente', async () => {
    const { status, body } = await post('/api/adapt/reference/propose', { referenceId, productId: 'te-divina' });
    assert.equal(status, 200);
    assert.equal(body.status, 'PROPOSALS_READY');
    assert.ok(body.proposals.length >= 2 && body.proposals.length <= 3);
    for (const p of body.proposals) {
      assert.ok(p.label);
      assert.ok(p.batchId);
      assert.equal(typeof p.variantIndex, 'number');
      assert.equal(p.productNombreVisible, 'Té Divina'); // nunca "TéDivina" (nombre técnico)
      assert.ok(p.hook);
      assert.ok(p.cta);
    }

    // Handoff real al pipeline YA existente: la propuesta seleccionada se
    // produce con el MISMO endpoint que ya usa "Sugerir variantes" -- nunca
    // un segundo endpoint de producción. Solo se verifica el cableado
    // (batch real recuperable), sin lanzar un render real aquí (costoso).
    const batch = await get(`/api/create/hypothesis-batches?campaignId=te-divina`);
    assert.equal(batch.status, 200);
    assert.ok(batch.body.batches.some((b) => b.batchId === body.proposals[0].batchId));
  });
});
