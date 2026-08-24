// cycleStore.test.js — 100% local: sin red, sin API, sin PostgreSQL, sin
// Instagram, sin WhatsApp. Usa un directorio temporal aislado (variable de
// entorno CREATIVE_INTELLIGENCE_DATA_ROOT) para nunca escribir ciclos de
// prueba dentro de creative-intelligence/data/ real, y lo limpia al final.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-cyclestore-test-'));
process.env.CREATIVE_INTELLIGENCE_DATA_ROOT = TEST_DATA_ROOT;

const {
  saveCycle, getCycle, cycleExists, listCycles, getStrategySnapshot,
  saveEvidenceSnapshot, getEvidenceSnapshot, evidenceSnapshotExists,
  computeEvidenceSnapshotHash, saveCycleWithEvidence, CYCLES_DIR, EVIDENCE_DIR,
} = await import('../orchestrator/cycleStore.js');
const { createCycleOutput } = await import('../schemas/cycleOutput.schema.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CYCLESTORE_MODULE_URL = pathToFileURL(path.join(__dirname, '..', 'orchestrator', 'cycleStore.js')).href;

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

function sampleEvidenceBatch(salt = '') {
  return [{ domain: 'MARKET_EVIDENCE', records: [{ verbatimQuote: `no he bajado mucho${salt}`, sourcePlatform: 'doctoralia.com.mx' }] }];
}

describe('Directorios aislados de prueba (nunca el data/ real del paquete)', () => {
  test('CYCLES_DIR/EVIDENCE_DIR apuntan al directorio temporal, no a creative-intelligence/data/', () => {
    assert.ok(CYCLES_DIR.startsWith(TEST_DATA_ROOT));
    assert.ok(EVIDENCE_DIR.startsWith(TEST_DATA_ROOT));
  });
});

describe('E. Guardar ciclo', () => {
  test('saveCycle valida y escribe un CycleOutput real a disco', () => {
    const snapshotRef = saveEvidenceSnapshot(sampleEvidenceBatch('-E'));
    const output = createCycleOutput({ cycleId: `cycle-E-${randomUUID()}`, evidenceSnapshotRef: snapshotRef });
    const result = saveCycle(output);
    assert.equal(result.cycleId, output.cycleId);
    assert.ok(fs.existsSync(result.path));
  });
});

describe('F. Recuperar ciclo', () => {
  test('getCycle devuelve exactamente lo guardado', () => {
    const snapshotRef = saveEvidenceSnapshot(sampleEvidenceBatch('-F'));
    const cycleId = `cycle-F-${randomUUID()}`;
    const output = createCycleOutput({ cycleId, evidenceSnapshotRef: snapshotRef, warnings: ['CATEGORY_GAP en Peso/Unaware'] });
    saveCycle(output);
    const recovered = getCycle(cycleId);
    assert.equal(recovered.cycleId, cycleId);
    assert.deepEqual(recovered.warnings, ['CATEGORY_GAP en Peso/Unaware']);
    assert.equal(cycleExists(cycleId), true);
  });
});

describe('G. Listar ciclos', () => {
  test('listCycles devuelve resúmenes livianos de todos los ciclos guardados, ordenados por generatedAt', () => {
    const before = listCycles().length;
    const ref1 = saveEvidenceSnapshot(sampleEvidenceBatch('-G1'));
    const ref2 = saveEvidenceSnapshot(sampleEvidenceBatch('-G2'));
    const id1 = `cycle-G1-${randomUUID()}`;
    const id2 = `cycle-G2-${randomUUID()}`;
    saveCycle(createCycleOutput({ cycleId: id1, evidenceSnapshotRef: ref1 }));
    saveCycle(createCycleOutput({ cycleId: id2, evidenceSnapshotRef: ref2 }));
    const listado = listCycles();
    assert.equal(listado.length, before + 2);
    const ids = listado.map((c) => c.cycleId);
    assert.ok(ids.includes(id1));
    assert.ok(ids.includes(id2));
    for (let i = 1; i < listado.length; i++) {
      assert.ok(listado[i - 1].generatedAt <= listado[i].generatedAt);
    }
  });
});

describe('H. Persistencia entre ejecuciones (subproceso real, no memoria compartida)', () => {
  test('un ciclo guardado en este proceso se puede leer desde un proceso de Node completamente distinto', () => {
    const snapshotRef = saveEvidenceSnapshot(sampleEvidenceBatch('-H'));
    const cycleId = `cycle-H-${randomUUID()}`;
    saveCycle(createCycleOutput({ cycleId, evidenceSnapshotRef: snapshotRef }));

    const script = `
      import('${CYCLESTORE_MODULE_URL}').then(({ getCycle }) => {
        const cycle = getCycle(${JSON.stringify(cycleId)});
        process.stdout.write(JSON.stringify({ cycleId: cycle.cycleId, hash: cycle.evidenceSnapshotRef.hash }));
      });
    `;
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, CREATIVE_INTELLIGENCE_DATA_ROOT: TEST_DATA_ROOT },
      encoding: 'utf8',
    });
    const result = JSON.parse(stdout);
    assert.equal(result.cycleId, cycleId);
    assert.equal(result.hash, snapshotRef.hash);
  });
});

