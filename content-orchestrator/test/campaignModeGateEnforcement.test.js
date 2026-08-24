// campaignModeGateEnforcement.test.js — Fase 4B (Creative Gate Enforcement).
// 100% local: usa un CREATIVE_INTELLIGENCE_DATA_ROOT temporal aislado (mismo
// patrón ya usado en creative-intelligence/test/cycleOrchestrator.test.js)
// para nunca leer/escribir sobre creative-intelligence/data/ real. Los 2
// ciclos reales persistidos ahí (te-divina, mars-capsules, etc.) tienen
// gateStatus.strategyAndBriefApproval='PENDING' -- eso ya se prueba con
// datos reales en content-orchestrator/test/campaignMode.test.js. Este
// archivo prueba el LADO POSITIVO del gate (una CreativeCell aprobada SÍ
// puede usarse) con ciclos sintéticos propios, porque no está permitido
// marcar los ciclos reales como APPROVED (regla explícita de esta fase).

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'campaignmode-gate-test-'));
process.env.CREATIVE_INTELLIGENCE_DATA_ROOT = TEST_DATA_ROOT;

const { runCycle } = await import('../../creative-intelligence/orchestrator/cycleOrchestrator.js');
const { createCycleInput } = await import('../../creative-intelligence/schemas/cycleInput.schema.js');
const { resolveCampaignCreativeCell, MissingStrategicMatchError, CreativeCellNotApprovedError, MIN_MATCH_SCORE } = await import('../src/campaignMode.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

// Producto real del catálogo (docs/productos/) — loadProductFacts() no usa
// CREATIVE_INTELLIGENCE_DATA_ROOT, siempre lee el catálogo real; se elige
// mars-capsules porque sus hechos reales (problema/beneficios) ya se
// conocen y permiten construir un candidato sintético con score real ≥
// MIN_MATCH_SCORE de forma determinista.
const PRODUCT_ID = 'mars-capsules';

/** Cycle sintético cuya CreativeCell comparte palabras reales con mars-capsules ("libido", "energía", "natural"). gateStatus configurable por el llamador. */
function buildCycleArgs({ personaName, gateStatus }) {
  const cycleInput = createCycleInput({
    cycleId: `cycle-${randomUUID()}`,
    objective: 'GENERATE_CREATIVE_CELLS',
    evidenceBatch: [{
      domain: 'MARKET_EVIDENCE',
      records: [
        { evidenceId: 'ME-GATE-01', verbatimQuote: 'busco una alternativa natural para tener más energía', sourcePlatform: 'foro-salud-real.example' },
        { evidenceId: 'ME-GATE-02', verbatimQuote: 'quiero recuperar mi libido de forma natural', sourcePlatform: 'foro-salud-real.example' },
        { evidenceId: 'ME-GATE-03', verbatimQuote: 'sin energía ni libido desde hace meses', sourcePlatform: 'foro-salud-real.example' },
      ],
    }],
  });
  return {
    cycleInput,
    personaCandidates: [{
      name: personaName, lifeSituation: 'Busca recuperar libido y energía por vías naturales.',
      relationshipToProblem: 'Ya intentó varias soluciones sin resultado sostenido.',
      verbatimEvidenceIds: ['ME-GATE-01', 'ME-GATE-02', 'ME-GATE-03'],
    }],
    painCandidates: [{
      personaRef: personaName, painPoint: 'Falta de libido y energía, busca alternativa natural', supportingEvidenceIds: ['ME-GATE-01', 'ME-GATE-02'],
    }],
    angleCandidates: [{
      personaRef: personaName, painRef: 'Falta de libido y energía, busca alternativa natural', awarenessStage: 'Problem Aware',
      angleText: 'Recuperar libido y energía de forma natural', scriptDirection: 'Explicación directa, sin claims médicos.',
      painAnchor: 'Falta de libido y energía, busca alternativa natural',
    }],
    formatCandidates: [{
      angleRef: 'Recuperar libido y energía de forma natural', recommendedFormat: 'Educational walk-and-talk',
      justification: 'Explica el mecanismo natural sin dramatizar.', whyBeatsDefault: 'Más creíble para este pain.',
      structuralSignature: { narratorType: 'expert', sceneSetup: 'studio', editRhythm: 'slow cut' },
    }],
    cellCandidates: [{
      personaRef: personaName, painRef: 'Falta de libido y energía, busca alternativa natural', angleRef: 'Recuperar libido y energía de forma natural',
      awareness: 'Problem Aware', mechanism: 'alternativa natural real para libido y energía',
      hypothesis: { targetPersona: personaName, awareness: 'Problem Aware', angle: 'Recuperar libido y energía de forma natural', format: 'Educational walk-and-talk', expectedOutcome: 'más identificación — BASELINE_NOT_ESTABLISHED', mechanism: 'nombrar el pain genera identificación' },
      productionBrief: { persona: personaName, pain: 'Falta de libido y energía, busca alternativa natural', awareness: 'Problem Aware', angle: 'Recuperar libido y energía de forma natural', format: 'Educational walk-and-talk', hookDirection: 'pregunta directa', mechanismEntry: 'MECHANISM_NOT_ESTABLISHED', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'expert', setting: 'studio', runtime: '20-30s' },
      priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
    }],
    gateStatus,
  };
}

describe('Fase 4B — Creative Gate Enforcement (ciclos sintéticos aislados)', () => {
  test('setup: el score real del candidato sintético contra mars-capsules alcanza el umbral (confirma que el test mide el gate, no el matcher)', () => {
    const args = buildCycleArgs({ personaName: 'Setup Check', gateStatus: { strategyAndBriefApproval: 'APPROVED' } });
    const { cycleOutput } = runCycle(args);
    assert.equal(cycleOutput.gateStatus.strategyAndBriefApproval, 'APPROVED');
    const resolved = resolveCampaignCreativeCell({ productId: PRODUCT_ID });
    assert.ok(resolved.matchScore >= MIN_MATCH_SCORE);
  });

  test('ciclo con gateStatus.strategyAndBriefApproval=PENDING: una CreativeCell con score suficiente NO se selecciona — MissingStrategicMatchError con gatedCandidate real', () => {
    const args = buildCycleArgs({ personaName: 'Persona Pendiente', gateStatus: { strategyAndBriefApproval: 'PENDING' } });
    const { cycleOutput } = runCycle(args);
    const pendingCellId = cycleOutput.priorityCreativeCells[0].creativeCellId;

    // Aislar: usar un product distinto sin ningún otro ciclo aprobado en este store para este test específico no es necesario --
    // basta con verificar candidatesTried/gatedCandidate reales para ESTE cycleId.
    let caught = null;
    try {
      resolveCampaignCreativeCell({ productId: PRODUCT_ID });
    } catch (err) {
      caught = err;
    }
    // Puede resolver exitosamente si ya existe un ciclo APROBADO previo en
    // el mismo store (test de "setup" arriba) -- lo relevante aquí es que
    // ESTE candidato pendiente aparezca correctamente marcado en
    // candidatesTried, nunca seleccionado como "mejor".
    if (caught) {
      assert.ok(caught instanceof MissingStrategicMatchError);
      const entry = caught.candidatesTried.find((c) => c.creativeCellId === pendingCellId);
      assert.equal(entry.strategyAndBriefApproval, 'PENDING');
    } else {
      const resolved = resolveCampaignCreativeCell({ productId: PRODUCT_ID });
      assert.notEqual(resolved.creativeCell.creativeCellId, pendingCellId, 'una CreativeCell PENDING nunca debe ganar la selección automática, aunque su score sea alto');
    }
  });

  test('preferredCreativeCellId apuntando a una CreativeCell real pero PENDING: CreativeCellNotApprovedError explícito (nunca "no existe")', () => {
    const args = buildCycleArgs({ personaName: 'Persona Preferida Pendiente', gateStatus: { strategyAndBriefApproval: 'PENDING' } });
    const { cycleOutput } = runCycle(args);
    const pendingCellId = cycleOutput.priorityCreativeCells[0].creativeCellId;

    assert.throws(
      () => resolveCampaignCreativeCell({ productId: PRODUCT_ID, preferredCreativeCellId: pendingCellId }),
      (err) => {
        assert.ok(err instanceof CreativeCellNotApprovedError);
        assert.equal(err.creativeCellId, pendingCellId);
        assert.equal(err.strategyAndBriefApproval, 'PENDING');
        return true;
      },
    );
  });

  test('preferredCreativeCellId apuntando a una CreativeCell real y APROBADA: se usa sin problema', () => {
    const args = buildCycleArgs({ personaName: 'Persona Preferida Aprobada', gateStatus: { strategyAndBriefApproval: 'APPROVED' } });
    const { cycleOutput } = runCycle(args);
    const approvedCellId = cycleOutput.priorityCreativeCells[0].creativeCellId;

    const resolved = resolveCampaignCreativeCell({ productId: PRODUCT_ID, preferredCreativeCellId: approvedCellId });
    assert.equal(resolved.creativeCell.creativeCellId, approvedCellId);
    assert.equal(resolved.strategyAndBriefApproval, 'APPROVED');
  });

  test('búsqueda automática (sin preferredCreativeCellId): con al menos 1 ciclo real APROBADO en el store, resolveCampaignCreativeCell tiene éxito y siempre reporta strategyAndBriefApproval=APPROVED', () => {
    const resolved = resolveCampaignCreativeCell({ productId: PRODUCT_ID });
    assert.equal(resolved.strategyAndBriefApproval, 'APPROVED');
    assert.ok(resolved.matchScore >= MIN_MATCH_SCORE);
  });
});

// Requisito 12 (Fase 4D): el enforcement de campaignMode.js debe interpretar
// correctamente AMBOS formatos de gate -- legado (string) ya probado arriba
// en todos los tests de esta suite; aquí se prueba explícitamente el
// formato NUEVO ({status, reviewedBy, reviewedAt}), en un producto propio
// para no interferir con los ciclos de los tests anteriores.
describe('Fase 4D — campaignMode gate enforcement con el formato NUEVO de gate', () => {
  const NEW_FORMAT_PRODUCT_ID = 'venus-capsules'; // problema real: "Falta de deseo, intimidad incómoda..."

  function buildNewFormatCycleArgs({ personaName, gateValue }) {
    const cycleInput = createCycleInput({
      cycleId: `cycle-${randomUUID()}`,
      objective: 'GENERATE_CREATIVE_CELLS',
      evidenceBatch: [{
        domain: 'MARKET_EVIDENCE',
        records: [
          { evidenceId: 'ME-NEWGATE-01', verbatimQuote: 'perdí el deseo y la intimidad se volvió incómoda', sourcePlatform: 'foro-salud-real.example' },
          { evidenceId: 'ME-NEWGATE-02', verbatimQuote: 'busco recuperar el deseo de forma saludable', sourcePlatform: 'foro-salud-real.example' },
          { evidenceId: 'ME-NEWGATE-03', verbatimQuote: 'la intimidad incómoda me tiene preocupada', sourcePlatform: 'foro-salud-real.example' },
        ],
      }],
    });
    return {
      cycleInput,
      personaCandidates: [{ name: personaName, lifeSituation: 'Busca recuperar el deseo e intimidad saludable.', relationshipToProblem: 'Ya intentó soluciones sin resultado sostenido.', verbatimEvidenceIds: ['ME-NEWGATE-01', 'ME-NEWGATE-02', 'ME-NEWGATE-03'] }],
      painCandidates: [{ personaRef: personaName, painPoint: 'Falta de deseo, intimidad incómoda', supportingEvidenceIds: ['ME-NEWGATE-01', 'ME-NEWGATE-02'] }],
      angleCandidates: [{ personaRef: personaName, painRef: 'Falta de deseo, intimidad incómoda', awarenessStage: 'Problem Aware', angleText: 'Recuperar el deseo e intimidad de forma saludable', scriptDirection: 'Explicación directa, sin claims médicos.', painAnchor: 'Falta de deseo, intimidad incómoda' }],
      formatCandidates: [{ angleRef: 'Recuperar el deseo e intimidad de forma saludable', recommendedFormat: 'Educational walk-and-talk', justification: 'x', whyBeatsDefault: 'x', structuralSignature: { narratorType: 'expert', sceneSetup: 'studio', editRhythm: 'slow cut' } }],
      cellCandidates: [{
        personaRef: personaName, painRef: 'Falta de deseo, intimidad incómoda', angleRef: 'Recuperar el deseo e intimidad de forma saludable',
        awareness: 'Problem Aware', mechanism: 'alternativa saludable real para el deseo e intimidad',
        hypothesis: { targetPersona: personaName, awareness: 'Problem Aware', angle: 'Recuperar el deseo e intimidad de forma saludable', format: 'Educational walk-and-talk', expectedOutcome: 'más identificación — BASELINE_NOT_ESTABLISHED', mechanism: 'x' },
        productionBrief: { persona: personaName, pain: 'Falta de deseo, intimidad incómoda', awareness: 'Problem Aware', angle: 'Recuperar el deseo e intimidad de forma saludable', format: 'Educational walk-and-talk', hookDirection: 'x', mechanismEntry: 'MECHANISM_NOT_ESTABLISHED', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'expert', setting: 'studio', runtime: '20-30s' },
        priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
      }],
      gateStatus: { strategyAndBriefApproval: gateValue },
    };
  }

  test('gate en formato NUEVO con status APPROVED (+ reviewedAt real) -- la CreativeCell SÍ se selecciona, igual que el formato legado', () => {
    const args = buildNewFormatCycleArgs({
      personaName: 'Persona Nuevo Formato Aprobada',
      gateValue: { status: 'APPROVED', reviewedAt: '2026-08-22T09:00:00.000Z', reviewedBy: 'revisor-real' },
    });
    const { cycleOutput } = runCycle(args);
    const approvedCellId = cycleOutput.priorityCreativeCells[0].creativeCellId;
    const resolved = resolveCampaignCreativeCell({ productId: NEW_FORMAT_PRODUCT_ID, preferredCreativeCellId: approvedCellId });
    assert.equal(resolved.creativeCell.creativeCellId, approvedCellId);
    assert.equal(resolved.strategyAndBriefApproval, 'APPROVED');
  });

  test('gate en formato NUEVO con status PENDING -- la CreativeCell NO se selecciona, igual que el formato legado (nunca sube a APPROVED por sí sola)', () => {
    const args = buildNewFormatCycleArgs({
      personaName: 'Persona Nuevo Formato Pendiente',
      gateValue: { status: 'PENDING' },
    });
    const { cycleOutput } = runCycle(args);
    const pendingCellId = cycleOutput.priorityCreativeCells[0].creativeCellId;
    assert.throws(
      () => resolveCampaignCreativeCell({ productId: NEW_FORMAT_PRODUCT_ID, preferredCreativeCellId: pendingCellId }),
      (err) => err instanceof CreativeCellNotApprovedError && err.strategyAndBriefApproval === 'PENDING',
    );
  });
});
