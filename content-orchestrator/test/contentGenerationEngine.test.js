// contentGenerationEngine.test.js — dispatcher + EDIT_ENHANCE/ADAPT reales
// (rápidos, con fixture hermética generada por ffmpeg) + validación de
// errores explícitos. La prueba REAL completa de CREATE (con Voice Engine
// real y HyperFrames real) vive en test/real-create-te-divina.mjs (Parte
// "PRUEBA REAL CREATE") -- no se repite aquí como unit test por su costo
// (varios minutos de TTS real).

import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseContentGenerationRequest } from '../src/contentGenerationRequest.js';
import { generateContent, GENERATION_STATUS, runCreate, runEdit, runAdapt } from '../src/contentGenerationEngine.js';
import { lineageExists, getLineage } from '../src/assetLineage.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';

const TEST_DATA_ROOT = mkdtempSync(join(tmpdir(), 'cge-data-'));
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_DATA_ROOT;

const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'cge-test-'));
const REAL_MP4 = join(TEST_TMP_DIR, '_fixture.mp4');

function regenerarFixture() {
  const r = spawnSync(join(FFMPEG_BIN_DIR, 'ffmpeg.exe'), [
    '-y', '-f', 'lavfi', '-i', 'color=c=0x29361C:s=1080x1920:d=6:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6:sample_rate=48000',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', REAL_MP4,
  ], { encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`fixture: ${r.stderr}`);
}

beforeEach(() => regenerarFixture());
after(() => { rmSync(TEST_TMP_DIR, { recursive: true, force: true }); rmSync(TEST_DATA_ROOT, { recursive: true, force: true }); });

describe('generateContent — dispatch explícito', () => {
  test('GENERATION_STATUS expone exactamente el vocabulario pedido', () => {
    assert.deepEqual([...GENERATION_STATUS].sort(), [
      'COMPLETED', 'MISSING_PRODUCT_FACTS', 'PARTIAL', 'POSTPRODUCTION_FAILED',
      'RENDER_FAILED', 'SOURCE_ASSET_REQUIRED', 'UNSUPPORTED_LOCAL_OPERATION', 'VALIDATION_FAILED',
    ]);
  });

  test('rechaza un request sin mode real', () => {
    assert.throws(() => generateContent({}), /ContentGenerationRequest real/);
  });

  test('dispatch a runCreate/runEdit/runAdapt según request.mode', () => {
    const createReq = parseContentGenerationRequest({ rawText: 'x', productId: 'te-divina' });
    const editReq = parseContentGenerationRequest({ rawText: 'mejora este video', sourceAsset: { type: 'VIDEO', path: 'no-importa.mp4' } });
    const adaptReq = parseContentGenerationRequest({ rawText: 'adapta para instagram', sourceAsset: { type: 'VIDEO', path: 'no-importa.mp4' }, outputProfiles: ['INSTAGRAM_REEL'] });
    assert.equal(generateContent(createReq, {}).mode, 'CREATE');
    assert.equal(generateContent(editReq, { operations: [] }).mode, 'EDIT_ENHANCE');
    assert.equal(generateContent(adaptReq, { outputDir: TEST_TMP_DIR }).mode, 'ADAPT');
  });
});

describe('CREATE — validación explícita, sin render (errores tempranos)', () => {
  test('sin productId real reporta MISSING_PRODUCT_FACTS, nunca inventa un producto', () => {
    const req = parseContentGenerationRequest({ rawText: 'crear un anuncio' });
    const result = runCreate(req, { renderArgs: {}, audioSourcePath: 'no-importa.wav', audioDurationSeconds: 3, outputProfileNames: ['GENERIC_VERTICAL'], projectDir: join(TEST_TMP_DIR, 'proj') });
    assert.equal(result.status, 'MISSING_PRODUCT_FACTS');
  });

  test('sin Audio Asset real reporta SOURCE_ASSET_REQUIRED, nunca fabrica una voz', () => {
    const req = parseContentGenerationRequest({ rawText: 'crear un anuncio', productId: 'te-divina' });
    const result = runCreate(req, { renderArgs: {}, productId: 'te-divina', audioSourcePath: 'C:/no/existe.wav', audioDurationSeconds: 3, outputProfileNames: ['GENERIC_VERTICAL'], projectDir: join(TEST_TMP_DIR, 'proj') });
    assert.equal(result.status, 'SOURCE_ASSET_REQUIRED');
  });
});

describe('EDIT_ENHANCE — real, rápido (fixture hermética)', () => {
  test('aplica LOUDNESS_NORMALIZATION real, conserva el original intacto, registra lineage', () => {
    const req = parseContentGenerationRequest({ rawText: 'Mejora este video: normaliza el audio.', sourceAsset: { type: 'VIDEO', path: REAL_MP4 } });
    assert.equal(req.mode, 'EDIT_ENHANCE');
    const outDir = join(TEST_TMP_DIR, 'edit-out-1');
    const result = generateContent(req, { operations: ['LOUDNESS_NORMALIZATION'], outputDir: outDir, ffmpegBinDir: FFMPEG_BIN_DIR });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.sourceAssets[0], REAL_MP4);
    assert.equal(result.derivedAssets.length, 1);
    assert.ok(existsSync(result.outputAssets[0].path));
    assert.notEqual(result.outputAssets[0].path, REAL_MP4); // el original nunca se sobrescribe.
    assert.ok(existsSync(REAL_MP4)); // el original sigue existiendo, intacto.
    assert.equal(lineageExists(result.derivedAssets[0].assetId), true);
    const lin = getLineage(result.derivedAssets[0].assetId);
    assert.equal(lin.operation, 'EDIT:LOUDNESS_NORMALIZATION');
  });

  test('sin sourceAsset real reporta SOURCE_ASSET_REQUIRED', () => {
    const req = parseContentGenerationRequest({ rawText: 'Mejora este video.', sourceAsset: { type: 'VIDEO', path: 'C:/no/existe.mp4' } });
    const result = generateContent(req, { operations: ['LOUDNESS_NORMALIZATION'], outputDir: TEST_TMP_DIR });
    assert.equal(result.status, 'SOURCE_ASSET_REQUIRED');
  });

  test('sin operations reporta VALIDATION_FAILED, nunca asume una operación', () => {
    const req = parseContentGenerationRequest({ rawText: 'Mejora este video.', sourceAsset: { type: 'VIDEO', path: REAL_MP4 } });
    const result = generateContent(req, { operations: [], outputDir: TEST_TMP_DIR });
    assert.equal(result.status, 'VALIDATION_FAILED');
  });

  test('una operación real UNSUPPORTED_LOCAL_OPERATION se refleja como status UNSUPPORTED_LOCAL_OPERATION, nunca se finge aplicada', () => {
    const req = parseContentGenerationRequest({ rawText: 'Reordena las escenas de este video.', sourceAsset: { type: 'VIDEO', path: REAL_MP4 } });
    const result = generateContent(req, { operations: ['REORDER'], outputDir: join(TEST_TMP_DIR, 'edit-out-2'), ffmpegBinDir: FFMPEG_BIN_DIR });
    assert.equal(result.status, 'UNSUPPORTED_LOCAL_OPERATION');
    assert.ok(result.warnings.some((w) => w.includes('REORDER')));
  });

  test('MINIMAL_REPROCESSING: EDIT nunca importa/invoca Voice Engine ni HyperFrames', async () => {
    const contenido = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/contentGenerationEngine.js', import.meta.url), 'utf8'));
    // runEdit específicamente no debe depender de renderVisualProductionPackage ni de audioAssetAdapter.
    const runEditSource = contenido.slice(contenido.indexOf('function runEdit'), contenido.indexOf('// ---------------------------------------------------------------------\n// ADAPT'));
    assert.ok(!runEditSource.includes('renderVisualProductionPackage'));
    assert.ok(!runEditSource.includes('audioAssetAdapter'));
  });
});

