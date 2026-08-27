// visualTreatments.test.js — Creative Director (2026-08-27).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VISUAL_TREATMENTS, VISUAL_TREATMENT_IDS, assertValidVisualTreatment, assignVisualTreatment, batchTreatmentOrder,
} from '../src/visualTreatments.js';

describe('VISUAL_TREATMENTS — biblioteca real de tratamientos visuales', () => {
  test('expone al menos 10 tratamientos reales (Paso 2 del encargo)', () => {
    assert.ok(VISUAL_TREATMENT_IDS.length >= 10, `esperaba >= 10 tratamientos, hay ${VISUAL_TREATMENT_IDS.length}`);
  });

  test('cada tratamiento produce dirección visual real y distinta al menos en cameraDirection/lightingDirection/moodDirection', () => {
    const ctx = { audience: 'mujeres adultas que entrenan en gimnasio', territory: 'energía y bienestar' };
    const descriptions = VISUAL_TREATMENT_IDS.map((id) => VISUAL_TREATMENTS[id].describe(ctx));
    const cameraSet = new Set(descriptions.map((d) => d.cameraDirection));
    const lightingSet = new Set(descriptions.map((d) => d.lightingDirection));
    assert.ok(cameraSet.size > 1);
    assert.ok(lightingSet.size > 1);
    for (const d of descriptions) {
      assert.ok(d.subject?.trim().length > 0);
      assert.ok(d.environment?.trim().length > 0);
    }
  });

  test('assertValidVisualTreatment rechaza un id inválido', () => {
    assert.throws(() => assertValidVisualTreatment('NO_EXISTE'), /VisualTreatment válido/);
    for (const id of VISUAL_TREATMENT_IDS) assert.doesNotThrow(() => assertValidVisualTreatment(id));
  });
});

describe('batchTreatmentOrder / assignVisualTreatment — diversidad real entre variantes (Paso 3)', () => {
  test('dentro de un batch de 10 variantes reales, ningún tratamiento se repite (Paso 3, regla no negociable)', () => {
    const campaignIntent = { targetAudience: 'mujeres adultas que entrenan en gimnasio', campaignTerritory: 'energía y bienestar', problemOrNeed: 'falta de energía' };
    const asignados = Array.from({ length: 10 }, (_, i) => assignVisualTreatment({ variantIndex: i, campaignIntent, campaignId: 'campaign-real-1' }).id);
    assert.equal(new Set(asignados).size, 10, `esperaba 10 tratamientos únicos, obtuvo: ${asignados.join(', ')}`);
  });

  test('misma campaña real (mismo campaignId/brief) -> mismo orden real siempre (determinista, auditable)', () => {
    const campaignIntent = { targetAudience: 'hombres adultos', campaignTerritory: 'rendimiento físico', problemOrNeed: 'baja energía' };
    const orden1 = batchTreatmentOrder({ campaignIntent, campaignId: 'campaign-x' });
    const orden2 = batchTreatmentOrder({ campaignIntent, campaignId: 'campaign-x' });
    assert.deepEqual(orden1, orden2);
  });

  test('campaña relacionada con gimnasio real trae FITNESS_GYM al frente de la rotación (coherente con la campaña, Paso 3)', () => {
    const campaignIntent = { targetAudience: 'mujeres adultas', campaignTerritory: 'entrenar en el gimnasio con energía', problemOrNeed: 'falta de energía para entrenar' };
    const orden = batchTreatmentOrder({ campaignIntent, campaignId: 'campaign-gym' });
    assert.equal(orden[0], 'FITNESS_GYM');
  });

  test('assignVisualTreatment rechaza variantIndex inválido', () => {
    assert.throws(() => assignVisualTreatment({ variantIndex: -1 }), /variantIndex/);
    assert.throws(() => assignVisualTreatment({ variantIndex: 1.5 }), /variantIndex/);
  });

  test('sin campaignIntent real: sigue asignando un tratamiento real válido (nunca lanza)', () => {
    const t = assignVisualTreatment({ variantIndex: 0 });
    assert.ok(VISUAL_TREATMENT_IDS.includes(t.id));
  });
});
