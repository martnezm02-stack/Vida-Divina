import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PublishingScheduler } from '../src/publishingScheduler.js';
import { createScheduledPublication, MAX_RETRY_COUNT } from '../src/scheduledPublication.js';
import * as store from '../src/scheduledPublicationStore.js';
import { MediaHostingService } from '../../media-hosting/src/mediaHostingService.js';
import { MockMediaHostingProvider } from '../../media-hosting/src/mockMediaHostingProvider.js';
import { publish as realPublish } from '../../content-orchestrator/src/publishing/publishingService.js';

function tempAsset(name = 'final.mp4') {
  const dir = mkdtempSync(join(tmpdir(), 'sched-test-'));
  const p = join(dir, name);
  writeFileSync(p, 'contenido real de prueba');
  return p;
}

function completedPackage({ path = tempAsset(), type = 'SINGLE' } = {}) {
  if (type === 'CAROUSEL') {
    return {
      requestId: `req-${Math.random().toString(36).slice(2)}`, status: 'COMPLETED', assetPackageType: 'CAROUSEL',
      outputAssets: [{ assetId: 'slide-1', path }],
      assetPackage: { type: 'CAROUSEL', assets: [{ assetId: 'slide-1', path }, { assetId: 'slide-2', path: tempAsset('slide2.png') }] },
    };
  }
  return { requestId: `req-${Math.random().toString(36).slice(2)}`, status: 'COMPLETED', assetPackageType: 'SINGLE', outputAssets: [{ assetId: `asset-${Math.random().toString(36).slice(2)}`, path }] };
}

function mockMediaHosting() {
  const dir = mkdtempSync(join(tmpdir(), 'mock-r2-'));
  return new MediaHostingService({ provider: 'mock', mockProvider: new MockMediaHostingProvider(dir) });
}

// Cada test limpia sus propios registros al terminar (nunca se difiere a un
// único after() global) -- findDuePublications()/runDuePublications()
// escanean TODO el store real, así que un registro SCHEDULED-y-vencido que
// sobreviva de un test anterior contaminaría el siguiente.
function persistAndTrack(rec, cleanup) {
  store.save(rec);
  cleanup.push(rec.id);
  return rec;
}

