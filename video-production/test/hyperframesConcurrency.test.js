// hyperframesConcurrency.test.js — Stabilize HyperFrames worker
// concurrency (2026-08-25). root cause real medido: HyperFrames decide
// `workerCount` automáticamente a partir de los cores de la máquina
// (hasta 5-6 browsers Chrome completos en paralelo en este entorno de 16
// cores) -- esto expone al pipeline a condiciones reales de carrera de
// teardown de Mojo/Chromium (0x800700E8) bajo cierre concurrente. Este
// archivo prueba: (a) la resolución pura del límite configurable
// (HYPERFRAMES_MAX_WORKERS -> PRODUCER_MAX_WORKERS, variable NATIVA real
// de HyperFrames, nunca reimplementada), (b) el extractor de
// observabilidad filtrada, y (c) una integración real (Chrome real) que
// confirma que el workerCount real reportado por HyperFrames respeta el
// límite configurado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveHyperframesMaxWorkers, DEFAULT_HYPERFRAMES_MAX_WORKERS, extraerObservabilidadRenderReal,
  construirComposicionEscenaHtml, resolverHyperframesCli, correr, validarMp4ConFfprobe,
} from '../src/hyperframesRenderer.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';

function crearWavSilencioBuffer(duracionSegundos, sampleRate = 24000) {
  const numSamples = Math.round(duracionSegundos * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

describe('resolveHyperframesMaxWorkers — límite real configurable, default conservador', () => {
  test('default real = 2 (DEFAULT_HYPERFRAMES_MAX_WORKERS)', () => {
    assert.equal(DEFAULT_HYPERFRAMES_MAX_WORKERS, 2);
    assert.equal(resolveHyperframesMaxWorkers(undefined), 2);
  });

  test('respeta un valor real configurado explícitamente', () => {
    assert.equal(resolveHyperframesMaxWorkers('1'), 1);
    assert.equal(resolveHyperframesMaxWorkers('2'), 2);
    assert.equal(resolveHyperframesMaxWorkers('4'), 4);
    assert.equal(resolveHyperframesMaxWorkers('8'), 8); // nunca hay un techo oculto -- el operador decide.
  });

  test('valores inválidos reales caen al default seguro, nunca lanzan', () => {
    for (const invalido of ['0', '-1', 'abc', '', '1.5', null, undefined]) {
      assert.equal(resolveHyperframesMaxWorkers(invalido), DEFAULT_HYPERFRAMES_MAX_WORKERS, `valor inválido "${invalido}" debía caer al default real`);
    }
  });
});

describe('extraerObservabilidadRenderReal — observabilidad filtrada, nunca el log completo', () => {
  test('detecta el workerCount real reportado y cuenta browsers reales lanzados', () => {
    const stderr = '[INFO] [Render:trace] {"phase":"worker_resolution","status":"checkpoint","workerCount":3}\n[BrowserManager] Browser launched (a)\n[BrowserManager] Browser launched (b)';
    const obs = extraerObservabilidadRenderReal({ stdout: '', stderr, durationMs: 1234 });
    assert.equal(obs.workerCountUsed, 3);
    assert.equal(obs.browsersLaunched, 2);
    assert.equal(obs.durationMs, 1234);
  });

  test('filtra SOLO líneas reales de interés (0x800700E8/ERROR_/NetworkService/Target closed/pipe) -- nunca todo el log', () => {
    const stderr = [
      'línea normal sin interés real',
      'algo con NetworkService real',
      '[INFO] progreso normal 50%',
      'error real: 0x800700E8 pipe cerrado',
      'Protocol error: Target closed',
    ].join('\n');
    const obs = extraerObservabilidadRenderReal({ stdout: '', stderr });
    assert.equal(obs.warnings.length, 3);
    assert.ok(obs.warnings.some((w) => w.includes('NetworkService')));
    assert.ok(obs.warnings.some((w) => w.includes('0x800700E8')));
    assert.ok(obs.warnings.some((w) => w.includes('Target closed')));
    assert.ok(!obs.warnings.some((w) => w.includes('línea normal')));
    assert.ok(!obs.warnings.some((w) => w.includes('progreso normal')));
  });

  test('sin nada real que reportar, warnings vacío y workerCountUsed null', () => {
    const obs = extraerObservabilidadRenderReal({ stdout: 'todo bien', stderr: 'render completado sin problemas' });
    assert.equal(obs.workerCountUsed, null);
    assert.deepEqual([...obs.warnings], []);
  });
});

describe('Integración REAL (Chrome real) — el workerCount real reportado por HyperFrames respeta HYPERFRAMES_MAX_WORKERS', () => {
  // Límite real descubierto durante esta validación (documentado también en
  // resolveHyperframesMaxWorkers()): HyperFrames aplica su PROPIO piso duro
  // de 2 workers para cualquier composición con suficientes frames
  // (parallelCoordinator.ts#computeWorkerSizing -- minWorkersForJob=2). Pedir
  // 1 real se comporta igual que pedir 2 -- por eso el default real y
  // efectivo de esta fase es 2, no 1. La prueba real valida contra ese piso
  // real (<=2), no contra un valor que HyperFrames mismo no permite alcanzar.
  test('con HYPERFRAMES_MAX_WORKERS=1, el workerCount real queda acotado al piso real de HyperFrames (2), nunca al "auto" de 5-6', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hf-concurrency-test-'));
    const audioPath = join(tmp, 'voice.wav');
    writeFileSync(audioPath, crearWavSilencioBuffer(4));
    const projectDir = join(tmp, 'scene-1', 'proj');
    mkdirSync(join(projectDir, 'assets'), { recursive: true });
    copyFileSync(audioPath, join(projectDir, 'assets', 'voiceover.wav'));

    const html = construirComposicionEscenaHtml({
      sceneKind: 'CONCEPT', text: 'validación real de concurrencia', audioRelPath: 'assets/voiceover.wav',
      durationSeconds: 4, subtitulos: [{ texto: 'validación real', start: 0, duration: 4 }],
    });
    writeFileSync(join(projectDir, 'index.html'), html, 'utf8');
    writeFileSync(join(projectDir, 'hyperframes.json'), JSON.stringify({
      $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
      paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
      media: { autoProxy: true },
    }, null, 2));
    writeFileSync(join(projectDir, 'meta.json'), JSON.stringify({ id: 'scene-1', name: 'scene-1', createdAt: new Date().toISOString() }, null, 2));

    const outputPath = join(projectDir, '..', 'scene-1.mp4');
    const env = { ...process.env, PATH: `${FFMPEG_BIN_DIR};${process.env.PATH}`, PRODUCER_MAX_WORKERS: String(resolveHyperframesMaxWorkers('1')) };
    const hyperframesCli = resolverHyperframesCli();
    const r = correr(process.execPath, [hyperframesCli, 'render', '-f', '30', '-o', outputPath], { cwd: projectDir, env });

    assert.equal(r.status, 0, `el render real falló: ${r.stderr}`);
    assert.ok(existsSync(outputPath));
    const probe = validarMp4ConFfprobe(outputPath, { ffprobeBin: join(FFMPEG_BIN_DIR, 'ffprobe.exe') });
    assert.ok(probe.ok && probe.hasVideo && probe.hasAudio);

    const obs = extraerObservabilidadRenderReal({ stdout: r.stdout, stderr: r.stderr });
    assert.ok(obs.workerCountUsed !== null, `no se pudo leer workerCount real del trace. stderr: ${r.stderr}`);
    assert.ok(obs.workerCountUsed <= 2, `workerCount real (${obs.workerCountUsed}) debía quedar acotado al piso real de HyperFrames (<=2), nunca escalar al "auto" de 5-6 medido en la investigación real previa.`);

    rmSync(tmp, { recursive: true, force: true });
  });
});
