import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { windowRange, ATTRIBUTION_WINDOWS } from '../src/attributionWindow.js';

describe('windowRange', () => {
  test('1d/7d/28d producen rangos correctos', () => {
    const publishedAt = '2026-08-01T00:00:00Z';
    for (const [key, days] of Object.entries(ATTRIBUTION_WINDOWS)) {
      const { since, until } = windowRange(publishedAt, key);
      assert.equal(since.toISOString(), '2026-08-01T00:00:00.000Z');
      assert.equal((until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000), days);
    }
  });

  test('ventana inválida -- lanza explícito', () => {
    assert.throws(() => windowRange('2026-08-01T00:00:00Z', '90d'), /ventana inválida/);
  });

  test('publishedAt ausente o inválido -- lanza explícito, nunca asume una fecha', () => {
    assert.throws(() => windowRange(null, '7d'), /obligatorio/);
    assert.throws(() => windowRange('no-es-una-fecha', '7d'), /inválido/);
  });
});
