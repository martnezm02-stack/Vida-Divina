import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSourceReference, SOURCE_MODULES } from '../src/sourceReference.js';

describe('SourceReference — soporta los 4 módulos reales del sistema', () => {
  test('acepta los 4 source_module válidos', () => {
    for (const source_module of SOURCE_MODULES) {
      const ref = createSourceReference({ source_module, reference_type: 'pattern', reference_id: 'x', rationale: 'r' });
      assert.equal(ref.source_module, source_module);
    }
  });

  test('rechaza un source_module inválido', () => {
    assert.throws(() => createSourceReference({ source_module: 'otro_modulo', reference_type: 'pattern', reference_id: 'x', rationale: 'r' }));
  });

  test('exige rationale — nunca una referencia sin justificación', () => {
    assert.throws(() => createSourceReference({ source_module: 'marketing_intelligence', reference_type: 'pattern', reference_id: 'x' }));
  });
});
