import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';
import { getCurrentAutoPublishConfig, setAutoPublishEnabled, listAutoPublishConfigHistory, DEFAULT_AUTO_PUBLISH_CONFIG, isRealActorId } from '../src/autoPublishConfig.js';

describe('isRealActorId — validación reutilizable por la capa de API (Fase 13)', () => {
  test('rechaza "system"/"auto"/"bot"/vacío/no-string, acepta un nombre real', () => {
    for (const bad of ['system', 'auto', 'bot', 'automated', 'automatic', '', '  ', null, undefined, 42]) {
      assert.equal(isRealActorId(bad), false);
    }
    assert.equal(isRealActorId('Manuel Martínez'), true);
  });
});

describe('AutoPublishConfig — Fase 13, Parte 6/7/8/9/22', () => {
  test('valor por defecto obligatorio: enabled=false, sin necesidad de ningún registro (Parte 6/9)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apc-default-'));
    const store = new PerformanceLearningStore(dir);
    assert.deepEqual(getCurrentAutoPublishConfig({ store }), DEFAULT_AUTO_PUBLISH_CONFIG);
    assert.equal(DEFAULT_AUTO_PUBLISH_CONFIG.enabled, false);
    rmSync(dir, { recursive: true, force: true });
  });

  test('rechaza activar sin un actor humano real -- mismo principio anti-bypass que humanReviewRecord.js', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apc-actor-'));
    const store = new PerformanceLearningStore(dir);
    for (const bad of ['system', 'auto', 'bot', 'automated', '']) {
      assert.throws(() => setAutoPublishEnabled({ enabled: true, actorId: bad, store }), /real/i);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test('activar (Parte 7/8): enabled=true real, getCurrentAutoPublishConfig refleja el cambio de inmediato', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apc-on-'));
    const store = new PerformanceLearningStore(dir);
    const config = setAutoPublishEnabled({ enabled: true, actorId: 'Manuel Martínez', reason: 'Suficiente evidencia real.', store });
    assert.equal(config.enabled, true);
    assert.equal(getCurrentAutoPublishConfig({ store }).enabled, true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('desactivar (Parte 9/24): enabled=false, histórico append-only nunca se borra ni se muta', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apc-off-'));
    const store = new PerformanceLearningStore(dir);
    setAutoPublishEnabled({ enabled: true, actorId: 'Manuel Martínez', store });
    setAutoPublishEnabled({ enabled: false, actorId: 'Manuel Martínez', reason: 'Pausa manual.', store });
    assert.equal(getCurrentAutoPublishConfig({ store }).enabled, false);
    const history = listAutoPublishConfigHistory({ store });
    assert.equal(history.length, 2); // ambos registros permanecen -- histórico completo, nunca sobrescrito
    assert.equal(history[0].enabled, false); // el más reciente primero
    assert.equal(history[1].enabled, true);
    rmSync(dir, { recursive: true, force: true });
  });

  test('audit trail (Parte 22): cada registro conserva quién y cuándo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apc-audit-'));
    const store = new PerformanceLearningStore(dir);
    const config = setAutoPublishEnabled({ enabled: true, actorId: 'Manuel Martínez', store });
    assert.ok(config.id);
    assert.ok(config.createdAt);
    assert.equal(config.actorId, 'Manuel Martínez');
    rmSync(dir, { recursive: true, force: true });
  });
});
