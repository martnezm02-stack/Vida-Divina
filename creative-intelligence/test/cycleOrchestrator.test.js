// cycleOrchestrator.test.js — 100% local: sin red, sin API, sin
// PostgreSQL, sin Instagram, sin WhatsApp. Usa un directorio temporal
// aislado (CREATIVE_INTELLIGENCE_DATA_ROOT) para nunca escribir ciclos de
// prueba dentro de creative-intelligence/data/ real.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-orchestrator-test-'));
process.env.CREATIVE_INTELLIGENCE_DATA_ROOT = TEST_DATA_ROOT;

const { runCycle, StageFailureError } = await import('../orchestrator/cycleOrchestrator.js');
const { createCycleInput } = await import('../schemas/cycleInput.schema.js');
const { getCycle, cycleExists, saveEvidenceSnapshot, getEvidenceSnapshot } = await import('../orchestrator/cycleStore.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORCHESTRATOR_MODULE_URL = pathToFileURL(path.join(__dirname, '..', 'orchestrator', 'cycleOrchestrator.js')).href;
const CYCLESTORE_MODULE_URL = pathToFileURL(path.join(__dirname, '..', 'orchestrator', 'cycleStore.js')).href;

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------
// Fixture: un escenario completo y válido (Persona de Energía, mismo
// tipo de evidencia ME-07/08/09 ya usado en fases anteriores) — reusado
// por la mayoría de los tests, cada uno con su propio cycleId único.
// ---------------------------------------------------------------------
function validEvidenceBatch() {
  return [{
    domain: 'MARKET_EVIDENCE',
    records: [
      { evidenceId: 'ME-07', verbatimQuote: 'El te genera palpitaciones', sourcePlatform: 'herbal-plan.blogspot.com' },
      { evidenceId: 'ME-08', verbatimQuote: 'A mi el te me da Taquicardia', sourcePlatform: 'herbal-plan.blogspot.com' },
      { evidenceId: 'ME-09', verbatimQuote: 'El te me da taquicardia', sourcePlatform: 'herbal-plan.blogspot.com' },
    ],
  }];
}

function validArgs(overrides = {}) {
  const cycleInput = createCycleInput({
    cycleId: `cycle-${randomUUID()}`,
    objective: 'GENERATE_CREATIVE_CELLS',
    evidenceBatch: validEvidenceBatch(),
    ...overrides.cycleInputOverrides,
  });

  return {
    cycleInput,
    personaCandidates: [{
      name: 'La Sensible a Estimulantes en Busca de Energía', lifeSituation: 'Busca energía sin efectos secundarios.',
      relationshipToProblem: 'Ya tuvo una reacción física real al tomar un energizante.',
      verbatimEvidenceIds: ['ME-07', 'ME-08', 'ME-09'],
    }],
    painCandidates: [{
      personaRef: 'La Sensible a Estimulantes en Busca de Energía',
      painPoint: 'Taquicardia con estimulantes', supportingEvidenceIds: ['ME-07', 'ME-08', 'ME-09'],
    }],
    angleCandidates: [{
      personaRef: 'La Sensible a Estimulantes en Busca de Energía', painRef: 'Taquicardia con estimulantes', awarenessStage: 'Problem Aware',
      angleText: 'Por qué el té energizante te puede dar taquicardia',
      scriptDirection: 'Explicación educativa sin alarmismo.', painAnchor: 'Taquicardia con estimulantes',
    }],
    formatCandidates: [{
      angleRef: 'Por qué el té energizante te puede dar taquicardia', recommendedFormat: 'Pharmacist / authority figure in-studio',
      justification: 'Requiere autoridad calmada.', whyBeatsDefault: 'Da credibilidad a una explicación técnica.',
      structuralSignature: { narratorType: 'creator', sceneSetup: 'studio', editRhythm: 'slow cut' },
    }],
    cellCandidates: [{
      personaRef: 'La Sensible a Estimulantes en Busca de Energía', painRef: 'Taquicardia con estimulantes', angleRef: 'Por qué el té energizante te puede dar taquicardia',
      awareness: 'Problem Aware', mechanism: 'nombrar la sensibilidad a estimulantes sin diagnosticar',
      hypothesis: { targetPersona: 'La Sensible a Estimulantes en Busca de Energía', awareness: 'Problem Aware', angle: 'Por qué el té energizante te puede dar taquicardia', format: 'Pharmacist / authority figure in-studio', expectedOutcome: 'más comentarios de identificación — BASELINE_NOT_ESTABLISHED', mechanism: 'nombrar el síntoma genera identificación' },
      productionBrief: { persona: 'La Sensible a Estimulantes en Busca de Energía', pain: 'Taquicardia con estimulantes', awareness: 'Problem Aware', angle: 'Por qué el té energizante te puede dar taquicardia', format: 'Pharmacist / authority figure in-studio', hookDirection: 'pregunta directa', mechanismEntry: 'MECHANISM_NOT_ESTABLISHED', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'creator', setting: 'studio', runtime: '20-30s' },
      priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
    }],
    ...overrides,
  };
}

describe('A. Ciclo válido', () => {
  test('runCycle ejecuta las 5 stages en orden y produce un CycleOutput completo y guardado', () => {
    const args = validArgs();
    const { cycleOutput, saveResult, priorityRanking } = runCycle(args);
    assert.equal(cycleOutput.cycleId, args.cycleInput.cycleId);
    assert.equal(cycleOutput.personas.length, 1);
    assert.equal(cycleOutput.pains.length, 1);
    assert.equal(cycleOutput.angles.length, 1);
    assert.equal(cycleOutput.formatDecisions.length, 1);
    assert.equal(cycleOutput.priorityCreativeCells.length, 1);
    assert.equal(cycleOutput.hypotheses.length, 1);
    assert.equal(cycleOutput.productionBriefs.length, 1);
    assert.equal(cycleOutput.strategyMap.length, 1);
    assert.equal(cycleOutput.strategyMap[0].persona, 'La Sensible a Estimulantes en Busca de Energía');
    assert.equal(saveResult.cycleId, args.cycleInput.cycleId);
    assert.equal(priorityRanking[0].status, 'PRIORITY_HYPOTHESIS_FOR_TESTING');
    assert.equal(cycleExists(args.cycleInput.cycleId), true);
  });
});

describe('B. Input inválido', () => {
  test('rechaza un CycleInput inválido (objective incorrecto) antes de tocar ninguna stage', () => {
    const args = validArgs();
    assert.throws(() => runCycle({ ...args, cycleInput: { ...args.cycleInput, objective: 'LANZAR_CAMPANA' } }), /objective/);
  });
});

describe('C. Evidence faltante', () => {
  test('un evidenceId citado por un candidato que no existe en el evidenceBatch detiene el ciclo en PersonaStage', () => {
    const args = validArgs();
    args.personaCandidates[0].verbatimEvidenceIds = ['ME-07', 'ME-08', 'ME-NO-EXISTE'];
    assert.throws(() => runCycle(args), (err) => err instanceof StageFailureError && err.stageName === 'PersonaStage');
  });
});

describe('D. Persona stage failure', () => {
  test('sin ningún personaCandidate válido, el ciclo se detiene en PersonaStage con contexto', () => {
    const args = validArgs();
    args.personaCandidates[0].verbatimEvidenceIds = ['ME-07']; // menos de 3, createPersona lo rechaza
    try {
      runCycle(args);
      assert.fail('debía lanzar StageFailureError');
    } catch (err) {
      assert.ok(err instanceof StageFailureError);
      assert.equal(err.stageName, 'PersonaStage');
      assert.ok(err.details.warnings.length > 0);
    }
  });
});

describe('E. Pain stage failure', () => {
  test('sin ningún painCandidate válido, el ciclo se detiene en PainStage', () => {
    const args = validArgs();
    args.painCandidates[0].supportingEvidenceIds = ['ME-NO-EXISTE'];
    assert.throws(() => runCycle(args), (err) => err instanceof StageFailureError && err.stageName === 'PainStage');
  });
});

describe('F. Angle stage failure', () => {
  test('sin ningún angleCandidate/emptyCellCandidate válido, el ciclo se detiene en AngleStage', () => {
    const args = validArgs();
    delete args.angleCandidates[0].painAnchor; // createAngle lo exige
    assert.throws(() => runCycle(args), (err) => err instanceof StageFailureError && err.stageName === 'AngleStage');
  });
});

describe('G. Format stage failure', () => {
  test('sin ningún formatCandidate válido, el ciclo se detiene en FormatStage', () => {
    const args = validArgs();
    args.formatCandidates[0].recommendedFormat = 'Formato que no está en la Format Library';
    assert.throws(() => runCycle(args), (err) => err instanceof StageFailureError && err.stageName === 'FormatStage');
  });
});

describe('H. Synthesis stage failure', () => {
  test('sin ningún cellCandidate válido, el ciclo se detiene en SynthesisStage', () => {
    const args = validArgs();
    args.cellCandidates[0].mechanism = ''; // createCreativeCell lo exige no vacío
    assert.throws(() => runCycle(args), (err) => err instanceof StageFailureError && err.stageName === 'SynthesisStage');
  });
});

describe('I. Persistence', () => {
  test('el CycleOutput queda escrito en disco tras runCycle', () => {
    const args = validArgs();
    const { saveResult } = runCycle(args);
    assert.ok(fs.existsSync(saveResult.path));
  });
});

describe('J. Recovery (subproceso real, sin memoria compartida)', () => {
  test('un ciclo producido por runCycle en este proceso se recupera con getCycle() desde un proceso de Node completamente distinto', () => {
    const args = validArgs();
    const { cycleOutput } = runCycle(args);

    const script = `
      import('${CYCLESTORE_MODULE_URL}').then(({ getCycle }) => {
        const cycle = getCycle(${JSON.stringify(cycleOutput.cycleId)});
        process.stdout.write(JSON.stringify({ cycleId: cycle.cycleId, personaCount: cycle.personas.length, cellCount: cycle.priorityCreativeCells.length }));
      });
    `;
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, CREATIVE_INTELLIGENCE_DATA_ROOT: TEST_DATA_ROOT },
      encoding: 'utf8',
    });
    const result = JSON.parse(stdout);
    assert.equal(result.cycleId, cycleOutput.cycleId);
    assert.equal(result.personaCount, 1);
    assert.equal(result.cellCount, 1);
  });
});

