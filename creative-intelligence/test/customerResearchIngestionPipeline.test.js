// customerResearchIngestionPipeline.test.js — Fase 4C: prueba end-to-end
// del pipeline completo de ingestión real:
//
//   StructuredCustomerResearchSource (ingestión real, sin scraping/LLM)
//     -> .records (CustomerEvidenceRecord reales, con provenance)
//     -> evidenceBatch { domain: 'CUSTOMER_EVIDENCE' }
//     -> CycleInput -> evidenceIndex -> PersonaStage -> PainStage
//     -> AngleStage -> FormatStage -> SynthesisStage -> CreativeCell
//     -> persistido (cycleStore)
//
// Complementa (no duplica) creative-intelligence/test/cycleOrchestrator.test.js
// §S (Fase 4A, que construye evidenceBatch a mano) probando el camino real
// de INGESTIÓN vía la fuente de Fase 4C. 100% local: directorio temporal
// aislado (CREATIVE_INTELLIGENCE_DATA_ROOT), nunca toca creative-intelligence/data/ real.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-customer-ingestion-'));
process.env.CREATIVE_INTELLIGENCE_DATA_ROOT = TEST_DATA_ROOT;

const { runCycle } = await import('../orchestrator/cycleOrchestrator.js');
const { createCycleInput } = await import('../schemas/cycleInput.schema.js');
const { StructuredCustomerResearchSource } = await import('../src/sources/customerResearchSource.js');
const { createCustomerEvidenceRecord } = await import('../src/customerEvidenceRecord.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

function ingestRealCustomerEvidence() {
  // Evidencia real estructurada, ya "vetted" por un humano (simulado aquí
  // con datos de prueba explícitos, nunca generados por scraping/LLM) --
  // exactamente el tipo de input que StructuredCustomerResearchSource
  // espera recibir de una fuente controlada.
  const records = [
    createCustomerEvidenceRecord({ evidenceId: 'CE-PIPE-01', verbatimQuote: 'llevo dos semanas tomándolo y ya duermo mejor', sourcePlatform: 'reseña real (WhatsApp postventa)', sourceType: 'CUSTOMER_TESTIMONIAL', observedAt: '2026-08-18' }),
    createCustomerEvidenceRecord({ evidenceId: 'CE-PIPE-02', verbatimQuote: 'me costaba conciliar el sueño y esto sí me ayudó', sourcePlatform: 'reseña real (WhatsApp postventa)', sourceType: 'CUSTOMER_TESTIMONIAL', observedAt: '2026-08-19' }),
    createCustomerEvidenceRecord({ evidenceId: 'CE-PIPE-03', verbatimQuote: 'mi asesora me lo recomendó para dormir y funcionó', sourcePlatform: 'llamada de venta real (transcripción)', sourceType: 'SALES_CALL_TRANSCRIPT', observedAt: '2026-08-20' }),
  ];
  return new StructuredCustomerResearchSource(records);
}

function buildCycleArgsFromSource(source, { requestCustomerValidated }) {
  const cycleInput = createCycleInput({
    cycleId: `cycle-${randomUUID()}`,
    objective: 'GENERATE_CREATIVE_CELLS',
    evidenceBatch: [{ domain: 'CUSTOMER_EVIDENCE', records: [...source.records] }],
  });
  return {
    cycleInput,
    personaCandidates: [{
      name: 'Persona Ingestion Pipeline Test', lifeSituation: 'Ya es clienta real, confirma el resultado en sus propias palabras.',
      relationshipToProblem: 'Compró, usó el producto y reporta el efecto real.',
      verbatimEvidenceIds: source.records.map((r) => r.evidenceId),
      requestCustomerValidated,
    }],
    painCandidates: [{
      personaRef: 'Persona Ingestion Pipeline Test', painPoint: 'Dificultad real para dormir bien', supportingEvidenceIds: [source.records[0].evidenceId, source.records[1].evidenceId],
    }],
    angleCandidates: [{
      personaRef: 'Persona Ingestion Pipeline Test', painRef: 'Dificultad real para dormir bien', awarenessStage: 'Product Aware',
      angleText: 'Por qué sí ayudó a dormir mejor, según quien ya lo probó', scriptDirection: 'Testimonio real, sin dramatizar.',
      painAnchor: 'Dificultad real para dormir bien',
    }],
    formatCandidates: [{
      angleRef: 'Por qué sí ayudó a dormir mejor, según quien ya lo probó', recommendedFormat: 'POV personal story',
      justification: 'Evidencia real de cliente pide un formato de testimonio real.', whyBeatsDefault: 'Más creíble que un anuncio genérico.',
      structuralSignature: { narratorType: 'creator', sceneSetup: 'home', editRhythm: 'single-take' },
    }],
    cellCandidates: [{
      personaRef: 'Persona Ingestion Pipeline Test', painRef: 'Dificultad real para dormir bien', angleRef: 'Por qué sí ayudó a dormir mejor, según quien ya lo probó',
      awareness: 'Product Aware', mechanism: 'testimonio real de mejora del sueño',
      hypothesis: { targetPersona: 'Persona Ingestion Pipeline Test', awareness: 'Product Aware', angle: 'Por qué sí ayudó a dormir mejor, según quien ya lo probó', format: 'POV personal story', expectedOutcome: 'más confianza percibida — BASELINE_NOT_ESTABLISHED', mechanism: 'prueba social real' },
      productionBrief: { persona: 'Persona Ingestion Pipeline Test', pain: 'Dificultad real para dormir bien', awareness: 'Product Aware', angle: 'Por qué sí ayudó a dormir mejor, según quien ya lo probó', format: 'POV personal story', hookDirection: 'testimonio directo', mechanismEntry: 'MECHANISM_NOT_ESTABLISHED', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'creator', setting: 'home', runtime: '20-30s' },
      priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
    }],
    gateStatus: { strategyAndBriefApproval: 'PENDING' }, // Fase 4C nunca aprueba nada automáticamente -- sigue requiriendo revisión humana (Fase 4B).
  };
}

describe('Requisito 6/7: evidencia real ingerida vía StructuredCustomerResearchSource entra a PersonaStage y produce un CreativeCell real', () => {
  test('el pipeline completo corre de punta a punta con evidencia CUSTOMER_EVIDENCE real ingerida (no escrita a mano en el test)', () => {
    const source = ingestRealCustomerEvidence();
    const args = buildCycleArgsFromSource(source, { requestCustomerValidated: false });
    const { cycleOutput } = runCycle(args);
    assert.equal(cycleOutput.personas.length, 1);
    assert.equal(cycleOutput.personas[0].evidenceType, 'CUSTOMER_EVIDENCE');
    assert.deepEqual([...cycleOutput.personas[0].evidenceIds], ['CE-PIPE-01', 'CE-PIPE-02', 'CE-PIPE-03']);
    assert.equal(cycleOutput.priorityCreativeCells.length, 1);
    // El gate de Fase 4B sigue exigiendo aprobación humana explícita -- este
    // ciclo queda PENDING, ninguna Persona/CreativeCell se marca lista para
    // producción solo porque la ingestión de evidencia funcionó.
    assert.equal(cycleOutput.gateStatus.strategyAndBriefApproval, 'PENDING');
  });

  test('CUSTOMER_EVIDENCE permanece diferenciado de MARKET_EVIDENCE incluso viniendo de la fuente real (Requisito 6)', () => {
    const source = ingestRealCustomerEvidence();
    const args = buildCycleArgsFromSource(source, { requestCustomerValidated: false });
    const { cycleOutput } = runCycle(args);
    assert.notEqual(cycleOutput.personas[0].evidenceType, 'MARKET_EVIDENCE');
    assert.equal(cycleOutput.personas[0].evidenceType, 'CUSTOMER_EVIDENCE');
  });
});

describe('Requisito 8: CUSTOMER_VALIDATED sigue requiriendo CUSTOMER_EVIDENCE + solicitud explícita, incluso con la fuente real', () => {
  test('sin requestCustomerValidated -- PROVISIONAL, nunca CUSTOMER_VALIDATED por defecto', () => {
    const source = ingestRealCustomerEvidence();
    const args = buildCycleArgsFromSource(source, { requestCustomerValidated: false });
    const { cycleOutput } = runCycle(args);
    assert.equal(cycleOutput.personas[0].confidence, 'PROVISIONAL');
  });

  test('con requestCustomerValidated:true y evidencia 100% CUSTOMER_EVIDENCE real -- CUSTOMER_VALIDATED', () => {
    const source = ingestRealCustomerEvidence();
    const args = buildCycleArgsFromSource(source, { requestCustomerValidated: true });
    const { cycleOutput } = runCycle(args);
    assert.equal(cycleOutput.personas[0].confidence, 'CUSTOMER_VALIDATED');
  });
});

describe('Requisito 10: compatibilidad con ciclos históricos (100% MARKET_EVIDENCE) tras Fase 4C', () => {
  test('un ciclo 100% MARKET_EVIDENCE, sin ninguna fuente de Fase 4C, sigue funcionando idéntico', () => {
    const cycleInput = createCycleInput({
      cycleId: `cycle-${randomUUID()}`,
      objective: 'GENERATE_CREATIVE_CELLS',
      evidenceBatch: [{
        domain: 'MARKET_EVIDENCE',
        records: [
          { evidenceId: 'ME-PIPE-01', verbatimQuote: 'no logro dormir bien desde hace meses', sourcePlatform: 'foro-salud-real.example' },
          { evidenceId: 'ME-PIPE-02', verbatimQuote: 'probé de todo para dormir y nada funciona', sourcePlatform: 'foro-salud-real.example' },
          { evidenceId: 'ME-PIPE-03', verbatimQuote: 'el insomnio ya me tiene agotada', sourcePlatform: 'foro-salud-real.example' },
        ],
      }],
    });
    const { cycleOutput } = runCycle({
      cycleInput,
      personaCandidates: [{ name: 'Persona Histórica Market Evidence', lifeSituation: 'Sufre insomnio crónico.', relationshipToProblem: 'Ya intentó varias soluciones sin éxito.', verbatimEvidenceIds: ['ME-PIPE-01', 'ME-PIPE-02', 'ME-PIPE-03'] }],
      painCandidates: [{ personaRef: 'Persona Histórica Market Evidence', painPoint: 'Insomnio crónico agotador', supportingEvidenceIds: ['ME-PIPE-01', 'ME-PIPE-02'] }],
      angleCandidates: [{ personaRef: 'Persona Histórica Market Evidence', painRef: 'Insomnio crónico agotador', awarenessStage: 'Problem Aware', angleText: 'Por qué el insomnio no se resuelve solo', scriptDirection: 'Explicación educativa.', painAnchor: 'Insomnio crónico agotador' }],
      formatCandidates: [{ angleRef: 'Por qué el insomnio no se resuelve solo', recommendedFormat: 'Educational walk-and-talk', justification: 'x', whyBeatsDefault: 'x', structuralSignature: { narratorType: 'expert', sceneSetup: 'studio', editRhythm: 'slow cut' } }],
      cellCandidates: [{
        personaRef: 'Persona Histórica Market Evidence', painRef: 'Insomnio crónico agotador', angleRef: 'Por qué el insomnio no se resuelve solo',
        awareness: 'Problem Aware', mechanism: 'nombrar el pain genera identificación',
        hypothesis: { targetPersona: 'Persona Histórica Market Evidence', awareness: 'Problem Aware', angle: 'Por qué el insomnio no se resuelve solo', format: 'Educational walk-and-talk', expectedOutcome: 'más identificación — BASELINE_NOT_ESTABLISHED', mechanism: 'x' },
        productionBrief: { persona: 'Persona Histórica Market Evidence', pain: 'Insomnio crónico agotador', awareness: 'Problem Aware', angle: 'Por qué el insomnio no se resuelve solo', format: 'Educational walk-and-talk', hookDirection: 'x', mechanismEntry: 'MECHANISM_NOT_ESTABLISHED', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'expert', setting: 'studio', runtime: '20-30s' },
        priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
      }],
    });
    assert.equal(cycleOutput.personas[0].evidenceType, 'MARKET_EVIDENCE');
    assert.equal(cycleOutput.personas[0].confidence, 'PROVISIONAL');
  });
});
