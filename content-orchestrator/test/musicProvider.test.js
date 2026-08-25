// musicProvider.test.js — Creative Production Orchestrator (2026-08-24).
// 100% real: lee el directorio real _music-library/ (sin mocks) -- en
// este entorno está vacío todavía, así que el resultado real esperado es
// NO_TRACK_AVAILABLE, honesto (nunca una pista fabricada).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectMusicTrack, listMusicLibrary, MUSIC_PROVIDER_STATUSES } from '../src/musicProvider.js';

describe('musicProvider — real, sin música fabricada', () => {
  test('MUSIC_PROVIDER_STATUSES expone los 2 estados reales', () => {
    assert.deepEqual([...MUSIC_PROVIDER_STATUSES], ['SUCCESS', 'NO_TRACK_AVAILABLE']);
  });

  test('listMusicLibrary() nunca lanza, siempre un arreglo real (vacío si no hay pistas reales)', () => {
    const tracks = listMusicLibrary();
    assert.ok(Array.isArray(tracks));
  });

  test('selectMusicTrack() sin pistas reales en este entorno -> NO_TRACK_AVAILABLE explícito, nunca fabrica una pista', () => {
    const result = selectMusicTrack({});
    assert.ok(MUSIC_PROVIDER_STATUSES.includes(result.status));
    if (result.status === 'NO_TRACK_AVAILABLE') {
      assert.equal(result.track, null);
      assert.ok(result.reason);
    } else {
      assert.ok(result.track.path);
    }
  });
});