describe('K. Immutability', () => {
  test('correr runCycle dos veces con el mismo cycleId lanza en el segundo intento — nunca sobrescribe historia', () => {
    const args = validArgs();
    runCycle(args);
    assert.throws(() => runCycle(args), /inmutables/);
  });
});

describe('L. Provisional evidence', () => {
  test('con evidencia 100% MARKET_EVIDENCE, la Persona resultante queda PROVISIONAL — nunca CUSTOMER_VALIDATED/PROVEN', () => {
    const args = validArgs();
    const { cycleOutput } = runCycle(args);
    assert.equal(cycleOutput.personas[0].confidence, 'PROVISIONAL');
    assert.notEqual(cycleOutput.personas[0].confidence, 'CUSTOMER_VALIDATED');
  });
});

describe('M. Competitive evidence no convertida en customer evidence', () => {
  test('si un personaCandidate cita evidencia COMPETITIVE_EVIDENCE, el ciclo se detiene en PersonaStage en vez de aceptarla', () => {
    const args = validArgs({
      cycleInputOverrides: {
        evidenceBatch: [...validEvidenceBatch(), { domain: 'COMPETITIVE_EVIDENCE', records: [{ evidenceId: 'AR-06', competitor: 'Fuxion' }] }],
      },
    });
    args.personaCandidates[0].verbatimEvidenceIds = ['ME-07', 'ME-08', 'AR-06'];
    assert.throws(() => runCycle(args), (err) => err instanceof StageFailureError && err.stageName === 'PersonaStage' && err.details.warnings[0].reason.includes('COMPETITIVE_EVIDENCE'));
  });
});