describe('ADAPT — real, rápido (fixture hermética)', () => {
  test('deriva 3 Output Profiles reales del mismo master, registra lineage por cada uno', () => {
    // outputProfiles explícito (en vez de solo confiar en el detector de texto libre):
    // la palabra "Reel" referida al ASSET FUENTE ("convierte este Reel...") puede
    // detectarse también como un perfil de destino (INSTAGRAM_REEL) por el
    // clasificador determinista -- limitación real y documentada del
    // reconocimiento por patrón (mismo gap que contentRequest.js), no se intenta
    // resolver aquí con NLU real.
    const req = parseContentGenerationRequest({
      rawText: 'Convierte este video para Facebook Reel, YouTube Short y WhatsApp.',
      sourceAsset: { type: 'VIDEO', path: REAL_MP4 },
      outputProfiles: ['FACEBOOK_REEL', 'YOUTUBE_SHORT', 'WHATSAPP_VIDEO'],
    });
    assert.equal(req.mode, 'ADAPT');
    const outDir = join(TEST_TMP_DIR, 'adapt-out-1');
    const result = generateContent(req, { outputDir: outDir, ffmpegBinDir: FFMPEG_BIN_DIR });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.outputAssets.length, 3);
    for (const out of result.outputAssets) {
      assert.ok(existsSync(out.path));
      assert.equal(lineageExists(out.assetId), true);
      assert.equal(getLineage(out.assetId).sourceAssetIds.length, 1);
    }
  });

  test('sin sourceAsset real reporta SOURCE_ASSET_REQUIRED', () => {
    const req = parseContentGenerationRequest({ rawText: 'Adapta para Instagram.', sourceAsset: { type: 'VIDEO', path: 'C:/no/existe.mp4' }, outputProfiles: ['INSTAGRAM_REEL'] });
    const result = generateContent(req, { outputDir: TEST_TMP_DIR });
    assert.equal(result.status, 'SOURCE_ASSET_REQUIRED');
  });

  test('un Output Profile desconocido reporta VALIDATION_FAILED antes de procesar nada', () => {
    const req = parseContentGenerationRequest({ rawText: 'Adapta.', sourceAsset: { type: 'VIDEO', path: REAL_MP4 }, forcedMode: 'ADAPT', outputProfiles: ['TIKTOK_VIDEO'] });
    const result = generateContent(req, { outputDir: TEST_TMP_DIR });
    assert.equal(result.status, 'VALIDATION_FAILED');
  });

  test('MINIMAL_REPROCESSING: ADAPT nunca importa/invoca Voice Engine ni HyperFrames', async () => {
    const fs = await import('node:fs');
    const contenido = fs.readFileSync(new URL('../src/contentGenerationEngine.js', import.meta.url), 'utf8');
    const runAdaptSource = contenido.slice(contenido.indexOf('function runAdapt'), contenido.indexOf('// ---------------------------------------------------------------------\n// Dispatcher'));
    assert.ok(!runAdaptSource.includes('renderVisualProductionPackage'));
    assert.ok(!runAdaptSource.includes('audioAssetAdapter'));
  });
});
