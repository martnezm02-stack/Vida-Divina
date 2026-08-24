import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildCampaignIntelligence } from '../src/campaignIntelligence.js';

describe('buildCampaignIntelligence — Fase 8', () => {
  test('siempre INSUFFICIENT_DATA -- campaignId no existe estructurado en este proyecto, nunca se infiere desde caption', () => {
    const result = buildCampaignIntelligence();
    assert.equal(result.insights.length, 0);
    assert.equal(result.dataQualitySignals.length, 1);
    assert.equal(result.dataQualitySignals[0].category, 'CAMPAIGN_PERFORMANCE');
    assert.equal(result.dataQualitySignals[0].reason, 'INSUFFICIENT_DATA');
    assert.match(result.dataQualitySignals[0].explanation, /campaignId/);
  });
});