describe('N. Ausencia de WINNER', () => {
  test('el CycleOutput completo, serializado, nunca contiene WINNER/VALIDATED/PROVEN', () => {
    const args = validArgs();
    const { cycleOutput } = runCycle(args);
    assert.doesNotMatch(JSON.stringify(cycleOutput), /\b(WINNER|VALIDATED|PROVEN)\b/i);
    assert.equal(cycleOutput.priorityCreativeCells[0].priority, 'candidate');
  });
});

describe('O. Broken traceability', () => {
  test('un formatRef/angleRef que no existe detiene el ciclo con contexto de la referencia rota', () => {
    const args = validArgs();
    args.formatCandidates[0].angleRef = 'Este angle no existe en absoluto';
    try {
      runCycle(args);
      assert.fail('debía lanzar StageFailureError');
    } catch (err) {
      assert.ok(err instanceof StageFailureError);
      assert.equal(err.stageName, 'FormatStage');
      assert.match(err.message, /relación rota/);
    }
  });
});

describe('P. Evidence snapshot reference', () => {
  test('el CycleOutput conserva evidenceSnapshotRef real, y ese snapshot es recuperable por separado', async () => {
    const args = validArgs();
    const { cycleOutput } = runCycle(args);
    assert.ok(cycleOutput.evidenceSnapshotRef.hash);
    const { getEvidenceSnapshot } = await import(CYCLESTORE_MODULE_URL);
    const snapshot = getEvidenceSnapshot(cycleOutput.evidenceSnapshotRef.hash);
    assert.deepEqual(snapshot.evidenceBatch, args.cycleInput.evidenceBatch);
  });
});

