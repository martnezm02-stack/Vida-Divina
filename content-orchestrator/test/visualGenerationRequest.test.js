// visualGenerationRequest.test.js — Creative Director (2026-08-27).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualGenerationRequest, resolveVisualGenerationRequest, VISUAL_GENERATION_REQUEST_STATUSES } from '../src/visualGenerationRequest.js';

const PROMPT_SPEC_REAL = Object.freeze({ subject: 'mujer entrenando en gimnasio', environment: 'gimnasio moderno' });

describe('buildVisualGenerationRequest', () => {
  test('construye un request PENDIENTE real con los campos del Paso 15 del encargo', () => {
    const req = buildVisualGenerationRequest({
      campaignId: 'c1', batchId: 'b1', creativeId: 'creative-1', sceneId: 'scene-1', visualTreatment: 'FITNESS_GYM', promptSpec: PROMPT_SPEC_REAL,
    });
    assert.equal(req.status, 'PENDING');
    assert.equal(req.provider, null);
    assert.equal(req.campaignId, 'c1');
    assert.equal(req.sceneId, 'scene-1');
    assert.equal(req.visualTreatment, 'FITNESS_GYM');
    assert.deepEqual(req.promptSpec, PROMPT_SPEC_REAL);
    assert.ok(req.requestId);
    assert.ok(req.fingerprint);
  });

  test('rechaza sin sceneId/visualTreatment/promptSpec real', () => {
    assert.throws(() => buildVisualGenerationRequest({ sceneId: '', visualTreatment: 'X', promptSpec: PROMPT_SPEC_REAL }), /sceneId/);
    assert.throws(() => buildVisualGenerationRequest({ sceneId: 's1', visualTreatment: '', promptSpec: PROMPT_SPEC_REAL }), /visualTreatment/);
    assert.throws(() => buildVisualGenerationRequest({ sceneId: 's1', visualTreatment: 'X', promptSpec: {} }), /promptSpec/);
  });

  test('mismo sceneId/visualTreatment/promptSpec real -> mismo fingerprint real (determinismo, Paso 15)', () => {
    const r1 = buildVisualGenerationRequest({ sceneId: 's1', visualTreatment: 'UGC', promptSpec: PROMPT_SPEC_REAL });
    const r2 = buildVisualGenerationRequest({ sceneId: 's1', visualTreatment: 'UGC', promptSpec: PROMPT_SPEC_REAL });
    assert.equal(r1.fingerprint, r2.fingerprint);
    assert.notEqual(r1.requestId, r2.requestId); // requestId siempre único -- fingerprint es lo determinista.
  });
});

