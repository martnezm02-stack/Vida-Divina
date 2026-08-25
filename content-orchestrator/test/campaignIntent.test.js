// campaignIntent.test.js — Creative Strategy Engine (2026-08-24).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCampaignIntent, computeCampaignId } from '../src/campaignIntent.js';

describe('buildCampaignIntent — validación real, nunca inventa el brief', () => {
  test('construye un CampaignIntent real con los campos mínimos', () => {
    const ci = buildCampaignIntent({
      productId: 'sculpt-black', targetAudience: 'hombres adultos', problemOrNeed: 'baja vitalidad y confianza',
    });
    assert.equal(ci.productId, 'sculpt-black');
    assert.equal(ci.targetAudience, 'hombres adultos');
    assert.equal(ci.problemOrNeed, 'baja vitalidad y confianza');
    assert.equal(ci.campaignTerritory, 'baja vitalidad y confianza'); // fallback real: sin territory explícito, usa problemOrNeed.
    assert.equal(ci.campaignObjective, 'awareness'); // default real.
    assert.equal(ci.awarenessStage, 'Problem Aware'); // default real.
  });

  test('sin productId lanza', () => {
    assert.throws(() => buildCampaignIntent({ targetAudience: 'x', problemOrNeed: 'y' }), /productId/);
  });

  test('sin targetAudience lanza -- nunca infiere audiencia', () => {
    assert.throws(() => buildCampaignIntent({ productId: 'p', problemOrNeed: 'y' }), /targetAudience/);
  });

  test('sin problemOrNeed lanza -- root cause real de esta fase (caer de vuelta a Product Knowledge)', () => {
    assert.throws(() => buildCampaignIntent({ productId: 'p', targetAudience: 'x' }), /problemOrNeed/);
  });

  test('campaignObjective inválido lanza', () => {
    assert.throws(() => buildCampaignIntent({
      productId: 'p', targetAudience: 'x', problemOrNeed: 'y', campaignObjective: 'INVENTADO',
    }));
  });

  test('awarenessStage inválido lanza', () => {
    assert.throws(() => buildCampaignIntent({
      productId: 'p', targetAudience: 'x', problemOrNeed: 'y', awarenessStage: 'INVENTADO',
    }));
  });

  test('un claim médico prohibido en el brief se rechaza -- "marca el conflicto", nunca genera nada', () => {
    assert.throws(
      () => buildCampaignIntent({ productId: 'p', targetAudience: 'hombres', problemOrNeed: 'el producto trata la disfunción eréctil' }),
      /CONFLICTO real/,
    );
  });

  test('territorio de audiencia/deseo (sin verbo de eficacia) SÍ se acepta -- territorio de marketing, no claim médico', () => {
    const ci = buildCampaignIntent({
      productId: 'p', targetAudience: 'hombres adultos', problemOrNeed: 'baja potencia sexual y confianza',
    });
    assert.equal(ci.problemOrNeed, 'baja potencia sexual y confianza');
  });
});

describe('computeCampaignId — identidad real y determinista', () => {
  test('mismo brief -> mismo campaignId siempre', () => {
    const ci1 = buildCampaignIntent({ productId: 'sculpt-black', targetAudience: 'hombres', problemOrNeed: 'vitalidad' });
    const ci2 = buildCampaignIntent({ productId: 'sculpt-black', targetAudience: 'HOMBRES', problemOrNeed: 'Vitalidad' });
    assert.equal(computeCampaignId(ci1), computeCampaignId(ci2)); // insensible a mayúsculas/minúsculas real.
  });

  test('brief distinto (mismo producto) -> campaignId distinto', () => {
    const ci1 = buildCampaignIntent({ productId: 'sculpt-black', targetAudience: 'hombres', problemOrNeed: 'vitalidad' });
    const ci2 = buildCampaignIntent({ productId: 'sculpt-black', targetAudience: 'mujeres', problemOrNeed: 'control de peso' });
    assert.notEqual(computeCampaignId(ci1), computeCampaignId(ci2));
  });

  test('campaignId siempre distinto del productId solo', () => {
    const ci = buildCampaignIntent({ productId: 'sculpt-black', targetAudience: 'hombres', problemOrNeed: 'vitalidad' });
    assert.notEqual(computeCampaignId(ci), 'sculpt-black');
    assert.ok(computeCampaignId(ci).startsWith('sculpt-black-'));
  });
});