describe('Q. previousCycleId', () => {
  test('un CycleInput con previousCycleId se procesa sin error y queda registrado en warnings como CYCLE_LINEAGE', () => {
    const firstArgs = validArgs();
    const { cycleOutput: firstCycle } = runCycle(firstArgs);

    const secondArgs = validArgs({ cycleInputOverrides: { previousCycleId: firstCycle.cycleId } });
    const { cycleOutput: secondCycle } = runCycle(secondArgs);
    assert.ok(secondCycle.warnings.some((w) => w.type === 'CYCLE_LINEAGE' && w.previousCycleId === firstCycle.cycleId));
  });
});

describe('R. categoryScope', () => {
  test('un CycleInput con categoryScope se procesa sin error (no afecta la ejecución de las stages)', () => {
    const args = validArgs({ cycleInputOverrides: { categoryScope: ['energia'] } });
    const { cycleOutput } = runCycle(args);
    assert.equal(cycleOutput.personas.length, 1);
  });
});

describe('ORCHESTRATOR_REPRODUCIBILITY — evidencia equivalente al Lot 1', () => {
  test('dos corridas independientes con evidencia equivalente producen la misma estructura, relaciones, clasificación de evidencia, awareness, formato válido, tipo de CreativeCell/Hypothesis y guardrails — nunca los mismos ids/texto', () => {
    const runA = runCycle(validArgs());
    const runB = runCycle(validArgs());

    // Misma clasificación de evidencia.
    assert.equal(runA.cycleOutput.personas[0].confidence, runB.cycleOutput.personas[0].confidence);
    assert.equal(runA.cycleOutput.personas[0].evidenceType, runB.cycleOutput.personas[0].evidenceType);
    // Mismo awareness level.
    assert.equal(runA.cycleOutput.angles[0].awarenessStage, runB.cycleOutput.angles[0].awarenessStage);
    // Mismo formato válido (de la Format Library).
    assert.equal(runA.cycleOutput.formatDecisions[0].recommendedFormat, runB.cycleOutput.formatDecisions[0].recommendedFormat);
    // Mismo tipo de CreativeCell/Hypothesis (nunca WINNER, siempre 'HYPOTHESIS').
    assert.equal(runA.cycleOutput.hypotheses[0].type, 'HYPOTHESIS');
    assert.equal(runB.cycleOutput.hypotheses[0].type, 'HYPOTHESIS');
    assert.equal(runA.cycleOutput.priorityCreativeCells[0].priority, runB.cycleOutput.priorityCreativeCells[0].priority);
    // Mismos guardrails: ninguno de los dos ciclos puede contener WINNER.
    assert.doesNotMatch(JSON.stringify(runA.cycleOutput), /\bWINNER\b/i);
    assert.doesNotMatch(JSON.stringify(runB.cycleOutput), /\bWINNER\b/i);

    // REPRODUCTION DIFFERENCE esperada y documentada: los ids son randomUUID() nuevos en cada corrida.
    assert.notEqual(runA.cycleOutput.cycleId, runB.cycleOutput.cycleId);
    assert.notEqual(runA.cycleOutput.personas[0].personaId, runB.cycleOutput.personas[0].personaId);
  });
});

