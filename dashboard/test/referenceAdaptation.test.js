// referenceAdaptation.test.js — Adaptar contenido / Video de referencia
// (2026-08-26). Servidor real, puerto efímero (mismo criterio que el resto
// de la suite). Cubre el flujo completo real: cargar referencia -> analizar
// -> reutilizar el análisis ya persistido -> generar propuestas reales ->
// verificar que cada propuesta trae los inputs (batchId/variantIndex) del
// pipeline YA existente -- nunca lanza una producción real por sí solo.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
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

// Reference Intelligence real (2026-08-27) -- video CON subtítulos
// embebidos reales, para probar el flujo HTTP completo de transcripción
// real + heurísticas reales de hook/CTA/problema/estructura.
const REFERENCE_VIDEO_WITH_SUBS = join(TEST_TMP_DIR, 'referencia-con-subs.mp4');
const SRT_PATH = join(TEST_TMP_DIR, 'referencia-subs.srt');
const SRT_CONTENT_HTTP = `1
00:00:00,000 --> 00:00:02,000
¿Por qué nadie te dijo esto antes?

2
00:00:02,000 --> 00:00:04,000
Es un problema real que casi todos enfrentan.

3
00:00:04,000 --> 00:00:06,000
Escríbenos por WhatsApp para conocer más.
`;
function generarVideoDeReferenciaConSubsReales() {
  const ffmpegBin = join(FFMPEG_BIN_DIR, 'ffmpeg.exe');
  writeFileSync(SRT_PATH, SRT_CONTENT_HTTP, 'utf8');
  const r = spawnSync(ffmpegBin, [
    '-y', '-f', 'lavfi', '-i', 'color=c=0x29361C:s=640x360:d=6:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6:sample_rate=48000',
    '-i', SRT_PATH,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-c:s', 'mov_text', '-movflags', '+faststart',
    REFERENCE_VIDEO_WITH_SUBS,
  ], { encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`No se pudo generar el video de referencia CON subtítulos reales: ${r.stderr}`);
}

let baseUrl;
let ingestedReferenceDir; // carpeta real bajo video-production/reference-analysis/<hash> -- se limpia en after().
const ingestedReferenceDirs = []; // varias referencias reales analizadas en esta suite -- todas se limpian en after().
before(() => new Promise((resolve, reject) => {
  generarVideoDeReferenciaReal();
  generarVideoDeReferenciaConSubsReales();
  if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
  server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  server.once('error', reject);
}));
after(async () => {
  await new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  rmSync(TEST_CO_DATA_ROOT, { recursive: true, force: true });
  if (ingestedReferenceDir) rmSync(ingestedReferenceDir, { recursive: true, force: true });
  for (const dir of ingestedReferenceDirs) rmSync(dir, { recursive: true, force: true });
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

  test('analiza un video de referencia real -- duración/formato reales (technicalAnalysis, sin duplicar), campos semánticos explícitamente no disponibles sin subtítulos embebidos', async () => {
    const { status, body } = await post('/api/adapt/reference/analyze', { sourcePath: REFERENCE_VIDEO });
    assert.equal(status, 200);
    assert.equal(body.reused, false);
    const { analysis } = body;
    ingestedReferenceDir = join('C:\\Users\\manue\\Vida Divina\\video-production\\reference-analysis', analysis.referenceId);
    const { technicalAnalysis } = analysis;
    assert.ok(Math.abs(technicalAnalysis.duration - 6) < 0.5);
    assert.equal(technicalAnalysis.aspectRatio, '16:9');
    assert.ok(technicalAnalysis.pacing.sceneCount >= 1);
    assert.ok(Array.isArray(technicalAnalysis.scenes) && technicalAnalysis.scenes.length >= 1);
    assert.ok(Array.isArray(technicalAnalysis.keyframes) && technicalAnalysis.keyframes.length >= 1);
    assert.ok(technicalAnalysis.keyframes[0].mediaUrl.startsWith('/media/video-production/'));
    // Reference Intelligence real -- sin subtítulos embebidos ni OCR/visión disponibles, todo explícito.
    assert.equal(analysis.transcript.available, false);
    assert.equal(analysis.hook.available, false);
    assert.equal(analysis.cta.available, false);
    assert.equal(analysis.onScreenText.available, false);
    assert.equal(analysis.visualStyle.available, false);
    assert.equal(analysis.people.available, false);
    assert.equal(analysis.productPresence.available, false);
    assert.ok(Array.isArray(analysis.semanticScenes) && analysis.semanticScenes.length === technicalAnalysis.scenes.length);
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

  test('un CampaignIntent real inválido (claim médico no permitido) se rechaza con 400 -- la referencia nunca fuerza un claim que el producto no tenga permitido (regla 15)', async () => {
    const { status, body } = await post('/api/adapt/reference/propose', {
      referenceId, productId: 'te-divina', targetAudience: 'adultos', problemOrNeed: 'el producto cura el estreñimiento crónico',
    });
    assert.equal(status, 400);
    assert.match(body.error, /CONFLICTO real|claim/i);
  });

  test('con CampaignIntent real (targetAudience+problemOrNeed) las propuestas se siguen generando -- prioridad real: CampaignIntent > Product Knowledge > estructura de la referencia', async () => {
    const { status, body } = await post('/api/adapt/reference/propose', {
      referenceId, productId: 'te-divina', targetAudience: 'personas con problemas digestivos', problemOrNeed: 'desintoxicación corporal antes de un programa de pérdida de peso',
    });
    assert.equal(status, 200);
    assert.equal(body.status, 'PROPOSALS_READY');
    assert.ok(body.proposals.length >= 2);
  });
});

describe('Reference Intelligence real vía HTTP (video con subtítulos embebidos reales)', () => {
  let referenceId, proposals;
  before(async () => {
    const analyzeRes = await post('/api/adapt/reference/analyze', { sourcePath: REFERENCE_VIDEO_WITH_SUBS });
    referenceId = analyzeRes.body.analysis.referenceId;
    ingestedReferenceDirs.push(join('C:\\Users\\manue\\Vida Divina\\video-production\\reference-analysis', referenceId));
    const proposeRes = await post('/api/adapt/reference/propose', { referenceId, productId: 'te-divina' });
    proposals = proposeRes.body.proposals;
  });

  test('transcript real disponible (subtítulos embebidos), hook real tipo "question", CTA real tipo "whatsapp"', async () => {
    const { body } = await post('/api/adapt/reference/analyze', { sourcePath: REFERENCE_VIDEO_WITH_SUBS });
    assert.equal(body.reused, true); // ya analizado en el before() -- reutiliza (regla 11/12).
    assert.equal(body.analysis.transcript.available, true);
    assert.equal(body.analysis.hook.available, true);
    assert.equal(body.analysis.hook.type, 'question');
    assert.equal(body.analysis.cta.available, true);
    assert.equal(body.analysis.cta.type, 'whatsapp');
    assert.equal(body.analysis.problem.available, true);
    assert.equal(body.analysis.narrativeStructure.available, true);
  });

  test('las propuestas reales exponen el hook/estructura real detectados de la referencia (referenceHook/referenceStructure)', () => {
    const estructural = proposals.find((p) => p.proposalKey === 'STRUCTURAL');
    assert.equal(estructural.referenceHook.available, true);
    assert.equal(estructural.referenceHook.type, 'question');
  });

  test('NUNCA copia el texto literal de la referencia -- el hook/CTA generado para Té Divina es distinto del texto real detectado en la referencia', () => {
    for (const p of proposals) {
      assert.notEqual(p.hook, p.referenceHook.available ? p.referenceHook.text : undefined);
      assert.ok(p.hook.length > 0 && p.cta.length > 0);
    }
  });
});
