// strategyContextApi.test.js — Fase 11 (Strategy-Aware Content
// Generation), verificación de compatibilidad de API: POST
// /api/create/propose sigue funcionando igual, ahora con el campo
// strategyContext adicional (aditivo, nunca rompe consumidores existentes).
//
// Fase 4B (Creative Gate Enforcement): el ciclo real de TéDivina en
// creative-intelligence/data/cycles/ tiene gateStatus.strategyAndBriefApproval
// = 'PENDING' -- ya no llega a PROPOSAL_READY (correcto, ver
// content-orchestrator/test/campaignMode.test.js). El campo `strategyContext`
// solo existe en la rama PROPOSAL_READY, así que este test necesita ese
// camino real para verificar el contrato -- se construye un ciclo sintético
// propio, APROBADO explícitamente, en un CREATIVE_INTELLIGENCE_DATA_ROOT
// temporal aislado (mismo patrón ya usado en
// content-orchestrator/test/autonomousCreateStrategyContext.test.js /
// campaignModeGateEnforcement.test.js). Nunca se tocó ningún ciclo real ni
// se marcó ninguno como APPROVED.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

const CI_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'strategyctxapi-ci-data-'));
process.env.CREATIVE_INTELLIGENCE_DATA_ROOT = CI_DATA_ROOT;

// Producto real del catálogo — mars-capsules (problema: "Falta de libido en
// hombres.", beneficios: "...mejora la energía y resistencia; alternativa
// natural."). Import dinámico, en este orden, para que el override de
// CREATIVE_INTELLIGENCE_DATA_ROOT de arriba surta efecto antes de que
// cycleStore.js fije su DATA_ROOT (un import estático se hoistearía antes
// de la asignación de process.env, igual que en los otros archivos de esta
// fase).
const { runCycle } = await import('../../creative-intelligence/orchestrator/cycleOrchestrator.js');
const { createCycleInput } = await import('../../creative-intelligence/schemas/cycleInput.schema.js');
const PRODUCT_ID = 'mars-capsules';

function seedApprovedCreativeCycle() {
  const cycleInput = createCycleInput({
    cycleId: `cycle-${randomUUID()}`,
    objective: 'GENERATE_CREATIVE_CELLS',
    evidenceBatch: [{
      domain: 'MARKET_EVIDENCE',
      records: [
        { evidenceId: 'ME-SCAPI-01', verbatimQuote: 'busco una alternativa natural para tener más energía', sourcePlatform: 'foro-salud-real.example' },
        { evidenceId: 'ME-SCAPI-02', verbatimQuote: 'quiero recuperar mi libido de forma natural', sourcePlatform: 'foro-salud-real.example' },
        { evidenceId: 'ME-SCAPI-03', verbatimQuote: 'sin energía ni libido desde hace meses', sourcePlatform: 'foro-salud-real.example' },
      ],
    }],
  });
  runCycle({
    cycleInput,
    personaCandidates: [{
      name: 'Persona StrategyContextApi Test', lifeSituation: 'Busca recuperar libido y energía por vías naturales.',
      relationshipToProblem: 'Ya intentó varias soluciones sin resultado sostenido.',
      verbatimEvidenceIds: ['ME-SCAPI-01', 'ME-SCAPI-02', 'ME-SCAPI-03'],
    }],
    painCandidates: [{
      personaRef: 'Persona StrategyContextApi Test', painPoint: 'Falta de libido y energía, busca alternativa natural', supportingEvidenceIds: ['ME-SCAPI-01', 'ME-SCAPI-02'],
    }],
    angleCandidates: [{
      personaRef: 'Persona StrategyContextApi Test', painRef: 'Falta de libido y energía, busca alternativa natural', awarenessStage: 'Problem Aware',
      angleText: 'Recuperar libido y energía de forma natural', scriptDirection: 'Explicación directa, sin claims médicos.',
      painAnchor: 'Falta de libido y energía, busca alternativa natural',
    }],
    formatCandidates: [{
      angleRef: 'Recuperar libido y energía de forma natural', recommendedFormat: 'Educational walk-and-talk',
      justification: 'Explica el mecanismo natural sin dramatizar.', whyBeatsDefault: 'Más creíble para este pain.',
      structuralSignature: { narratorType: 'expert', sceneSetup: 'studio', editRhythm: 'slow cut' },
    }],
    cellCandidates: [{
      personaRef: 'Persona StrategyContextApi Test', painRef: 'Falta de libido y energía, busca alternativa natural', angleRef: 'Recuperar libido y energía de forma natural',
      awareness: 'Problem Aware', mechanism: 'alternativa natural real para libido y energía',
      hypothesis: { targetPersona: 'Persona StrategyContextApi Test', awareness: 'Problem Aware', angle: 'Recuperar libido y energía de forma natural', format: 'Educational walk-and-talk', expectedOutcome: 'más identificación — BASELINE_NOT_ESTABLISHED', mechanism: 'nombrar el pain genera identificación' },
      productionBrief: { persona: 'Persona StrategyContextApi Test', pain: 'Falta de libido y energía, busca alternativa natural', awareness: 'Problem Aware', angle: 'Recuperar libido y energía de forma natural', format: 'Educational walk-and-talk', hookDirection: 'pregunta directa', mechanismEntry: 'MECHANISM_NOT_ESTABLISHED', credibilityAnchorTiming: 'x', productRevealTiming: 'x', narrator: 'expert', setting: 'studio', runtime: '20-30s' },
      priorityCriteria: { painMatchesRealPain: true, personaIsUnderserved: true, structurallyDiverse: true, formatIsExecutable: true, isStrategicOpportunity: false },
    }],
    gateStatus: { strategyAndBriefApproval: 'APPROVED' },
  });
}
seedApprovedCreativeCycle();

const { server } = await import('../server/index.js');

let baseUrl;
before(() => new Promise((resolve, reject) => {
  if (server.listening) { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); return; }
  server.once('listening', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  server.once('error', reject);
}));
after(() => new Promise((resolve) => {
  server.close(() => resolve());
  server.closeAllConnections?.();
  fs.rmSync(CI_DATA_ROOT, { recursive: true, force: true });
}));

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('POST /api/create/propose — compatibilidad con StrategyContext (Fase 11)', () => {
  test('respuesta real incluye strategyContext, nunca rompe el contrato existente', async () => {
    const { status, body } = await post('/api/create/propose', { userIntent: 'Campaña de producto', productId: PRODUCT_ID });
    assert.equal(status, 200);
    assert.equal(body.status, 'PROPOSAL_READY');
    assert.ok('strategyContext' in body);
    assert.equal(typeof body.strategyContext.applied, 'boolean');
    assert.ok(body.product?.nombreComercial); // el resto del contrato sigue intacto
  });

  test('sin userIntent -- 400 real, sin publicar nada (comportamiento preexistente intacto)', async () => {
    const { status } = await post('/api/create/propose', {});
    assert.equal(status, 400);
  });
});