describe('Ciclo de evidencia 100% AFFILIATE_EVIDENCE (Fase: Ingesta del Affiliate Evidence Batch)', () => {
  test('runCycle() con personaCandidates/painCandidates omitidos se detiene en PersonaStage — nunca fabrica un candidato para poder continuar', () => {
    const cycleInput = createCycleInput({
      objective: 'PROCESS_NEW_EVIDENCE',
      evidenceBatch: [{
        domain: 'AFFILIATE_EVIDENCE',
        records: [{ evidenceId: 'AE-001', source: 'Facebook (página pública)', observedClaim: 'aumenta testosterona de forma natural', confidence: 'HIGH' }],
      }],
    });
    assert.throws(() => runCycle({ cycleInput }), /se requiere al menos 1 personaCandidate real/);
    // No debe haber quedado ningún ciclo persistido con este cycleId.
    assert.equal(cycleExists(cycleInput.cycleId), false);
  });

  test('el evidence snapshot de un lote 100% AFFILIATE_EVIDENCE sigue siendo guardable/recuperable de forma independiente, aunque el ciclo no pueda completarse', () => {
    const evidenceBatch = [{
      domain: 'AFFILIATE_EVIDENCE',
      records: [{ evidenceId: 'AE-002', source: 'Facebook (página pública)', observedClaim: 'tadalafil/pastilla azul', claimClassification: ['UNVERIFIED_CLAIM', 'COMPLIANCE_REVIEW_REQUIRED'] }],
    }];
    const ref = saveEvidenceSnapshot(evidenceBatch);
    const recovered = getEvidenceSnapshot(ref.hash);
    assert.equal(recovered.evidenceBatch[0].records[0].evidenceId, 'AE-002');
    assert.deepEqual(recovered.evidenceBatch[0].records[0].claimClassification, ['UNVERIFIED_CLAIM', 'COMPLIANCE_REVIEW_REQUIRED']);
  });
});

