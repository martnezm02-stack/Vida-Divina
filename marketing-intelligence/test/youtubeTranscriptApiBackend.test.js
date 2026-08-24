// youtubeTranscriptApiBackend.test.js — Fase 10E. Todo el subproceso se
// mockea vía spawnImpl inyectado (EventEmitter) — nunca se invoca Python real
// en esta suite, y por lo tanto nunca se requiere que youtube-transcript-api
// esté instalada para que estos tests pasen. La prueba real end-to-end (con
// Python real detectando la dependencia ausente) vive en un archivo aparte.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { YouTubeTranscriptApiBackend } from '../src/acquisition/youtube/youtubeTranscriptApiBackend.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Simula un ChildProcess: stdout/stderr son EventEmitter, y el propio objeto emite 'close'. */
function fakeSpawn({ stdoutLines = [], stderr = '', exitCode = 0, spawnError = null }) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      if (spawnError) {
        child.emit('error', spawnError);
        return;
      }
      for (const line of stdoutLines) child.stdout.emit('data', Buffer.from(line + '\n'));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr));
      child.emit('close', exitCode);
    });
    return child;
  };
  spawnImpl.calls = calls;
  return spawnImpl;
}

function successJson(overrides = {}) {
  return JSON.stringify({
    ok: true,
    video_id: 'abc12345678',
    transcript: 'contenido de prueba de la transcripción',
    transcriptType: 'manual',
    transcriptLanguage: 'en',
    segment_count: 10,
    approximate_char_count: 40,
    duration_approx: 120.5,
    backend: 'youtube_transcript_api_subprocess',
    ...overrides,
  });
}

function errorJson(category, overrides = {}) {
  return JSON.stringify({ ok: false, video_id: 'abc12345678', error: category, message: `mensaje de ${category}`, ...overrides });
}

describe('YouTubeTranscriptApiBackend — JSON válido y campos de éxito', () => {
  test('parsea un JSON exitoso y mapea transcriptType/transcriptLanguage correctamente', async () => {
    const spawnImpl = fakeSpawn({ stdoutLines: [successJson()] });
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');

    assert.equal(result.ok, true);
    assert.equal(result.transcriptAvailable, true);
    assert.equal(result.transcriptType, 'manual');
    assert.equal(result.transcriptLanguage, 'en');
    assert.equal(result.transcript, 'contenido de prueba de la transcripción');
    assert.equal(result.metadata, null); // este backend nunca produce título/canal/views
    assert.equal(result.metrics, null);
  });

  test('backend.name identifica el motor real, distinto del backend directo', () => {
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl: fakeSpawn({ stdoutLines: [successJson()] }) });
    assert.equal(backend.name, 'youtube_transcript_api_subprocess');
  });
});

describe('YouTubeTranscriptApiBackend — categorías de error de la librería, todas como estados controlados', () => {
  test('PoTokenRequired se mapea a blocked=true, nunca a un intento de resolverlo', async () => {
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl: fakeSpawn({ stdoutLines: [errorJson('PoTokenRequired')] }) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.blockReason, 'PoTokenRequired');
  });

  test('RequestBlocked se mapea a blocked=true', async () => {
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl: fakeSpawn({ stdoutLines: [errorJson('RequestBlocked')] }) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.blocked, true);
    assert.equal(result.blockReason, 'RequestBlocked');
  });

  test('IpBlocked se mapea a blocked=true', async () => {
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl: fakeSpawn({ stdoutLines: [errorJson('IpBlocked')] }) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.blocked, true);
    assert.equal(result.blockReason, 'IpBlocked');
  });

  test('TranscriptsDisabled se mapea a ok=true con transcriptAvailable=false (video accesible, sin transcript)', async () => {
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl: fakeSpawn({ stdoutLines: [errorJson('TranscriptsDisabled')] }) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, true);
    assert.equal(result.transcriptAvailable, false);
    assert.equal(result.transcriptReason, 'TranscriptsDisabled');
  });

  test('NoTranscriptFound se mapea a ok=true con transcriptAvailable=false', async () => {
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl: fakeSpawn({ stdoutLines: [errorJson('NoTranscriptFound')] }) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, true);
    assert.equal(result.transcriptAvailable, false);
    assert.equal(result.transcriptReason, 'NoTranscriptFound');
  });

  test('VideoUnavailable se mapea a ok=false, error explícito (fallo de video, no de captions)', async () => {
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl: fakeSpawn({ stdoutLines: [errorJson('VideoUnavailable')] }) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, false);
    assert.equal(result.blocked, false);
    assert.equal(result.error, 'VideoUnavailable');
  });

  test('dependency_missing se mapea a un estado propio, nunca intenta instalar nada ni cae a otro mecanismo', async () => {
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl: fakeSpawn({ stdoutLines: [errorJson('dependency_missing')], exitCode: 2 }) });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'dependency_missing');
  });
});

