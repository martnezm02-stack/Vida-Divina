import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runPainStage } from '../orchestrator/stages/painStage.js';
import { buildEvidenceIndex } from '../orchestrator/stages/evidenceIndex.js';

function energyEvidenceIndex() {
  return buildEvidenceIndex([
    {
      domain: 'MARKET_EVIDENCE',
      records: [
        { evidenceId: 'ME-07', verbatimQuote: 'El te genera palpitaciones', sourcePlatform: 'herbal-plan.blogspot.com' },
        { evidenceId: 'ME-08', verbatimQuote: 'A mi el te me da Taquicardia', sourcePlatform: 'herbal-plan.blogspot.com' },
        { evidenceId: 'ME-09', verbatimQuote: 'El te me da taquicardia', sourcePlatform: 'herbal-plan.blogspot.com' },
        { evidenceId: 'ME-13', verbatimQuote: 'tengo insomnio taquicardia', sourcePlatform: 'herbalife-revelaciones.blogspot.com' },
      ],
    },
    { domain: 'COMPETITIVE_EVIDENCE', records: [{ evidenceId: 'AR-06', competitor: 'Fuxion' }] },
  ]);
}

function validCandidate(overrides = {}) {
  return {
    personaId: 'persona-energia-1',
    painPoint: 'Taquicardia/palpitaciones al tomar productos con estimulante.',
    supportingEvidenceIds: ['ME-07', 'ME-08', 'ME-09', 'ME-13'],
    cluster: 'reaccion_a_estimulante',
    ...overrides,
  };
}

describe('painStage — frequency derivada, nunca declarada a mano', () => {
  test('frequency = cantidad de evidenceIds reales citados; highFrequencyAnchor se activa solo (freq≥3)', () => {
    const { pains, warnings } = runPainStage({ painCandidates: [validCandidate()], evidenceIndex: energyEvidenceIndex() });
    assert.equal(warnings.length, 0);
    assert.equal(pains[0].frequency, 4);
    assert.equal(pains[0].highFrequencyAnchor, true);
    assert.equal(pains[0].verbatimQuote, 'El te genera palpitaciones'); // del primer evidenceId citado
  });

  test('con menos de 3 citas, highFrequencyAnchor queda false — no se infla el anchor', () => {
    const { pains } = runPainStage({ painCandidates: [validCandidate({ supportingEvidenceIds: ['ME-07', 'ME-08'] })], evidenceIndex: energyEvidenceIndex() });
    assert.equal(pains[0].frequency, 2);
    assert.equal(pains[0].highFrequencyAnchor, false);
  });

  test('rechaza evidencia competitiva convertida en pain de cliente', () => {
    const candidate = validCandidate({ supportingEvidenceIds: ['ME-07', 'ME-08', 'AR-06'] });
    const { pains, warnings } = runPainStage({ painCandidates: [candidate], evidenceIndex: energyEvidenceIndex() });
    assert.equal(pains.length, 0);
    assert.match(warnings[0].reason, /COMPETITIVE_EVIDENCE/);
  });

  test('ejecuta el pressure test (surface → root) cuando se provee', () => {
    const candidate = validCandidate({ pressureTest: { surfaceSymptom: 'taquicardia ocasional', rootPain: 'miedo a un problema cardíaco no diagnosticado' } });
    const { pressureTests } = runPainStage({ painCandidates: [candidate], evidenceIndex: energyEvidenceIndex() });
    assert.equal(pressureTests[0].result.isSameText, false);
  });

  test('groupByCluster agrupa los pains resultantes por cluster', () => {
    const { clusters } = runPainStage({
      painCandidates: [validCandidate(), validCandidate({ painPoint: 'otro pain', cluster: 'reaccion_a_estimulante', supportingEvidenceIds: ['ME-07'] })],
      evidenceIndex: energyEvidenceIndex(),
    });
    assert.equal(clusters.get('reaccion_a_estimulante').length, 2);
  });

  test('rechaza un evidenceId inexistente sin fabricar procedencia', () => {
    const candidate = validCandidate({ supportingEvidenceIds: ['ME-NO-EXISTE'] });
    const { pains, warnings } = runPainStage({ painCandidates: [candidate], evidenceIndex: energyEvidenceIndex() });
    assert.equal(pains.length, 0);
    assert.match(warnings[0].reason, /no existe en el evidenceBatch/);
  });

  test('reporta INSUFFICIENT_DATA cuando ningún candidato produce un Pain válido', () => {
    const { warnings } = runPainStage({ painCandidates: [validCandidate({ supportingEvidenceIds: ['AR-06'] })], evidenceIndex: energyEvidenceIndex() });
    assert.ok(warnings.some((w) => w.type === 'INSUFFICIENT_DATA'));
  });
});
