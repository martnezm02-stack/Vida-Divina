import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CostGuard } from '../src/agent/costGuard.js';

describe('CostGuard — control de costos y límites (§16)', () => {
  test('con presupuesto 0 (default), un proveedor con costo real NO puede procesar nada', () => {
    const guard = new CostGuard(); // max_llm_budget_usd = 0 por defecto
    const check = guard.canProcessOne(0.01);
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'max_llm_budget_usd_reached');
  });

  test('un proveedor sin costo (heurístico, $0) puede procesar con presupuesto 0', () => {
    const guard = new CostGuard();
    assert.equal(guard.canProcessOne(0).allowed, true);
  });

  test('se detiene al alcanzar max_documents_per_run, sin importar el costo', () => {
    const guard = new CostGuard({ maxLlmBudgetUsd: 100, maxDocumentsPerRun: 2 });
    guard.recordProcessed(0);
    guard.recordProcessed(0);
    const check = guard.canProcessOne(0);
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'max_documents_per_run_reached');
  });

  test('se detiene al alcanzar max_llm_budget_usd y nunca busca gastar de más', () => {
    const guard = new CostGuard({ maxLlmBudgetUsd: 0.02, maxDocumentsPerRun: 100 });
    assert.equal(guard.canProcessOne(0.01).allowed, true);
    guard.recordProcessed(0.01);
    assert.equal(guard.canProcessOne(0.01).allowed, true);
    guard.recordProcessed(0.01);
    // ya gastó 0.02 == presupuesto; un documento más lo excedería.
    const check = guard.canProcessOne(0.01);
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'max_llm_budget_usd_reached');
    assert.equal(guard.summary.spentUsd, 0.02);
  });
});

describe('CostGuard — límite de tokens por documento (Fase 5, §3)', () => {
  test('sin configurar, no hay límite (Infinity) — no bloquea el comportamiento previo', () => {
    const guard = new CostGuard();
    assert.equal(guard.exceedsTokenLimit(1_000_000), false);
  });

  test('un documento por debajo del límite configurado no se bloquea', () => {
    const guard = new CostGuard({ maxTokensPerDocument: 1000 });
    assert.equal(guard.exceedsTokenLimit(500), false);
  });

  test('un documento que excede el límite configurado se bloquea antes de gastar nada', () => {
    const guard = new CostGuard({ maxTokensPerDocument: 1000 });
    assert.equal(guard.exceedsTokenLimit(5000), true);
  });
});