describe('YouTubeTranscriptApiBackend — seguridad', () => {
  test('ausencia de shell injection: los argumentos del subproceso siempre se pasan como lista, nunca como cadena de shell', async () => {
    const spawnImpl = fakeSpawn({ stdoutLines: [successJson()] });
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl, pythonPath: 'python3', scriptPath: '/ruta/script.py' });
    await backend.fetch('https://www.youtube.com/watch?v=abc12345678');

    assert.equal(spawnImpl.calls.length, 1);
    const call = spawnImpl.calls[0];
    assert.ok(Array.isArray(call.args), 'los argumentos deben ser un array, nunca una cadena única de shell');
    assert.equal(call.options.shell, undefined, 'nunca debe pasarse shell:true');
    assert.deepEqual(call.args, ['/ruta/script.py', 'abc12345678', '--lang', 'en']);
  });

  test('una URL que no produce un video_id válido de 11 caracteres NUNCA llega a spawnear el subproceso', async () => {
    const spawnImpl = fakeSpawn({ stdoutLines: [successJson()] });
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl });

    const result = await backend.fetch('https://ejemplo-ficticio.test/no-es-youtube');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid_youtube_url');
    assert.equal(spawnImpl.calls.length, 0, 'no debe invocarse ningún subproceso sin un video_id válido');
  });

  test('un intento de inyectar caracteres de shell en el video_id vía la URL se rechaza antes de spawnear', async () => {
    const spawnImpl = fakeSpawn({ stdoutLines: [successJson()] });
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl });
    // v= con contenido que parece un intento de inyección — extractVideoId lo tomaría literal, pero el regex de 11 caracteres lo rechaza.
    const result = await backend.fetch('https://www.youtube.com/watch?v=;rm -rf ~');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid_youtube_url');
    assert.equal(spawnImpl.calls.length, 0);
  });

  test('ausencia de secretos: ningún argumento del subproceso ni campo del resultado contiene claves/tokens/cookies', async () => {
    const spawnImpl = fakeSpawn({ stdoutLines: [successJson()] });
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');

    const serializedCall = JSON.stringify(spawnImpl.calls[0].args);
    const serializedResult = JSON.stringify(result);
    for (const forbidden of ['api_key', 'apikey', 'cookie', 'session', 'token', 'password']) {
      assert.doesNotMatch(serializedCall.toLowerCase(), new RegExp(forbidden));
      assert.doesNotMatch(serializedResult.toLowerCase(), new RegExp(forbidden));
    }
  });

  test('ausencia de escritura accidental de transcripts a archivos: el módulo del backend nunca importa funciones de escritura de fs', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'acquisition', 'youtube', 'youtubeTranscriptApiBackend.js'), 'utf8');
    assert.doesNotMatch(source, /writeFileSync|appendFileSync|createWriteStream/);
  });

  test('un stdout sin JSON válido nunca se trata como éxito silencioso', async () => {
    const spawnImpl = fakeSpawn({ stdoutLines: ['esto no es json'], exitCode: 1 });
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'subprocess_output_unparseable');
  });

  test('si el intérprete Python no existe (ENOENT), se reporta como estado controlado, nunca lanza sin capturar', async () => {
    const enoent = Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' });
    const spawnImpl = fakeSpawn({ spawnError: enoent });
    const backend = new YouTubeTranscriptApiBackend({ spawnImpl });
    const result = await backend.fetch('https://www.youtube.com/watch?v=abc12345678');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'python_interpreter_not_found');
  });
});