describe('resolveVisualGenerationRequest — nunca simula (Paso 25 del encargo)', () => {
  test('resolución EXISTING_PRODUCT_ASSET real -> status RESOLVED_EXISTING_ASSET, costo 0', () => {
    const req = buildVisualGenerationRequest({ sceneId: 's1', visualTreatment: 'PRODUCT_HUMAN', promptSpec: PROMPT_SPEC_REAL });
    const resolved = resolveVisualGenerationRequest(req, {
      source: 'EXISTING_PRODUCT_ASSET', imageSourcePath: 'C:/assets/x.png', providerUsed: null, isMock: false,
    });
    assert.equal(resolved.status, 'RESOLVED_EXISTING_ASSET');
    assert.equal(resolved.provider, 'existing_asset');
    assert.equal(resolved.cost.estimated, 0);
    assert.equal(VISUAL_GENERATION_REQUEST_STATUSES.includes(resolved.status), true);
  });

  test('resolución GENERATED_IMAGE real de un provider real -> RESOLVED_GENERATED, provider/costo reales (nunca "AI_GENERATED" para un mock)', () => {
    const req = buildVisualGenerationRequest({ sceneId: 's2', visualTreatment: 'CINEMATIC', promptSpec: PROMPT_SPEC_REAL });
    const resolved = resolveVisualGenerationRequest(req, {
      source: 'GENERATED_IMAGE', imageSourcePath: 'C:/data/openai-abc.png', providerUsed: 'openai', isMock: false,
      cost: { estimatedCost: 0.02, actualCost: 0.018, currency: 'USD' },
    });
    assert.equal(resolved.status, 'RESOLVED_GENERATED');
    assert.equal(resolved.provider, 'openai');
    assert.equal(resolved.cost.estimated, 0.02);
    assert.equal(resolved.cost.actual, 0.018);
  });

  test('resolución TYPOGRAPHIC real -> RESOLVED_TYPOGRAPHIC, nunca se etiqueta como generación IA', () => {
    const req = buildVisualGenerationRequest({ sceneId: 's3', visualTreatment: 'EDUCATIONAL', promptSpec: PROMPT_SPEC_REAL });
    const resolved = resolveVisualGenerationRequest(req, { source: 'TYPOGRAPHIC', imageSourcePath: null, providerUsed: null, isMock: false });
    assert.equal(resolved.status, 'RESOLVED_TYPOGRAPHIC');
    assert.equal(resolved.provider, 'local_typographic');
    assert.notEqual(resolved.status, 'RESOLVED_GENERATED');
  });

  // Prompt Auditable (Corrección "Crear contenido", Paso 13/14 del
  // encargo: L/M del encargo).
  test('L/M: generatedPrompt real de la resolución se persiste TAL CUAL (nunca reconstruido desde promptSpec)', () => {
    const req = buildVisualGenerationRequest({ sceneId: 's6', visualTreatment: 'CINEMATIC', promptSpec: PROMPT_SPEC_REAL });
    const promptRealEnviado = 'mujer entrenando en gimnasio moderno. luz natural. plano medio.';
    const resolved = resolveVisualGenerationRequest(req, {
      source: 'GENERATED_IMAGE', imageSourcePath: 'C:/data/krea-xyz.png', providerUsed: 'krea-mcp', isMock: false,
      generatedPrompt: promptRealEnviado,
      cost: { estimatedCost: 0, actualCost: 0, currency: 'USD', costStatus: 'UNKNOWN' },
    });
    assert.equal(resolved.generatedPrompt, promptRealEnviado);
    assert.notEqual(resolved.generatedPrompt, JSON.stringify(req.promptSpec), 'nunca debe reconstruirse desde promptSpec -- debe ser el string real reportado por la resolución.');
  });

  test('sin generación real (EXISTING_PRODUCT_ASSET/TYPOGRAPHIC): generatedPrompt null real, nunca inventado', () => {
    const req = buildVisualGenerationRequest({ sceneId: 's7', visualTreatment: 'EDUCATIONAL', promptSpec: PROMPT_SPEC_REAL });
    const resolved = resolveVisualGenerationRequest(req, { source: 'TYPOGRAPHIC', imageSourcePath: null, providerUsed: null, isMock: false });
    assert.equal(resolved.generatedPrompt, null);
  });

  test('promptMode por defecto real es "system_generated" en el request PENDIENTE (Paso 16 del encargo)', () => {
    const req = buildVisualGenerationRequest({ sceneId: 's8', visualTreatment: 'UGC', promptSpec: PROMPT_SPEC_REAL });
    assert.equal(req.promptMode, 'system_generated');
  });

  test('rechaza sin request/resolution reales', () => {
    assert.throws(() => resolveVisualGenerationRequest(null, { source: 'TYPOGRAPHIC' }), /VisualGenerationRequest real/);
    const req = buildVisualGenerationRequest({ sceneId: 's4', visualTreatment: 'UGC', promptSpec: PROMPT_SPEC_REAL });
    assert.throws(() => resolveVisualGenerationRequest(req, null), /resolución real/);
  });

  test('nunca muta el request original (inmutable, mismo criterio que el resto del proyecto)', () => {
    const req = buildVisualGenerationRequest({ sceneId: 's5', visualTreatment: 'UGC', promptSpec: PROMPT_SPEC_REAL });
    resolveVisualGenerationRequest(req, { source: 'TYPOGRAPHIC', imageSourcePath: null, providerUsed: null, isMock: false });
    assert.equal(req.status, 'PENDING');
    assert.equal(req.provider, null);
  });
});
