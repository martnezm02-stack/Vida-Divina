// youtubeTranscriptApiRealSubprocess.test.js — Fase 10E. A diferencia de
// youtubeTranscriptApiBackend.test.js (spawn mockeado), esta prueba invoca el
// intérprete Python REAL y el script REAL bundleado — sin red, sin necesitar
// que youtube-transcript-api esté instalada. En el entorno por defecto de
// este proyecto la librería NO está instalada (solo existe en el venv
// aislado de las Fases 10C/10D, fuera del repositorio) — por eso el
// resultado esperado y correcto aquí es "dependency_missing", detectado por
// el propio script sin intentar instalar nada.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { YouTubeTranscriptApiBackend } from '../src/acquisition/youtube/youtubeTranscriptApiBackend.js';

describe('YouTubeTranscriptApiBackend — subproceso REAL (Python real, librería ausente en el entorno del proyecto)', () => {
  test('detecta la dependencia ausente end-to-end, sin instalarla, usando el script bundleado real', async () => {
    const backend = new YouTubeTranscriptApiBackend({ pythonPath: 'python' }); // 'python3' no existe en este entorno Windows; 'python' sí
    const result = await backend.fetch('https://www.youtube.com/watch?v=zS3mRtxrMCE');

    assert.equal(result.ok, false);
    assert.equal(result.error, 'dependency_missing');
  });

  test('un video_id inválido nunca llega a invocar Python de verdad', async () => {
    const backend = new YouTubeTranscriptApiBackend({ pythonPath: 'python' });
    const result = await backend.fetch('https://ejemplo-ficticio.test/no-es-youtube');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid_youtube_url');
  });
});