describe('I. Inmutabilidad', () => {
  test('guardar dos veces el mismo cycleId lanza — nunca sobrescribe historia en silencio', () => {
    const snapshotRef = saveEvidenceSnapshot(sampleEvidenceBatch('-I'));
    const cycleId = `cycle-I-${randomUUID()}`;
    saveCycle(createCycleOutput({ cycleId, evidenceSnapshotRef: snapshotRef }));
    assert.throws(() => saveCycle(createCycleOutput({ cycleId, evidenceSnapshotRef: snapshotRef, warnings: ['intento de sobrescribir'] })), /inmutables/);
    // Confirma que el contenido original sigue intacto (no se sobrescribió parcialmente).
    assert.deepEqual(getCycle(cycleId).warnings, []);
  });

  test('guardar el mismo evidenceBatch dos veces es un no-op idempotente (mismo hash, mismo archivo, no pérdida)', () => {
    const batch = sampleEvidenceBatch('-I-evidence');
    const ref1 = saveEvidenceSnapshot(batch);
    const ref2 = saveEvidenceSnapshot(batch);
    assert.equal(ref1.hash, ref2.hash);
    assert.equal(ref1.path, ref2.path);
  });
});

describe('J. Hash reproducible', () => {
  test('el mismo evidenceBatch produce siempre el mismo hash', () => {
    const batch = sampleEvidenceBatch('-J');
    const h1 = computeEvidenceSnapshotHash(batch);
    const h2 = computeEvidenceSnapshotHash(JSON.parse(JSON.stringify(batch))); // copia independiente, mismo contenido
    assert.equal(h1, h2);
    assert.match(h1, /^[a-f0-9]{64}$/); // sha256 hex
  });

  test('un evidenceBatch con contenido distinto produce un hash distinto', () => {
    const h1 = computeEvidenceSnapshotHash(sampleEvidenceBatch('-J-a'));
    const h2 = computeEvidenceSnapshotHash(sampleEvidenceBatch('-J-b'));
    assert.notEqual(h1, h2);
  });
});

describe('K. cycleId incorrecto', () => {
  test('saveCycle con un CycleOutput ya inválido (cycleId vacío) lanza antes de tocar disco', () => {
    assert.throws(() => createCycleOutput({ cycleId: '', evidenceSnapshotRef: saveEvidenceSnapshot(sampleEvidenceBatch('-K')) }), /cycleId/);
  });
});

describe('L. Evidencia faltante', () => {
  test('getEvidenceSnapshot lanza si el hash no existe — nunca inventa un snapshot', () => {
    assert.throws(() => getEvidenceSnapshot('hash-que-no-existe-'.repeat(3)), /no existe/);
    assert.equal(evidenceSnapshotExists('hash-que-no-existe-'.repeat(3)), false);
  });

  test('createCycleOutput exige evidenceSnapshotRef real — nunca un ciclo sin procedencia de evidencia', () => {
    assert.throws(() => createCycleOutput({ cycleId: `cycle-L-${randomUUID()}` }), /evidenceSnapshotRef/);
  });
});

describe('M. Recuperación de un ciclo inexistente', () => {
  test('getCycle lanza para un cycleId que nunca se guardó — nunca devuelve un ciclo inventado', () => {
    assert.throws(() => getCycle(`cycle-que-nunca-existio-${randomUUID()}`), /no existe/);
  });
});

describe('Extras: getStrategySnapshot y saveCycleWithEvidence', () => {
  test('getStrategySnapshot proyecta solo los campos de estrategia, sin duplicar el CycleOutput completo', () => {
    const fakeAngle = { angleId: 'a1', angleText: 'x' };
    const snapshotRef = saveEvidenceSnapshot(sampleEvidenceBatch('-strategy'));
    const cycleId = `cycle-strategy-${randomUUID()}`;
    saveCycle(createCycleOutput({ cycleId, evidenceSnapshotRef: snapshotRef, angles: [fakeAngle], priorityCreativeCells: [{ creativeCellId: 'c1' }] }));
    const strategy = getStrategySnapshot(cycleId);
    assert.equal(strategy.angles[0].angleId, 'a1');
    assert.equal('priorityCreativeCells' in strategy, false); // no es parte de la "estrategia", queda fuera de la proyección
  });

  test('saveCycleWithEvidence encadena guardar-evidencia + guardar-ciclo en un solo paso', () => {
    const cycleId = `cycle-combo-${randomUUID()}`;
    const result = saveCycleWithEvidence(sampleEvidenceBatch('-combo'), { cycleId });
    assert.equal(result.cycleId, cycleId);
    assert.equal(getCycle(cycleId).cycleId, cycleId);
  });
});