// ---------------------------------------------------------------------
// Fase 4A — Customer Evidence Contract: antes de esta fase,
// CYCLE_EVIDENCE_DOMAINS (cycleInput.schema.js) no incluía
// 'CUSTOMER_EVIDENCE' -- personaStage.js/painStage.js ya lo aceptaban,
// pero createCycleInput()/validateCycleInput() rechazaban el lote antes de
// que una stage lo viera nunca. Este bloque prueba el recorrido END-TO-END
// real (CustomerEvidence -> CycleInput -> evidenceIndex -> PersonaStage ->
// PainStage -> AngleStage -> FormatStage -> SynthesisStage -> CreativeCell
// -> persistido), no solo la validación de forma aislada (ya cubierta en
// cycleInputSchema.test.js) ni la stage aislada (ya cubierta en
// stagePersona.test.js/persona.test.js).
// ---------------------------------------------------------------------
describe('S. Customer Evidence end-to-end (Fase 4A — Customer Evidence Contract)', () => {
  function customerEvidenceArgs() {
    const cycleInput = createCycleInput({
      cycleId: `cycle-${randomUUID()}`,
      objective: 'GENERATE_CREATIVE_CELLS',
      evidenceBatch: [{
        domain: 'CUSTOMER_EVIDENCE',
        records: [
          { evidenceId: 'CE-END-01', verbatimQuote: 'lo compré hace 2 meses y de verdad se nota la diferencia', sourcePlatform: 'reseña real de cliente (WhatsApp postventa)' },
          { evidenceId: 'CE-END-02', verbatimQuote: 'ya llevo 3 pedidos, es lo único que me ha funcionado', sourcePlatform: 'reseña real de cliente (WhatsApp postventa)' },
          { evidenceId: 'CE-END-03', verbatimQuote: 'mi asesora me lo recomendó y sí cumplió lo que prometía', sourcePlatform: 'llamada de venta real (transcripción)' },
        ],
      }],
    });
    return {
      cycleInput,
      personaCandidates: [{
        name: 'La Clienta Confirmada Real', lifeSituation: 'Ya es clienta real de Vida Divina, con pedidos repetidos.',
        relationshipToProblem: 'Compró, usó el producto y confirma el resultado en sus propias palabras.',
        verbatimEvidenceIds: ['CE-END-01', 'CE-END-02', 'CE-END-03'],
        requestCustomerValidated: true,
      }],
      painCandidates: [{
        personaRef: 'La Clienta Confirmada Real',
        painPoint: 'Desconfianza previa por productos anteriores que no cumplieron', supportingEvidenceIds: ['CE-END-01', 'CE-END-02'],
      }],
      angleCandidates: [{
        personaRef: 'La Clienta Confirmada Real', painRef: 'Desconfianza previa por productos anteriores que no cumplieron', awarenessStage: 'Product Aware',
        angleText: 'Por qué esta vez sí funcionó, según quien ya lo compró',
        scriptDirection: 'Testimonio real, sin dramatizar.', painAnchor: 'Desconfianza previa por productos anteriores que no cumplieron',
      }],
      formatCandidates: [{
        angleRef: 'Por qué esta vez sí funcionó, según quien ya lo compró', recommendedFormat: 'POV personal story',
        justification: 'Evidencia real de cliente pide un formato de testimonio real.', whyBeatsDefault: 'Más creíble que un anuncio genérico.',
        structuralSignature: { narratorType: 'creator', sceneSetup: 'home', editRhythm: 'single-take' },
      }],
      cellCandidates: [{
        personaRef: 'La Clienta Confirmada Real', painRef: 'Desconfianza previa por productos anteriores que no cumplieron', angleRef: 'Por qué esta vez sí funcionó, según quien ya lo compró',
        awareness: 'Product Aware', mechanism: 'testimonio real de compra repetida',
        hypothesis: { targetPersona: 'La Clienta Confirmada Real', awareness: 'Product Aware', angle: 'Por qué esta vez sí funcionó, según quien ya lo compró', format: 'POV personal story', expectedOutcome: 'más confianza percibida — BASELINE_NOT_ESTABLISHED', mechanism: 'prueba social real' },
        productionBrief: { persona: 'La Clienta Confirmada Real', pain: 'Desconfianza previa por productos anteriores que no cumplieron', awareness: 'Product Aware', angle: 'Por qué esta vez sí funcionó, según quien ya lo compró', format: 'POV personal story', hookDirection: 'testimonio directo', mechanismEntry: 'MECHANISM_NOT_ESTABLISHED', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'creator', setting: 'home', runtime: '20-30s' },
        priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
      }],
    };
  }

  test('un evidenceBatch real 100% CUSTOMER_EVIDENCE ya no es rechazado por CycleInput (antes de Fase 4A, lanzaba "domain inválido")', () => {
    assert.doesNotThrow(() => customerEvidenceArgs());
  });

  test('runCycle() completo produce una Persona real con evidenceType CUSTOMER_EVIDENCE y confidence CUSTOMER_VALIDATED', () => {
    const args = customerEvidenceArgs();
    const { cycleOutput } = runCycle(args);
    assert.equal(cycleOutput.personas.length, 1);
    assert.equal(cycleOutput.personas[0].evidenceType, 'CUSTOMER_EVIDENCE');
    assert.equal(cycleOutput.personas[0].confidence, 'CUSTOMER_VALIDATED');
    assert.deepEqual([...cycleOutput.personas[0].evidenceIds], ['CE-END-01', 'CE-END-02', 'CE-END-03']);
    assert.equal(cycleOutput.priorityCreativeCells.length, 1);
    assert.equal(cycleExists(args.cycleInput.cycleId), true);
  });

  test('el mismo ciclo, persistido, se recupera igual desde disco (getCycle) con la evidencia real intacta', () => {
    const args = customerEvidenceArgs();
    const { saveResult } = runCycle(args);
    const recovered = getCycle(saveResult.cycleId);
    assert.equal(recovered.personas[0].evidenceType, 'CUSTOMER_EVIDENCE');
    assert.equal(recovered.personas[0].confidence, 'CUSTOMER_VALIDATED');
  });

  test('sin requestCustomerValidated, la misma evidencia CUSTOMER_EVIDENCE produce PROVISIONAL (nunca se otorga CUSTOMER_VALIDATED por defecto)', () => {
    const args = customerEvidenceArgs();
    args.personaCandidates[0].requestCustomerValidated = false;
    const { cycleOutput } = runCycle(args);
    assert.equal(cycleOutput.personas[0].evidenceType, 'CUSTOMER_EVIDENCE');
    assert.equal(cycleOutput.personas[0].confidence, 'PROVISIONAL');
  });

  test('un ciclo histórico 100% MARKET_EVIDENCE (fixture original de este archivo) sigue funcionando exactamente igual tras Fase 4A', () => {
    const args = validArgs();
    const { cycleOutput } = runCycle(args);
    assert.equal(cycleOutput.personas[0].evidenceType, 'MARKET_EVIDENCE');
    assert.equal(cycleOutput.personas[0].confidence, 'PROVISIONAL');
  });
});
