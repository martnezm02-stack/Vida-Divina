import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCycleOutput, validateCycleOutput, assertNoWinnerClaim, GATE_STATUSES, getGateStatusValue } from '../schemas/cycleOutput.schema.js';

function validSnapshotRef() {
  return { hash: 'a'.repeat(64), path: '/fake/path/evidence/aaaa.json' };
}

describe('C. CycleOutput válido', () => {
  test('acepta el mínimo real: cycleId + evidenceSnapshotRef, arreglos vacíos por defecto', () => {
    const output = createCycleOutput({ cycleId: 'cycle-1', evidenceSnapshotRef: validSnapshotRef() });
    assert.equal(output.cycleId, 'cycle-1');
    assert.ok(output.generatedAt);
    assert.deepEqual([...output.personas], []);
    assert.deepEqual([...output.priorityCreativeCells], []);
    assert.deepEqual(output.gateStatus, {});
  });

  test('ensambla entidades reales (objetos ya producidos por src/) sin transformarlas', () => {
    const fakePersona = Object.freeze({ personaId: 'p1', name: 'La Repetidora Agotada', confidence: 'PROVISIONAL' });
    const fakeCell = Object.freeze({ creativeCellId: 'c1', priority: 'candidate' });
    const output = createCycleOutput({
      cycleId: 'cycle-2', evidenceSnapshotRef: validSnapshotRef(),
      personas: [fakePersona], priorityCreativeCells: [fakeCell],
      gateStatus: { strategyApproval: 'PENDING' },
    });
    assert.equal(output.personas[0].personaId, 'p1');
    assert.equal(output.priorityCreativeCells[0].priority, 'candidate');
    assert.equal(output.gateStatus.strategyApproval, 'PENDING');
  });

  test('los 3 gate statuses son exactamente los esperados', () => {
    assert.deepEqual([...GATE_STATUSES], ['PENDING', 'APPROVED', 'REJECTED']);
  });

  test('validateCycleOutput revalida un objeto ya construido (ej. leído de disco)', () => {
    const output = createCycleOutput({ cycleId: 'cycle-3', evidenceSnapshotRef: validSnapshotRef() });
    assert.equal(validateCycleOutput(JSON.parse(JSON.stringify(output))), true);
  });
});

describe('D. CycleOutput inválido', () => {
  test('rechaza cycleId vacío (cycleId omitido se autogenera por diseño — ver createCycleOutput)', () => {
    assert.throws(() => createCycleOutput({ cycleId: '', evidenceSnapshotRef: validSnapshotRef() }), /cycleId/);
  });

  test('cycleId omitido se autogenera (randomUUID), nunca queda vacío en silencio', () => {
    const output = createCycleOutput({ evidenceSnapshotRef: validSnapshotRef() });
    assert.ok(output.cycleId?.trim());
  });

  test('rechaza sin evidenceSnapshotRef real (nunca un ciclo sin procedencia)', () => {
    assert.throws(() => createCycleOutput({ cycleId: 'cycle-4' }), /evidenceSnapshotRef/);
    assert.throws(() => createCycleOutput({ cycleId: 'cycle-4', evidenceSnapshotRef: {} }), /evidenceSnapshotRef/);
  });

  test('rechaza campos que deberían ser arreglos y no lo son', () => {
    assert.throws(() => createCycleOutput({ cycleId: 'cycle-5', evidenceSnapshotRef: validSnapshotRef(), personas: 'no-es-arreglo' }), /personas/);
  });

  test('rechaza gateStatus con valor fuera del enum', () => {
    assert.throws(
      () => createCycleOutput({ cycleId: 'cycle-6', evidenceSnapshotRef: validSnapshotRef(), gateStatus: { strategyApproval: 'MAYBE' } }),
      /gateStatus/
    );
  });

  test('nunca permite WINNER/VALIDATED/PROVEN como estado derivado — ni en CreativeCell, ni en warnings, ni en ningún campo', () => {
    assert.throws(
      () => createCycleOutput({ cycleId: 'cycle-7', evidenceSnapshotRef: validSnapshotRef(), priorityCreativeCells: [{ creativeCellId: 'c1', priority: 'WINNER' }] }),
      /prohibido/
    );
    assert.throws(
      () => createCycleOutput({ cycleId: 'cycle-8', evidenceSnapshotRef: validSnapshotRef(), warnings: ['Cell 3 es la VALIDATED de este ciclo'] }),
      /prohibido/
    );
    assert.throws(
      () => createCycleOutput({ cycleId: 'cycle-9', evidenceSnapshotRef: validSnapshotRef(), hypotheses: [{ hypothesisId: 'h1', status: 'PROVEN' }] }),
      /prohibido/
    );
  });

  test('assertNoWinnerClaim se puede invocar directamente sobre cualquier objeto', () => {
    assert.equal(assertNoWinnerClaim({ ok: true, status: 'PRIORITY_HYPOTHESIS_FOR_TESTING' }), true);
    assert.throws(() => assertNoWinnerClaim({ status: 'winner' }), /prohibido/); // case-insensitive
  });
});