describe('PublishingScheduler — ciclo de vida', () => {
  test('approve: DRAFT -> APPROVED, exige approvedBy y Final Asset Package COMPLETED', () => {
    const cleanup = [];
    try {
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: async () => ({}) });
      const rec = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola' }), cleanup);
      const approved = sched.approve(rec.id, { approvedBy: 'martnezm02' });
      assert.equal(approved.status, 'APPROVED');
      assert.ok(approved.approvedAt);
      assert.throws(() => sched.approve(rec.id, { approvedBy: 'otra-vez' }), /DRAFT/);

      const rec2 = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola2' }), cleanup);
      assert.throws(() => sched.approve(rec2.id, {}), /approvedBy/);
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('schedule: APPROVED -> SCHEDULED, guarda scheduledAt UTC real + timezone explícito', () => {
    const cleanup = [];
    try {
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: async () => ({}) });
      const rec = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola' }), cleanup);
      sched.approve(rec.id, { approvedBy: 'martnezm02' });
      const scheduled = sched.schedule(rec.id, { date: '2026-08-25', time: '08:30', timezone: 'America/Mexico_City' });
      assert.equal(scheduled.status, 'SCHEDULED');
      assert.equal(scheduled.scheduledAt, '2026-08-25T14:30:00.000Z');
      assert.equal(scheduled.timezone, 'America/Mexico_City');
      assert.throws(() => sched.schedule('no-existe', { date: '2026-08-25', time: '08:30', timezone: 'UTC' }), /no existe/);
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('cancel: cancela desde cualquier estado no terminal, rechaza desde PUBLISHED/CANCELLED', () => {
    const cleanup = [];
    try {
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: async () => ({}) });
      const rec = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'FACEBOOK', caption: 'Hola' }), cleanup);
      const cancelled = sched.cancel(rec.id);
      assert.equal(cancelled.status, 'CANCELLED');
      assert.throws(() => sched.cancel(rec.id), /CANCELLED/);
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('retrieve: get/list reales reflejan las transiciones', () => {
    const cleanup = [];
    try {
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: async () => ({}) });
      const rec = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Hola' }), cleanup);
      sched.approve(rec.id, { approvedBy: 'martnezm02' });
      assert.equal(store.get(rec.id).status, 'APPROVED');
      assert.ok(store.list().some((r) => r.id === rec.id));
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('findDuePublications: solo trae SCHEDULED con scheduledAt vencido', () => {
    const cleanup = [];
    try {
      const fixedNow = new Date('2026-08-25T15:00:00.000Z');
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: async () => ({}), now: () => fixedNow });
      const due = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Vencida' }), cleanup);
      const future = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Futura' }), cleanup);
      sched.approve(due.id, { approvedBy: 'a' });
      sched.schedule(due.id, { date: '2026-08-25', time: '08:30', timezone: 'America/Mexico_City' }); // 14:30Z, ya vencida
      sched.approve(future.id, { approvedBy: 'a' });
      sched.schedule(future.id, { date: '2026-08-25', time: '23:00', timezone: 'America/Mexico_City' }); // 05:00Z del 26, futura

      const dueList = sched.findDuePublications();
      assert.ok(dueList.some((r) => r.id === due.id));
      assert.ok(!dueList.some((r) => r.id === future.id));
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('due publication real: FINAL -> scheduler -> media host (mock) -> publish (fake PUBLISHED) -> resultado + idempotencia', async () => {
    const cleanup = [];
    try {
      const fixedNow = new Date('2026-08-25T15:00:00.000Z');
      const calls = [];
      const fakePublish = async (pkg, platform, destination, metadata) => {
        calls.push({ pkg, platform, destination, metadata });
        assert.ok(metadata.mediaUrl.startsWith('https://mock-media-host.invalid/'));
        return { status: 'PUBLISHED', externalId: 'ig_real_123' };
      };
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: fakePublish, now: () => fixedNow });
      const rec = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Publícame' }), cleanup);
      sched.approve(rec.id, { approvedBy: 'martnezm02' });
      sched.schedule(rec.id, { date: '2026-08-25', time: '08:30', timezone: 'America/Mexico_City' });

      const results = await sched.runDuePublications();
      assert.equal(results.length, 1);
      assert.equal(results[0].status, 'PUBLISHED');
      assert.equal(results[0].externalPublicationId, 'ig_real_123');
      assert.equal(calls.length, 1);

      // Idempotencia: un segundo runDuePublications ya no la recoge (status PUBLISHED, no SCHEDULED).
      const again = await sched.runDuePublications();
      assert.equal(again.length, 0);
      assert.equal(calls.length, 1, 'nunca debe volver a llamar a publish() sobre una publicación ya PUBLISHED');
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('carousel: sube todos los slides y llama publish con mediaUrls[] alineadas', async () => {
    const cleanup = [];
    try {
      const fixedNow = new Date('2026-08-25T15:00:00.000Z');
      let received;
      const fakePublish = async (pkg, platform, destination, metadata) => { received = metadata; return { status: 'PUBLISHED', externalId: 'ig_carousel_1' }; };
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: fakePublish, now: () => fixedNow });
      const rec = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage({ type: 'CAROUSEL' }), platform: 'INSTAGRAM', caption: 'Carrusel' }), cleanup);
      sched.approve(rec.id, { approvedBy: 'a' });
      sched.schedule(rec.id, { date: '2026-08-25', time: '08:30', timezone: 'America/Mexico_City' });
      await sched.runDuePublications();
      assert.equal(received.mediaUrls.length, 2);
      assert.ok(received.mediaUrls.every((u) => u.startsWith('https://mock-media-host.invalid/')));
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('failure real: publish devuelve FAILED -> retryCount sube, vuelve a SCHEDULED hasta el límite, luego FAILED terminal', async () => {
    const cleanup = [];
    try {
      const fixedNow = new Date('2026-08-25T15:00:00.000Z');
      const fakePublish = async () => ({ status: 'FAILED', error: 'fallo de red simulado' });
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: fakePublish, now: () => fixedNow });
      const rec = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Falla' }), cleanup);
      sched.approve(rec.id, { approvedBy: 'a' });
      sched.schedule(rec.id, { date: '2026-08-25', time: '08:30', timezone: 'America/Mexico_City' });

      let last;
      for (let i = 0; i < MAX_RETRY_COUNT + 1; i++) {
        const [r] = await sched.runDuePublications();
        last = r;
      }
      assert.equal(last.status, 'FAILED');
      assert.equal(last.retryCount, MAX_RETRY_COUNT + 1);
      assert.equal((await sched.runDuePublications()).length, 0, 'un registro FAILED terminal nunca vuelve a recogerse');
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('configuration required: MediaHostingService sin credenciales -> CONFIGURATION_REQUIRED, nunca intenta publish()', async () => {
    const cleanup = [];
    try {
      const unconfigured = new MediaHostingService({ r2Overrides: { accountId: null, accessKeyId: null, secretAccessKey: null, bucket: null, publicBaseUrl: null } });
      let publishCalled = false;
      const fakePublish = async () => { publishCalled = true; return { status: 'PUBLISHED', externalId: 'x' }; };
      const fixedNow = new Date('2026-08-25T15:00:00.000Z');
      const sched = new PublishingScheduler({ mediaHostingService: unconfigured, publish: fakePublish, now: () => fixedNow });
      const rec = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Sin R2' }), cleanup);
      sched.approve(rec.id, { approvedBy: 'a' });
      sched.schedule(rec.id, { date: '2026-08-25', time: '08:30', timezone: 'America/Mexico_City' });

      const [result] = await sched.runDuePublications();
      assert.equal(result.status, 'CONFIGURATION_REQUIRED');
      assert.equal(publishCalled, false);
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('approval gate: nunca publica un registro SCHEDULED "a mano" sin approvedAt real (defensa en profundidad)', async () => {
    const cleanup = [];
    try {
      const fixedNow = new Date('2026-08-25T15:00:00.000Z');
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: async () => ({ status: 'PUBLISHED', externalId: 'x' }), now: () => fixedNow });
      const rec = createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Forzado' });
      // Se fuerza el registro directo a SCHEDULED sin pasar por approve() real -- simula un bug/corrupción de datos.
      persistAndTrack({ ...rec, status: 'SCHEDULED', scheduledAt: '2026-08-25T14:30:00.000Z', timezone: 'America/Mexico_City' }, cleanup);
      const [result] = await sched.runDuePublications();
      assert.equal(result.status, 'FAILED');
      assert.match(result.error, /approvedAt/);
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });

  test('integración real: FINAL -> scheduler -> media host (mock) -> publishingService real de content-orchestrator -> CONFIGURATION_REQUIRED (sin credenciales Meta en este entorno)', async () => {
    const cleanup = [];
    try {
      const fixedNow = new Date('2026-08-25T15:00:00.000Z');
      const sched = new PublishingScheduler({ mediaHostingService: mockMediaHosting(), publish: realPublish, now: () => fixedNow });
      const rec = persistAndTrack(createScheduledPublication({ assetPackage: completedPackage(), platform: 'INSTAGRAM', caption: 'Integración real' }), cleanup);
      sched.approve(rec.id, { approvedBy: 'martnezm02' });
      sched.schedule(rec.id, { date: '2026-08-25', time: '08:30', timezone: 'America/Mexico_City' });

      const [result] = await sched.runDuePublications();
      assert.equal(result.status, 'CONFIGURATION_REQUIRED');
      assert.match(result.error, /INSTAGRAM_ACCESS_TOKEN/);
    } finally {
      for (const id of cleanup) store.del(id);
    }
  });
});
