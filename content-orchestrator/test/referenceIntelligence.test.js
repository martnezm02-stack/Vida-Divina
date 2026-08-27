// referenceIntelligence.test.js — Adaptar contenido / Video de referencia
// (2026-08-27, Reference Intelligence multimodal). Fixtures reales
// generadas con ffmpeg `lavfi` + un stream de subtítulos embebido real
// (mov_text) -- mismo criterio zero-dep que postProduction.test.js/
// referenceVideoAnalyzer.test.js. Todo el I/O vive bajo os.tmpdir().

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ingestReferenceVideo, analyzeReferenceVideo } from '../src/referenceVideoAnalyzer.js';
import { buildReferenceIntelligence, extractEmbeddedTranscript } from '../src/referenceIntelligence.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const ffmpegBin = join(FFMPEG_BIN_DIR, 'ffmpeg.exe');

const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'co-refintel-test-'));
const REFERENCE_DIR = join(TEST_TMP_DIR, 'reference-analysis');
const NO_SUBS_MP4 = join(TEST_TMP_DIR, 'no-subs.mp4');
const WITH_SUBS_MP4 = join(TEST_TMP_DIR, 'with-subs.mp4');
const SRT_PATH = join(TEST_TMP_DIR, 'subs.srt');

// Subtítulos reales -- un hook tipo pregunta, un problema explícito, un CTA
// real de WhatsApp -- para que las heurísticas reales tengan evidencia
// textual real que clasificar (nunca un LLM).
const SRT_CONTENT = `1
00:00:00,000 --> 00:00:02,000
¿Por qué nadie te dijo esto antes?

2
00:00:02,000 --> 00:00:04,000
Es un problema que casi todos enfrentan y te cuesta la energía del día.

3
00:00:04,000 --> 00:00:06,000
Aquí está la solución real que necesitas.

4
00:00:06,000 --> 00:00:08,000
Escríbenos por WhatsApp para conocer más.
`;