// ---------------------------------------------------------------------
// Fase 4D — Approval Provenance / Audit Trail. gateStatus[gate] ahora
// acepta LEGACY (string bare, histórico) o NEW ({status, reviewedBy?,
// reviewedAt?}), coexistiendo -- nunca se migra ni reescribe lo histórico.
// ---------------------------------------------------------------------
describe('E. Fase 4D — Approval Provenance / Audit Trail', () => {
  // Requisitos 1-3: formato LEGACY (string), los 3 valores del enum.
  test('Requisito 1: legacy string PENDING -- sigue siendo válido tal cual', () => {
    const output = createCycleOutput({ cycleId: 'cycle-legacy-pending', evidenceSnapshotRef: validSnapshotRef(), gateStatus: { strategyAndBriefApproval: 'PENDING' } });
    assert.equal(output.gateStatus.strategyAndBriefApproval, 'PENDING');
  });

  test('Requisito 2: legacy string APPROVED -- sigue siendo válido tal cual', () => {
    const output = createCycleOutput({ cycleId: 'cycle-legacy-approved', evidenceSnapshotRef: validSnapshotRef(), gateStatus: { strategyAndBriefApproval: 'APPROVED' } });
    assert.equal(output.gateStatus.strategyAndBriefApproval, 'APPROVED');
  });

  test('Requisito 3: legacy string REJECTED -- sigue siendo válido tal cual', () => {
    const output = createCycleOutput({ cycleId: 'cycle-legacy-rejected', evidenceSnapshotRef: validSnapshotRef(), gateStatus: { strategyAndBriefApproval: 'REJECTED' } });
    assert.equal(output.gateStatus.strategyAndBriefApproval, 'REJECTED');
  });

  // Requisitos 4-6: formato NEW (objeto), los 3 valores del enum.
  test('Requisito 4: nuevo objeto PENDING -- válido sin reviewedBy/reviewedAt (nunca se inventan para un gate pendiente)', () => {
    const output = createCycleOutput({ cycleId: 'cycle-new-pending', evidenceSnapshotRef: validSnapshotRef(), gateStatus: { strategyAndBriefApproval: { status: 'PENDING' } } });
    assert.deepEqual(output.gateStatus.strategyAndBriefApproval, { status: 'PENDING' });
  });

  test('Requisito 5: nuevo objeto APPROVED con reviewedAt real (y reviewedBy opcional) -- válido', () => {
    const output = createCycleOutput({
      cycleId: 'cycle-new-approved', evidenceSnapshotRef: validSnapshotRef(),
      gateStatus: { strategyAndBriefApproval: { status: 'APPROVED', reviewedAt: '2026-08-22T10:00:00.000Z', reviewedBy: 'operador-real@vidadivina.example' } },
    });
    assert.equal(output.gateStatus.strategyAndBriefApproval.status, 'APPROVED');
    assert.equal(output.gateStatus.strategyAndBriefApproval.reviewedBy, 'operador-real@vidadivina.example');
  });

  test('Requisito 6: nuevo objeto REJECTED con reviewedAt real -- misma trazabilidad que APPROVED', () => {
    const output = createCycleOutput({
      cycleId: 'cycle-new-rejected', evidenceSnapshotRef: validSnapshotRef(),
      gateStatus: { strategyAndBriefApproval: { status: 'REJECTED', reviewedAt: '2026-08-22T10:05:00.000Z' } },
    });
    assert.equal(output.gateStatus.strategyAndBriefApproval.status, 'REJECTED');
    assert.equal(output.gateStatus.strategyAndBriefApproval.reviewedAt, '2026-08-22T10:05:00.000Z');
  });

  // Requisito 7/8: reviewedAt válido/inválido.
  test('Requisito 7: reviewedAt real (ISO parseable) se acepta', () => {
    assert.doesNotThrow(() => createCycleOutput({
      cycleId: 'cycle-reviewedat-valido', evidenceSnapshotRef: validSnapshotRef(),
      gateStatus: { strategyAndBriefApproval: { status: 'APPROVED', reviewedAt: '2026-08-22T10:00:00.000Z' } },
    }));
  });

  test('Requisito 8: reviewedAt ausente o no-fecha en APPROVED/REJECTED (formato nuevo) -- rechazado, nunca se inventa', () => {
    assert.throws(
      () => createCycleOutput({ cycleId: 'cycle-reviewedat-ausente', evidenceSnapshotRef: validSnapshotRef(), gateStatus: { strategyAndBriefApproval: { status: 'APPROVED' } } }),
      /reviewedAt/,
    );
    assert.throws(
      () => createCycleOutput({ cycleId: 'cycle-reviewedat-invalido', evidenceSnapshotRef: validSnapshotRef(), gateStatus: { strategyAndBriefApproval: { status: 'APPROVED', reviewedAt: 'no-es-una-fecha' } } }),
      /reviewedAt/,
    );
  });

  // Requisito 9/10: reviewedBy válido / ausencia cuando la identidad es obligatoria (no lo es hoy -- se documenta).
  test('Requisito 9: reviewedBy real (string no vacío) se acepta cuando se provee', () => {
    const output = createCycleOutput({
      cycleId: 'cycle-reviewedby-valido', evidenceSnapshotRef: validSnapshotRef(),
      gateStatus: { strategyAndBriefApproval: { status: 'APPROVED', reviewedAt: '2026-08-22T10:00:00.000Z', reviewedBy: 'revisor-real' } },
    });
    assert.equal(output.gateStatus.strategyAndBriefApproval.reviewedBy, 'revisor-real');
  });

  test('Requisito 10: ausencia de reviewedBy es válida hoy (no existe identidad confiable en el Dashboard) -- pero un reviewedBy vacío sí se rechaza si se intenta proveer uno', () => {
    // Sin identidad real disponible (auditado: cero mecanismo de auth en dashboard/server), reviewedBy nunca es obligatorio -- nunca se inventa.
    assert.doesNotThrow(() => createCycleOutput({
      cycleId: 'cycle-sin-reviewedby', evidenceSnapshotRef: validSnapshotRef(),
      gateStatus: { strategyAndBriefApproval: { status: 'APPROVED', reviewedAt: '2026-08-22T10:00:00.000Z' } },
    }));
    // Pero si SÍ se intenta proveer uno, no puede ser un string vacío (evitar un "reviewer fantasma").
    assert.throws(() => createCycleOutput({
      cycleId: 'cycle-reviewedby-vacio', evidenceSnapshotRef: validSnapshotRef(),
      gateStatus: { strategyAndBriefApproval: { status: 'APPROVED', reviewedAt: '2026-08-22T10:00:00.000Z', reviewedBy: '   ' } },
    }), /reviewedBy/);
  });

  test('un objeto PENDING con reviewedBy/reviewedAt adjuntos se rechaza -- nunca se inventa revisor/fecha para un gate pendiente', () => {
    assert.throws(() => createCycleOutput({
      cycleId: 'cycle-pending-con-reviewer', evidenceSnapshotRef: validSnapshotRef(),
      gateStatus: { strategyAndBriefApproval: { status: 'PENDING', reviewedAt: '2026-08-22T10:00:00.000Z' } },
    }), /PENDING/);
  });

  test('un objeto con campos desconocidos se rechaza -- el formato nuevo solo acepta status/reviewedBy/reviewedAt', () => {
    assert.throws(() => createCycleOutput({
      cycleId: 'cycle-campo-desconocido', evidenceSnapshotRef: validSnapshotRef(),
      gateStatus: { strategyAndBriefApproval: { status: 'APPROVED', reviewedAt: '2026-08-22T10:00:00.000Z', approvedBecause: 'porque sí' } },
    }), /campos desconocidos/);
  });

  // Requisito 11: compatibilidad con ciclos históricos.
  test('Requisito 11: un objeto ya construido en formato legado (ej. leído de disco) revalida sin cambios vía validateCycleOutput', () => {
    const legacyOutput = createCycleOutput({ cycleId: 'cycle-historico', evidenceSnapshotRef: validSnapshotRef(), gateStatus: { strategyAndBriefApproval: 'PENDING', contentApproval: 'PENDING', publicationApproval: 'PENDING' } });
    assert.equal(validateCycleOutput(JSON.parse(JSON.stringify(legacyOutput))), true);
  });

  // Requisito 13 (getGateStatusValue): ningún PENDING se convierte automáticamente en APPROVED, en ningún formato.
  test('Requisito 13: getGateStatusValue nunca sube de PENDING a APPROVED por sí solo, en ningún formato', () => {
    assert.equal(getGateStatusValue('PENDING'), 'PENDING');
    assert.equal(getGateStatusValue({ status: 'PENDING' }), 'PENDING');
    assert.equal(getGateStatusValue(undefined), 'PENDING');
    assert.equal(getGateStatusValue(null), 'PENDING');
    assert.equal(getGateStatusValue({}), 'PENDING'); // objeto sin "status" real -- nunca se asume APPROVED por defecto
  });

  test('getGateStatusValue lee correctamente ambos formatos para APPROVED/REJECTED', () => {
    assert.equal(getGateStatusValue('APPROVED'), 'APPROVED');
    assert.equal(getGateStatusValue({ status: 'APPROVED', reviewedAt: '2026-08-22T10:00:00.000Z' }), 'APPROVED');
    assert.equal(getGateStatusValue('REJECTED'), 'REJECTED');
    assert.equal(getGateStatusValue({ status: 'REJECTED', reviewedAt: '2026-08-22T10:00:00.000Z' }), 'REJECTED');
  });
});
