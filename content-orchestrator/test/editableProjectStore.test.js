// editableProjectStore.test.js — Editable Video Project (2026-08-24).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_DATA_ROOT = mkdtempSync(join(tmpdir(), 'editable-project-store-test-'));
process.env.EDITABLE_PROJECT_DATA_ROOT = TEST_DATA_ROOT;

let saveProject;
let getProject;
let listProjectsForCreative;

before(async () => {
  ({ saveProject, getProject, listProjectsForCreative } = await import('../src/editableProjectStore.js'));
});
after(() => { rmSync(TEST_DATA_ROOT, { recursive: true, force: true }); delete process.env.EDITABLE_PROJECT_DATA_ROOT; });

function projectReal(overrides = {}) {
  return { projectId: 'proj-1', creativeId: 'creative-1', versions: [{ versionNumber: 1 }], ...overrides };
}

describe('editableProjectStore — persistencia MUTABLE real de un proyecto editable', () => {
  test('guarda y recupera un proyecto real', () => {
    saveProject(projectReal());
    const loaded = getProject('proj-1');
    assert.equal(loaded.projectId, 'proj-1');
    assert.equal(loaded.versions.length, 1);
  });

  test('a diferencia de los stores inmutables, SOBRESCRIBE al guardar de nuevo (agregar una versión real)', () => {
    saveProject(projectReal({ versions: [{ versionNumber: 1 }, { versionNumber: 2 }] }));
    const loaded = getProject('proj-1');
    assert.equal(loaded.versions.length, 2);
  });

  test('exige "versions" real no vacío', () => {
    assert.throws(() => saveProject({ projectId: 'x', versions: [] }), /versions/);
  });

  test('getProject sobre un id real inexistente lanza', () => {
    assert.throws(() => getProject('no-existe'), /no existe/);
  });

  test('listProjectsForCreative filtra por creativeId real', () => {
    saveProject(projectReal({ projectId: 'proj-2', creativeId: 'creative-2', versions: [{ versionNumber: 1 }] }));
    const propios = listProjectsForCreative('creative-1');
    assert.equal(propios.length, 1);
    assert.equal(propios[0].projectId, 'proj-1');
  });
});