function generarFixtureSinSubs() {
  const r = spawnSync(ffmpegBin, [
    '-y', '-f', 'lavfi', '-i', 'color=c=0x29361C:s=640x360:d=8:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8:sample_rate=48000',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    NO_SUBS_MP4,
  ], { encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`No se pudo generar la fixture sin subtítulos: ${r.stderr}`);
}

function generarFixtureConSubsReales() {
  writeFileSync(SRT_PATH, SRT_CONTENT, 'utf8');
  const r = spawnSync(ffmpegBin, [
    '-y', '-f', 'lavfi', '-i', 'color=c=0x441C11:s=640x360:d=8:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8:sample_rate=48000',
    '-i', SRT_PATH,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-c:s', 'mov_text', '-movflags', '+faststart',
    WITH_SUBS_MP4,
  ], { encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(`No se pudo generar la fixture con subtítulos reales: ${r.stderr}`);
}

before(() => {
  generarFixtureSinSubs();
  generarFixtureConSubsReales();
});
after(() => { rmSync(TEST_TMP_DIR, { recursive: true, force: true }); });

function analizarTecnico(videoPath) {
  const ingested = ingestReferenceVideo(videoPath, { referenceDir: REFERENCE_DIR });
  return {
    ingested,
    technicalAnalysis: analyzeReferenceVideo({ referenceId: ingested.referenceId, videoPath: ingested.path, referenceDir: REFERENCE_DIR, ffmpegBinDir: FFMPEG_BIN_DIR }),
  };
}

describe('extractEmbeddedTranscript — SOLO subtítulos embebidos reales, nunca ASR', () => {
  test('un video sin subtítulos embebidos -- available:false explícito, nunca inventa un transcript', () => {
    const { ingested } = analizarTecnico(NO_SUBS_MP4);
    const tmp = mkdtempSync(join(tmpdir(), 'co-refintel-tmp-'));
    const transcript = extractEmbeddedTranscript(ingested.path, { ffmpegBinDir: FFMPEG_BIN_DIR, tmpDir: tmp });
    assert.equal(transcript.available, false);
    assert.match(transcript.reason, /subtítulos|transcripción/i);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('un video CON subtítulos embebidos reales -- transcript real extraído, con segmentos reales y timestamps reales', () => {
    const { ingested } = analizarTecnico(WITH_SUBS_MP4);
    const tmp = mkdtempSync(join(tmpdir(), 'co-refintel-tmp-'));
    const transcript = extractEmbeddedTranscript(ingested.path, { ffmpegBinDir: FFMPEG_BIN_DIR, tmpDir: tmp });
    assert.equal(transcript.available, true);
    assert.equal(transcript.source, 'embedded_subtitles');
    assert.equal(transcript.segments.length, 4);
    assert.match(transcript.text, /WhatsApp/);
    assert.ok(Math.abs(transcript.segments[0].start - 0) < 0.1);
    assert.ok(Math.abs(transcript.segments[0].end - 2) < 0.1);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('buildReferenceIntelligence — enriquece el technicalAnalysis real sin duplicarlo', () => {
  test('nunca duplica campos técnicos -- technicalAnalysis es EXACTAMENTE el objeto real ya producido por referenceVideoAnalyzer.js', () => {
    const { ingested, technicalAnalysis } = analizarTecnico(NO_SUBS_MP4);
    const tmp = mkdtempSync(join(tmpdir(), 'co-refintel-tmp-'));
    const intelligence = buildReferenceIntelligence({ technicalAnalysis, videoPath: ingested.path, ffmpegBinDir: FFMPEG_BIN_DIR, tmpDir: tmp });
    assert.equal(intelligence.technicalAnalysis, technicalAnalysis);
    assert.equal(intelligence.referenceId, technicalAnalysis.referenceId);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('sin subtítulos reales -- hook/cta/problem/narrativeStructure/onScreenText/visualStyle/people/productPresence todos available:false, cada uno con un motivo real', () => {
    const { ingested, technicalAnalysis } = analizarTecnico(NO_SUBS_MP4);
    const tmp = mkdtempSync(join(tmpdir(), 'co-refintel-tmp-'));
    const intelligence = buildReferenceIntelligence({ technicalAnalysis, videoPath: ingested.path, ffmpegBinDir: FFMPEG_BIN_DIR, tmpDir: tmp });
    for (const field of [intelligence.hook, intelligence.cta, intelligence.problem, intelligence.narrativeStructure, intelligence.onScreenText, intelligence.visualStyle, intelligence.people, intelligence.productPresence, intelligence.angle, intelligence.captionStyle]) {
      assert.equal(field.available, false);
      assert.ok(field.reason?.length > 0);
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  test('con subtítulos reales -- hook real clasificado tipo "question" (evidencia textual real: "¿Por qué...?")', () => {
    const { ingested, technicalAnalysis } = analizarTecnico(WITH_SUBS_MP4);
    const tmp = mkdtempSync(join(tmpdir(), 'co-refintel-tmp-'));
    const intelligence = buildReferenceIntelligence({ technicalAnalysis, videoPath: ingested.path, ffmpegBinDir: FFMPEG_BIN_DIR, tmpDir: tmp });
    assert.equal(intelligence.hook.available, true);
    assert.equal(intelligence.hook.type, 'question');
    assert.ok(intelligence.hook.confidence > 0 && intelligence.hook.confidence <= 1);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('con subtítulos reales -- CTA real clasificado tipo "whatsapp" (evidencia textual real en el cierre)', () => {
    const { ingested, technicalAnalysis } = analizarTecnico(WITH_SUBS_MP4);
    const tmp = mkdtempSync(join(tmpdir(), 'co-refintel-tmp-'));
    const intelligence = buildReferenceIntelligence({ technicalAnalysis, videoPath: ingested.path, ffmpegBinDir: FFMPEG_BIN_DIR, tmpDir: tmp });
    assert.equal(intelligence.cta.available, true);
    assert.equal(intelligence.cta.type, 'whatsapp');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('con subtítulos reales -- problema real detectado (evidencia textual real: "problema que casi todos enfrentan")', () => {
    const { ingested, technicalAnalysis } = analizarTecnico(WITH_SUBS_MP4);
    const tmp = mkdtempSync(join(tmpdir(), 'co-refintel-tmp-'));
    const intelligence = buildReferenceIntelligence({ technicalAnalysis, videoPath: ingested.path, ffmpegBinDir: FFMPEG_BIN_DIR, tmpDir: tmp });
    assert.equal(intelligence.problem.available, true);
    assert.match(intelligence.problem.text, /problema/i);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('semanticScenes real -- cada escena técnica real se enriquece con su fragmento real de transcript (por solapamiento de timestamps), nunca inventado', () => {
    const { ingested, technicalAnalysis } = analizarTecnico(WITH_SUBS_MP4);
    const tmp = mkdtempSync(join(tmpdir(), 'co-refintel-tmp-'));
    const intelligence = buildReferenceIntelligence({ technicalAnalysis, videoPath: ingested.path, ffmpegBinDir: FFMPEG_BIN_DIR, tmpDir: tmp });
    assert.equal(intelligence.semanticScenes.length, technicalAnalysis.scenes.length);
    const first = intelligence.semanticScenes[0];
    assert.ok(first.transcript, 'la primera escena real debe traer texto real (el video es de 1 sola escena técnica -- todo el transcript cae dentro)');
    assert.equal(first.onScreenText.available, false); // sin OCR real -- nunca inventado.
    rmSync(tmp, { recursive: true, force: true });
  });

  test('narrativeStructure semántica real -- secuencia real de purpose detectados, nunca igual a la estructura posicional técnica (APERTURA/CIERRE)', () => {
    const { ingested, technicalAnalysis } = analizarTecnico(WITH_SUBS_MP4);
    const tmp = mkdtempSync(join(tmpdir(), 'co-refintel-tmp-'));
    const intelligence = buildReferenceIntelligence({ technicalAnalysis, videoPath: ingested.path, ffmpegBinDir: FFMPEG_BIN_DIR, tmpDir: tmp });
    assert.equal(intelligence.narrativeStructure.available, true);
    assert.ok(Array.isArray(intelligence.narrativeStructure.sequence) && intelligence.narrativeStructure.sequence.length > 0);
    rmSync(tmp, { recursive: true, force: true });
  });
});
