// autonomousCreateStrategyContext.test.js — Fase 11 (Strategy-Aware
// Content Generation): verifica la integración ADITIVA/OPCIONAL de
// StrategyContext en buildCreativeProposal, sin duplicar la cobertura ya
// real de autonomousCreate.test.js (que sigue pasando sin cambios --
// compatibilidad hacia atrás verificada ahí).
//
// Fase 4B (Creative Gate Enforcement): los 2 ciclos reales persistidos en
// creative-intelligence/data/cycles/ tienen gateStatus.strategyAndBriefApproval
// = 'PENDING', así que TéDivina (usado originalmente aquí) ya no llega a
// PROPOSAL_READY -- y este archivo necesita específicamente el camino
// PROPOSAL_READY para poder probar platform/strategyContext (campos que
// solo existen en esa rama). Se usa el mismo patrón ya establecido en
// creative-intelligence/test/cycleOrchestrator.test.js /
// content-orchestrator/test/campaignModeGateEnforcement.test.js: un
// CREATIVE_INTELLIGENCE_DATA_ROOT temporal aislado con un ciclo sintético
// propio, APROBADO explícitamente -- nunca se marcó ningún ciclo real como
// APPROVED, nunca se tocaron los ciclos reales.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const CI_DATA_ROOT = mkdtempSync(join(tmpdir(), 'acsc-ci-data-'));
process.env.CREATIVE_INTELLIGENCE_DATA_ROOT = CI_DATA_ROOT;

// IMPORTANTE: import() dinámico, nunca "import ... from" estático -- un
// import estático se hoistea y se evalúa ANTES que la asignación de
// process.env de arriba, sin importar el orden textual en el archivo. Con
// import estático, cycleStore.js fijaría su DATA_ROOT al real de
// creative-intelligence/data/ antes de que el override tuviera efecto, y
// runCycle() habría escrito el ciclo sintético de este test ahí -- exactamente
// lo que esta fase prohíbe explícitamente. El import dinámico sí respeta el
// orden de ejecución real (mismo patrón ya usado en
// creative-intelligence/test/cycleOrchestrator.test.js y
// content-orchestrator/test/campaignModeGateEnforcement.test.js).
const { PerformanceLearningStore } = await import('../../performance-learning-intelligence/src/store.js');
const { createStrategyDecision } = await import('../../strategy-decision-engine/src/strategyDecision.js');
const { createStrategyFeedback } = await import('../../learning-strategy-engine/src/strategyFeedback.js');
const { buildCreativeProposal } = await import('../src/autonomousCreate.js');
const { runCycle } = await import('../../creative-intelligence/orchestrator/cycleOrchestrator.js');
const { createCycleInput } = await import('../../creative-intelligence/schemas/cycleInput.schema.js');

// Producto real del catálogo (docs/productos/) — mars-capsules. Se construye
// un ciclo sintético APROBADO cuya CreativeCell comparte palabras reales
// con sus hechos reales (problema: "Falta de libido en hombres.", beneficios:
// "...mejora la energía y resistencia; alternativa natural.") para que
// buildCreativeProposal llegue a PROPOSAL_READY de forma real, no fabricada.
const PRODUCT_ID = 'mars-capsules';

function seedApprovedCreativeCycle() {
  const cycleInput = createCycleInput({
    cycleId: `cycle-${randomUUID()}`,
    objective: 'GENERATE_CREATIVE_CELLS',
    evidenceBatch: [{
      domain: 'MARKET_EVIDENCE',
      records: [
        { evidenceId: 'ME-ACSC-01', verbatimQuote: 'busco una alternativa natural para tener más energía', sourcePlatform: 'foro-salud-real.example' },
        { evidenceId: 'ME-ACSC-02', verbatimQuote: 'quiero recuperar mi libido de forma natural', sourcePlatform: 'foro-salud-real.example' },
        { evidenceId: 'ME-ACSC-03', verbatimQuote: 'sin energía ni libido desde hace meses', sourcePlatform: 'foro-salud-real.example' },
      ],
    }],
  });
  runCycle({
    cycleInput,
    personaCandidates: [{
      name: 'Persona StrategyContext Test', lifeSituation: 'Busca recuperar libido y energía por vías naturales.',
      relationshipToProblem: 'Ya intentó varias soluciones sin resultado sostenido.',
      verbatimEvidenceIds: ['ME-ACSC-01', 'ME-ACSC-02', 'ME-ACSC-03'],
    }],
    painCandidates: [{
      personaRef: 'Persona StrategyContext Test', painPoint: 'Falta de libido y energía, busca alternativa natural', supportingEvidenceIds: ['ME-ACSC-01', 'ME-ACSC-02'],
    }],
    angleCandidates: [{
      personaRef: 'Persona StrategyContext Test', painRef: 'Falta de libido y energía, busca alternativa natural', awarenessStage: 'Problem Aware',
      angleText: 'Recuperar libido y energía de forma natural', scriptDirection: 'Explicación directa, sin claims médicos.',
      painAnchor: 'Falta de libido y energía, busca alternativa natural',
    }],
    formatCandidates: [{
      angleRef: 'Recuperar libido y energía de forma natural', recommendedFormat: 'Educational walk-and-talk',
      justification: 'Explica el mecanismo natural sin dramatizar.', whyBeatsDefault: 'Más creíble para este pain.',
      structuralSignature: { narratorType: 'expert', sceneSetup: 'studio', editRhythm: 'slow cut' },
    }],
    cellCandidates: [{
      personaRef: 'Persona StrategyContext Test', painRef: 'Falta de libido y energía, busca alternativa natural', angleRef: 'Recuperar libido y energía de forma natural',
      awareness: 'Problem Aware', mechanism: 'alternativa natural real para libido y energía',
      hypothesis: { targetPersona: 'Persona StrategyContext Test', awareness: 'Problem Aware', angle: 'Recuperar libido y energía de forma natural', format: 'Educational walk-and-talk', expectedOutcome: 'más identificación — BASELINE_NOT_ESTABLISHED', mechanism: 'nombrar el pain genera identificación' },
      productionBrief: { persona: 'Persona StrategyContext Test', pain: 'Falta de libido y energía, busca alternativa natural', awareness: 'Problem Aware', angle: 'Recuperar libido y energía de forma natural', format: 'Educational walk-and-talk', hookDirection: 'pregunta directa', mechanismEntry: 'MECHANISM_NOT_ESTABLISHED', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'expert', setting: 'studio', runtime: '20-30s' },
      priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
    }],
    gateStatus: { strategyAndBriefApproval: 'APPROVED' },
  });
}

