import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toJson, toJsonl } from '../src/export/exportJson.js';
import { toCsv } from '../src/export/exportCsv.js';
import { toMarkdownReport } from '../src/export/exportMarkdown.js';

describe('export — JSON/JSONL/CSV/Markdown', () => {
  test('toJsonl produce una línea por registro', () => {
    const jsonl = toJsonl([{ a: 1 }, { a: 2 }]);
    assert.equal(jsonl.split('\n').filter(Boolean).length, 2);
  });

  test('toJsonl con arreglo vacío produce cadena vacía', () => {
    assert.equal(toJsonl([]), '');
  });

  test('toCsv escapa comas y comillas correctamente', () => {
    const csv = toCsv([{ title: 'Hola, "mundo"', value: 1 }]);
    assert.match(csv, /"Hola, ""mundo"""/);
  });

  test('toCsv serializa campos anidados como JSON', () => {
    const csv = toCsv([{ ids: ['a', 'b'] }]);
    assert.match(csv, /\[""a"",""b""\]|\["a","b"\]/);
  });

  test('toMarkdownReport incluye las cuatro secciones de la cadena de trazabilidad', () => {
    const report = toMarkdownReport({
      rawRecords: [{ source: 'web', fetch_status: 'ok', title: 't', url: 'u', retrieved_at: 'now', content_hash: 'abcdef1234567890' }],
      observations: [{ dimension: 'hook', value: 'v', evidence_quote: 'q', source_record_id: '12345678-aaaa' }],
      inferences: [{ dimension: 'hook', pattern: 'v', frequency: 1, scope: 'N=1' }],
      hypotheses: [{ hypothesis: 'texto especulativo' }],
    });
    assert.match(report, /## Fuentes RAW consultadas/);
    assert.match(report, /## Observaciones/);
    assert.match(report, /## Inferencias/);
    assert.match(report, /## Hipótesis/);
  });
});
