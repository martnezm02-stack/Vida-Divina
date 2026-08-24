import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAngle, validateAngle, createEmptyCell, diagnoseEmptyCell, buildAngleGrid } from '../src/angle.js';

function baseArgs(overrides = {}) {
  return {
    personaId: 'persona-123',
    painId: 'pain-456',
    awarenessStage: 'Problem Aware',
    angleText: 'La hinchazón después de comer no es normal, aunque todos digan que sí',
    scriptDirection: 'Abrir normalizando el síntoma, luego reencuadrarlo como señal real que merece atención',
    painAnchor: 'Sentirse hinchada e incómoda después de cada comida',
    ...overrides,
  };
}

describe('Angle validation — Pillar 3', () => {
  test('crea un Angle válido', () => {
    const angle = createAngle(baseArgs());
    assert.ok(angle.angleId);
    assert.equal(angle.isEmptyCell, false);
  });

  test('un angle NO es un hook — rechaza un objeto con forma de hook (sin scriptDirection ni painAnchor)', () => {
    const hookShaped = { personaId: 'persona-123', painId: 'pain-456', awarenessStage: 'Problem Aware', angleText: 'Espera... ¿esto es normal?' };
    assert.throws(() => createAngle(hookShaped), /scriptDirection/);
  });

  test('un angle NO es un hook — rechaza sin painAnchor aunque tenga scriptDirection', () => {
    assert.throws(() => createAngle(baseArgs({ painAnchor: '' })), /painAnchor/);
  });

  test('exige urgencyMechanic en Most Aware', () => {
    assert.throws(() => createAngle(baseArgs({ awarenessStage: 'Most Aware', urgencyMechanic: null })), /urgencyMechanic/);
    const angle = createAngle(baseArgs({ awarenessStage: 'Most Aware', urgencyMechanic: 'Últimos disponibles esta semana' }));
    assert.equal(angle.urgencyMechanic, 'Últimos disponibles esta semana');
  });

  test('rechaza un awarenessStage inválido', () => {
    assert.throws(() => createAngle(baseArgs({ awarenessStage: 'Curious' })));
  });

  test('validateAngle revalida un objeto ya construido', () => {
    assert.equal(validateAngle(createAngle(baseArgs())), true);
  });
});

describe('Empty-Cell Warning Check — Prompt 6', () => {
  test('tolera empty cells con razón válida', () => {
    const cell = createEmptyCell({ personaId: 'p1', painId: 'pain-1', awarenessStage: 'Unaware', reason: 'CATEGORY_GAP' });
    assert.equal(cell.isEmptyCell, true);
    assert.equal(cell.flagForPillar1Recut, false);
  });

  test('PERSONA_MIS_DEFINED marca la celda para re-cutting en Pillar 1', () => {
    const cell = createEmptyCell({ personaId: 'p1', painId: 'pain-1', awarenessStage: 'Unaware', reason: 'PERSONA_MIS_DEFINED' });
    assert.equal(cell.flagForPillar1Recut, true);
  });

  test('rechaza una razón fuera de las 2 definidas', () => {
    assert.throws(() => createEmptyCell({ personaId: 'p1', painId: 'pain-1', awarenessStage: 'Unaware', reason: 'BECAUSE_YES' }));
  });

  test('diagnoseEmptyCell detecta un Unaware que en realidad es Problem Aware', () => {
    const diagnosis = diagnoseEmptyCell({ awarenessStage: 'Unaware', angleText: 'x', appearsToDescribeStage: 'Problem Aware' });
    assert.equal(diagnosis.diagnosis, 'CATEGORY_GAP');
  });

  test('diagnoseEmptyCell no diagnostica nada si no hay discrepancia', () => {
    assert.equal(diagnoseEmptyCell({ awarenessStage: 'Unaware', angleText: 'x', appearsToDescribeStage: null }), null);
    assert.equal(diagnoseEmptyCell({ awarenessStage: 'Unaware', angleText: 'x', appearsToDescribeStage: 'Unaware' }), null);
  });

  test('buildAngleGrid organiza angles y celdas vacías en los 5 stages', () => {
    const angle = createAngle(baseArgs());
    const empty = createEmptyCell({ personaId: 'p1', painId: 'pain-1', awarenessStage: 'Unaware', reason: 'CATEGORY_GAP' });
    const grid = buildAngleGrid([angle, empty]);
    assert.equal(grid['Problem Aware'], angle);
    assert.equal(grid['Unaware'], empty);
    assert.equal(grid['Most Aware'], null);
  });
});