function seedAcceptPlatform(store, platform) {
  const sf = createStrategyFeedback({
    learningId: 'lr-real', recommendation: 'x', rationale: 'Existe una señal para priorizar esta plataforma.',
    evidence: { scope: 'x', evidenceCount: 12 }, confidence: 'HIGH', affectedPlatform: platform, expectedDirection: 'IMPROVE',
  });
  store.save('strategy_feedback', sf);
  const d = createStrategyDecision({
    strategyFeedbackId: sf.id, decision: 'ACCEPT', decisionReason: 'La recomendación cumple evidencia mínima.',
    evidence: { reasonCode: 'EVIDENCE_SUFFICIENT' }, confidence: 'HIGH', evidenceCount: 12,
    scope: `${platform} (N=12)`, scopeType: 'PLATFORM', affectedPlatform: platform, expectedDirection: 'IMPROVE', expectedImpact: 'MEDIUM', risk: 'LOW',
  });
  store.save('strategy_decision', d);
  return d;
}

describe('buildCreativeProposal + StrategyContext — Fase 11 (aditivo, opcional)', () => {
  let dir, store;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'acsc-'));
    store = new PerformanceLearningStore(dir);
    seedApprovedCreativeCycle();
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(CI_DATA_ROOT, { recursive: true, force: true });
  });

  test('sin ACCEPT aplicable: comportamiento IDÉNTICO al original (platform=WHATSAPP_VIDEO por defecto)', async () => {
    const proposal = await buildCreativeProposal({ userIntent: 'Campaña de producto', productId: PRODUCT_ID, strategyStore: store });
    assert.equal(proposal.status, 'PROPOSAL_READY');
    assert.equal(proposal.platform, 'WHATSAPP_VIDEO');
    assert.equal(proposal.strategyContext.applied, false);
  });

  test('con ACCEPT real (instagram, PLATFORM) y sin plataforma mencionada en el texto -- el fallback usa el contexto estratégico, nunca sobrescribe texto explícito', async () => {
    const decision = seedAcceptPlatform(store, 'instagram');
    const proposal = await buildCreativeProposal({ userIntent: 'Campaña de producto', productId: PRODUCT_ID, strategyStore: store });
    assert.equal(proposal.platform, 'INSTAGRAM_REEL');
    assert.equal(proposal.strategyContext.applied, true);
    assert.deepEqual(proposal.strategyContext.strategyDecisionIds, [decision.id]);
    assert.equal(proposal.strategyContext.confidence, 'HIGH');
  });

  test('plataforma explícita en el userIntent SIEMPRE gana sobre StrategyContext (Fase 4/6: nunca amplía el alcance más allá de lo pedido)', async () => {
    const proposal = await buildCreativeProposal({ userIntent: 'Necesito contenido de Facebook para este producto', productId: PRODUCT_ID, strategyStore: store });
    assert.equal(proposal.platform, 'FACEBOOK_REEL'); // detectado explícitamente en el texto (detectarObjetivo) -- StrategyContext (instagram, sembrado arriba) nunca lo sobrescribe
  });

  test('sin strategyStore explícito (comportamiento por defecto, usa el store real) -- nunca lanza, siempre incluye el campo strategyContext', async () => {
    const proposal = await buildCreativeProposal({ userIntent: 'Campaña de producto', productId: PRODUCT_ID });
    assert.equal(proposal.status, 'PROPOSAL_READY');
    assert.ok('strategyContext' in proposal);
  });
});
