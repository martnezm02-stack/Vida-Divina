import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSignal, confidenceFromEvidenceLevel, deriveSignalStrength,
  SIGNAL_TYPES, EVIDENCE_LEVELS,
} from '../src/marketingIntelligence/schema.js';

function baseFields(overrides = {}) {
  return {
    type: 'TrendSignal',
    title: 'Señal de prueba',
    source: 'last30days (X)',
    sourceType: 'SOCIAL',
    capturedAt: '2026-08-31',
    timeWindow: '30d',
    observation: 'Observación real de evidencia.',
    evidenceLevel: 'MEDIUM',
    claimType: 'SIGNAL',
    ...overrides,
  };
}

describe('createSignal — validación de gobernanza (sección 51: no crear señales sin source/evidence)', () => {
  test('rechaza sin source', () => {
    const fields = baseFields();
    delete fields.source;
    assert.throws(() => createSignal(fields), /"source" es obligatorio/);
  });

  test('rechaza sin observation (evidencia)', () => {
    const fields = baseFields();
    delete fields.observation;
    assert.throws(() => createSignal(fields), /"observation" es obligatorio/);
  });

  test('rechaza type inválido', () => {
    assert.throws(() => createSignal(baseFields({ type: 'NotARealType' })), /"type" inválido/);
  });

  test('rechaza sourceType inválido', () => {
    assert.throws(() => createSignal(baseFields({ sourceType: 'MADE_UP' })), /"sourceType" inválido/);
  });

  test('rechaza evidenceLevel inválido', () => {
    assert.throws(() => createSignal(baseFields({ evidenceLevel: 'SUPER_HIGH' })), /"evidenceLevel" inválido/);
  });

  test('rechaza claimType inválido — nunca almacenar INFERENCE como FACT sin declararlo', () => {
    assert.throws(() => createSignal(baseFields({ claimType: 'DEFINITELY_TRUE' })), /"claimType" inválido/);
  });

  test('acepta los 14 SIGNAL_TYPES', () => {
    for (const type of SIGNAL_TYPES) {
      const fields = baseFields({ type });
      if (type === 'CatalogDiscrepancy') {
        fields.productId = 'producto-x';
        fields.details = { externalSignal: 'X dice A', currentInternalData: 'Catálogo dice B' };
      }
      assert.doesNotThrow(() => createSignal(fields));
    }
  });
});

describe('confidenceFromEvidenceLevel — mapeo fijo, no precisión inventada (sección 9)', () => {
  test('mapea cada evidenceLevel documentado a un número fijo', () => {
    assert.equal(confidenceFromEvidenceLevel('HIGH'), 0.8);
    assert.equal(confidenceFromEvidenceLevel('MEDIUM-HIGH'), 0.65);
    assert.equal(confidenceFromEvidenceLevel('MEDIUM'), 0.5);
    assert.equal(confidenceFromEvidenceLevel('LOW-MEDIUM'), 0.35);
    assert.equal(confidenceFromEvidenceLevel('LOW'), 0.2);
  });

  test('lanza para un evidenceLevel no reconocido', () => {
    assert.throws(() => confidenceFromEvidenceLevel('ULTRA'), /evidenceLevel inválido/);
  });

  test('createSignal nunca eleva confidence respecto al evidenceLevel declarado', () => {
    const low = createSignal(baseFields({ evidenceLevel: 'LOW' }));
    const high = createSignal(baseFields({ evidenceLevel: 'HIGH', title: 'Otra señal' }));
    assert.equal(low.confidence, 0.2);
    assert.equal(high.confidence, 0.8);
    assert.ok(low.confidence < high.confidence);
  });
});

describe('deriveSignalStrength — etiqueta relativa, no score científico (sección 10)', () => {
  test('HIGH solo con evidenceLevel alto Y confirmación cruzada', () => {
    assert.equal(deriveSignalStrength({ evidenceLevel: 'HIGH', crossSourceConfirmed: true }), 'HIGH');
    assert.equal(deriveSignalStrength({ evidenceLevel: 'HIGH', crossSourceConfirmed: false }), 'MEDIUM');
  });

  test('LOW cuando ni evidencia ni confirmación cruzada respaldan más', () => {
    assert.equal(deriveSignalStrength({ evidenceLevel: 'LOW', crossSourceConfirmed: false }), 'LOW');
  });
});

describe('CatalogDiscrepancy — registro separado obligatorio (sección 30)', () => {
  test('requiere productId y details.externalSignal/currentInternalData', () => {
    assert.throws(
      () => createSignal(baseFields({ type: 'CatalogDiscrepancy' })),
      /CatalogDiscrepancy requiere "productId"/,
    );
    assert.throws(
      () => createSignal(baseFields({ type: 'CatalogDiscrepancy', productId: 'venus-capsules' })),
      /CatalogDiscrepancy requiere "details.externalSignal"/,
    );
  });

  test('acepta un registro completo y lo etiqueta PUBLIC_NOT_IN_PROJECT_CATALOG vía tags', () => {
    const signal = createSignal(baseFields({
      type: 'CatalogDiscrepancy',
      productId: 'venus-capsules',
      tags: ['PUBLIC_NOT_IN_PROJECT_CATALOG'],
      details: { externalSignal: 'Listado dice Tongkat Ali', currentInternalData: 'Catálogo interno: sin Tongkat Ali' },
    }));
    assert.ok(signal.tags.includes('PUBLIC_NOT_IN_PROJECT_CATALOG'));
    assert.equal(signal.details.externalSignal, 'Listado dice Tongkat Ali');
  });
});

describe('Enums de detail validados solo si están presentes (sección 6: no forzar campos ausentes)', () => {
  test('acepta un signal sin details.saturationLevel (campo opcional real)', () => {
    assert.doesNotThrow(() => createSignal(baseFields({ type: 'HookPattern' })));
  });

  test('rechaza un saturationLevel inválido si se provee', () => {
    assert.throws(
      () => createSignal(baseFields({ type: 'HookPattern', details: { saturationLevel: 'EXTREME' } })),
      /details.saturationLevel/,
    );
  });
});

describe('EVIDENCE_LEVELS conserva combinaciones del reporte de origen', () => {
  test('incluye MEDIUM-HIGH y LOW-MEDIUM, no solo HIGH/MEDIUM/LOW puros', () => {
    assert.ok(EVIDENCE_LEVELS.includes('MEDIUM-HIGH'));
    assert.ok(EVIDENCE_LEVELS.includes('LOW-MEDIUM'));
  });
});
