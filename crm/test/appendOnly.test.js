// appendOnly.test.js
// Verifica, por reflexión sobre los exports de cada módulo, que los
// repositories históricos (Fase B §22) nunca exponen un método genérico de
// update/delete. No requiere PostgreSQL — es una prueba puramente
// estructural sobre el código, no sobre datos.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as messageRepository from '../repositories/messageRepository.js';
import * as stateTransitionRepository from '../repositories/stateTransitionRepository.js';
import * as offerLogRepository from '../repositories/offerLogRepository.js';

const PROHIBIDOS = /^(update|delete|remove)/i;

function assertSinMutacionGenerica(repositorio, nombreModulo) {
  const exportados = Object.keys(repositorio);
  const encontrados = exportados.filter((nombre) => PROHIBIDOS.test(nombre));
  assert.deepEqual(
    encontrados,
    [],
    `${nombreModulo} no debe exportar update/delete genéricos (histórico/append-only) — encontrado: ${encontrados.join(', ')}`
  );
}

test('messageRepository es append-only (sin update/delete)', () => {
  assertSinMutacionGenerica(messageRepository, 'messageRepository');
});

test('stateTransitionRepository es append-only (sin update/delete)', () => {
  assertSinMutacionGenerica(stateTransitionRepository, 'stateTransitionRepository');
});

test('offerLogRepository es append-only (sin update/delete)', () => {
  assertSinMutacionGenerica(offerLogRepository, 'offerLogRepository');
});

test('handoffRepository no expone un update genérico — solo resolveHandoff, acotado (ver nota en el archivo)', async () => {
  const handoffRepository = await import('../repositories/handoffRepository.js');
  const exportados = Object.keys(handoffRepository);
  assert.ok(!exportados.includes('updateHandoff'), 'no debe existir un updateHandoff genérico');
  assert.ok(!exportados.some((n) => /^delete/i.test(n)), 'no debe existir ningún deleteHandoff*');
  assert.ok(exportados.includes('resolveHandoff'), 'debe existir el método acotado resolveHandoff (ver nota de discrepancia Fase A/Fase B en el archivo)');
});
