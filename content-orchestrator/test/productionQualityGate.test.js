// productionQualityGate.test.js — Creative Production Orchestrator (2026-08-24).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runProductionQualityGate } from '../src/productionQualityGate.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const TEST_TMP_DIR = mkdtempSync(join(tmpdir(), 'co-qagate-test-'));
const REAL_MP4 = join(TEST_TMP_DIR, '_fixture.mp4');
const REAL_MP4_NO_AUDIO = join(TEST_TMP_DIR, '_fixture-no-audio.mp4');

before(() => {
  const ffmpegBin = join(FFMPEG_BIN_DIR, 'ffmpeg.exe');
  spawnSync(ffmpegBin, [
    '-y', '-f', 'lavfi', '-i', 'color=c=0x441C11:s=1080x1920:d=6:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6:sample_rate=48000',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', REAL_MP4,
  ], { encoding: 'utf8', shell: false });
  spawnSync(ffmpegBin, [
    '-y', '-f', 'lavfi', '-i', 'color=c=0x441C11:s=1080x1920:d=6:r=30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', REAL_MP4_NO_AUDIO,
  ], { encoding: 'utf8', shell: false });
});
after(() => rmSync(TEST_TMP_DIR, { recursive: true, force: true }));

const SCENE_PLAN_DIVERSO = Object.freeze({ allScenesShowProduct: false });
const SCENE_PLAN_MONOTONO = Object.freeze({ allScenesShowProduct: true });

describe('runProductionQualityGate', () => {
  test('video real completo (audio+captions+música+diversidad) -> FULL_PRODUCTION', () => {
    const r = runProductionQualityGate({
      outputPath: REAL_MP4, expectedVoiceoverDurationSeconds: 6, expectedCtaText: 'Escríbenos por WhatsApp.',
      scenePlan: SCENE_PLAN_DIVERSO, captionsApplied: true, musicIncluded: true,
      campaignId: 'sculpt-black-abc', creativeId: 'creative-1', ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'FULL_PRODUCTION');
    assert.deepEqual([...r.issues], []);
  });

  test('sin captions o sin diversidad de escena real -> DEGRADED_PRODUCTION, nunca FULL', () => {
    const r = runProductionQualityGate({
      outputPath: REAL_MP4, expectedVoiceoverDurationSeconds: 6, expectedCtaText: 'Escríbenos por WhatsApp.',
      scenePlan: SCENE_PLAN_MONOTONO, captionsApplied: true, musicIncluded: false,
      campaignId: 'sculpt-black-abc', creativeId: 'creative-1', ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'DEGRADED_PRODUCTION');
    assert.ok(r.warnings.some((w) => w.includes('diversidad visual')));
  });

  test('sin audio real -> FAILED, nunca se declara éxito', () => {
    const r = runProductionQualityGate({
      outputPath: REAL_MP4_NO_AUDIO, expectedVoiceoverDurationSeconds: 6, expectedCtaText: 'Escríbenos por WhatsApp.',
      scenePlan: SCENE_PLAN_DIVERSO, captionsApplied: true, musicIncluded: true,
      campaignId: 'sculpt-black-abc', creativeId: 'creative-1', ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'FAILED');
    assert.ok(r.issues.some((i) => i.includes('audio')));
  });

  test('un archivo real inexistente -> FAILED explícito, nunca inventa un resultado', () => {
    const r = runProductionQualityGate({
      outputPath: join(TEST_TMP_DIR, '_no-existe.mp4'), expectedVoiceoverDurationSeconds: 6, expectedCtaText: 'x',
      scenePlan: SCENE_PLAN_DIVERSO, captionsApplied: true, musicIncluded: true,
      campaignId: null, creativeId: 'creative-1', ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(r.status, 'FAILED');
  });
});
