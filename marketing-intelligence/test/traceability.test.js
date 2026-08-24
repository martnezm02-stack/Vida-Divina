import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecord } from '../src/contract.js';
import { RawStore } from '../src/storage/rawStore.js';
import { IntelligenceStore } from '../src/storage/intelligenceStore.js';
import { extractObservations } from '../src/pipeline/observation.js';
import { aggregateInferences } from '../src/pipeline/inference.js';
import { generateHypotheses } from '../src/pipeline/hypothesis.js';

describe('Trazabilidad completa: SOURCE -> OBSERVATION -> INFERENCE -> HYPOTHESIS', () => {
  let dir, rawStore, intelligenceStore;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'mi-trace-'));
    rawStore = new RawStore(join(dir, 'raw'));
    intelligenceStore = new IntelligenceStore(join(dir, 'intelligence'));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('se puede recorrer la cadena completa desde una hipótesis hasta el registro RAW original', () => {
    const rawRecord = createRecord({
      source: 'web',
      platform_object_type: 'article',
      url: 'https://fixture.test/hook-cta',
      title: '¿Quieres perder peso rápido?',
      content: 'Compra ahora nuestro producto y transforma tu vida.',
      access_method: 'specialized_tool',
    });
    rawStore.save(rawRecord);

    const observations = extractObservations(rawRecord);
    for (const obs of observations) intelligenceStore.save('observation', obs);

    const inferences = aggregateInferences(observations, { scopeLabel: 'N=1 registro (prueba de trazabilidad)' });
    for (const inf of inferences) intelligenceStore.save('inference', inf);

    const hypotheses = generateHypotheses(inferences);
    for (const hyp of hypotheses) intelligenceStore.save('hypothesis', hyp);

    assert.ok(hypotheses.length > 0, 'la fixture debe producir al menos una hipótesis');

    // Recorrido inverso: Hipótesis -> Inferencia -> Observación -> Registro RAW.
    const hyp = intelligenceStore.loadAll('hypothesis')[0];
    const inf = intelligenceStore.loadAll('inference').find((i) => i.inference_id === hyp.based_on_inference_id);
    assert.ok(inf, 'la inferencia referenciada debe existir en el store');

    const obs = intelligenceStore.loadAll('observation').find((o) => inf.based_on_observation_ids.includes(o.observation_id));
    assert.ok(obs, 'la observación referenciada debe existir en el store');

    const source = rawStore.loadByRecordId(obs.source_record_id);
    assert.ok(source, 'el registro RAW de origen debe ser recuperable');
    assert.equal(source.record_id, rawRecord.record_id);
    assert.equal(source.url, 'https://fixture.test/hook-cta');
  });

  test('RAW e inteligencia nunca se mezclan en el mismo almacenamiento', () => {
    // rawStore e intelligenceStore usan directorios distintos y ninguno conoce
    // la forma de datos del otro — se verifica que las observaciones no
    // contienen el contenido crudo completo, solo un evidence_quote corto.
    const observations = intelligenceStore.loadAll('observation');
    for (const obs of observations) {
      assert.ok(!('content' in obs), 'una observación no debe contener el campo "content" crudo del registro RAW');
      assert.ok(obs.evidence_quote.length < 200, 'evidence_quote debe ser un fragmento corto, no el contenido completo');
    }
  });
});
