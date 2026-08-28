// generationSettings.test.js — Creative Structure + Generation Settings
// (Paso 32 del encargo): recommendation, quality recommendation,
// model/quality compatibility, selectionMode, lineage, backward
// compatibility. Puro (no depende de credenciales reales de provider --
// qualityTierForModel/recommendGenerationQuality solo leen el catálogo
// real, nunca isConfigured()).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_TIERS, QUALITY_TIER_LABELS, qualityTierForModel, availableQualityTiersForModel,
  recommendGenerationQuality, buildQualitySelection, buildGenerationSettings,
} from '../src/generationSettings.js';

describe('qualityTierForModel / availableQualityTiersForModel — derivado real del costTier, nunca inventado', () => {
  test('cada modelo real del catálogo mapea a exactamente un QUALITY_TIER real', () => {
    assert.equal(qualityTierForModel('krea-2-turbo'), 'FAST');
    assert.equal(qualityTierForModel('krea-2-medium'), 'STANDARD');
    assert.equal(qualityTierForModel('krea-2-large'), 'HIGH');
    assert.equal(qualityTierForModel('runway-gen4'), 'PREMIUM');
    for (const id of ['krea-2-turbo', 'krea-2-medium', 'krea-2-large', 'runway-gen4', 'openai-gpt-image']) {
      const tiers = availableQualityTiersForModel(id);
      assert.equal(tiers.length, 1, `"${id}" debe soportar exactamente 1 nivel real -- no asumir que todos los modelos soportan todos los niveles.`);
      assert.ok(QUALITY_TIERS.includes(tiers[0]));
    }
  });
});

describe('recommendGenerationQuality — modelo y calidad son dos cosas distintas (Paso 10)', () => {
  test('sin modelo real, no hay calidad real que sugerir', () => {
    const rec = recommendGenerationQuality({ modelId: null });
    assert.equal(rec.recommendedQuality, null);
  });

  test('con un modelo real, recomienda la calidad real de ESE modelo (nunca mezcla modelo con calidad)', () => {
    const turbo = recommendGenerationQuality({ modelId: 'krea-2-turbo' });
    assert.equal(turbo.recommendedQuality, 'FAST');
    assert.match(turbo.recommendationReason, /Krea 2 Turbo/);

    const large = recommendGenerationQuality({ modelId: 'krea-2-large' });
    assert.equal(large.recommendedQuality, 'HIGH');
    assert.match(large.recommendationReason, /Krea 2 Large/);
  });
});

describe('buildQualitySelection — selectionMode + compatibilidad (Paso 13/14/26)', () => {
  test('sin selección real del usuario -> selectionMode "automatic", calidad recomendada tal cual', () => {
    const sel = buildQualitySelection({ finalModelId: 'krea-2-large', recommendedQuality: 'HIGH', recommendationReason: 'r' });
    assert.equal(sel.selectionMode, 'automatic');
    assert.equal(sel.selectedQuality, 'HIGH');
    assert.equal(sel.compatibilityFallback, null);
  });

  test('usuario selecciona una calidad real compatible con el modelo final -> "user_selected", respeta la selección (Paso 26)', () => {
    // krea-2-large solo soporta HIGH -- para probar una selección real
    // COMPATIBLE y distinta de la recomendada, usamos runway-gen4 (PREMIUM)
    // como modelo final y pedimos PREMIUM (su único nivel real).
    const sel = buildQualitySelection({ finalModelId: 'runway-gen4', recommendedQuality: 'HIGH', recommendationReason: 'r', selectedQuality: 'PREMIUM' });
    assert.equal(sel.selectionMode, 'user_selected');
    assert.equal(sel.selectedQuality, 'PREMIUM');
  });

  test('calidad seleccionada YA NO compatible con el modelo final -> cae a la mejor real compatible, nunca lanza (Paso 13)', () => {
    // krea-2-turbo solo soporta FAST -- pedir PREMIUM debe caer a FAST.
    const sel = buildQualitySelection({ finalModelId: 'krea-2-turbo', recommendedQuality: 'FAST', recommendationReason: 'r', selectedQuality: 'PREMIUM' });
    assert.equal(sel.selectionMode, 'automatic');
    assert.equal(sel.selectedQuality, 'FAST');
    assert.match(sel.compatibilityFallback, /no es compatible/);
  });
});

describe('buildGenerationSettings — un objeto real MODELO+CALIDAD, nunca un sistema paralelo (Paso 6)', () => {
  const krea2Large = Object.freeze({ id: 'krea-2-large', provider: 'krea-mcp', displayName: 'Krea 2 Large' });

  test('recomendación aceptada tal cual -> selectionMode/modelSelectionMode/qualitySelectionMode todos "automatic"', () => {
    const gs = buildGenerationSettings({
      mediaType: 'IMAGE', recommendedModel: krea2Large, recommendationReason: 'menor costo',
    });
    assert.equal(gs.mediaType, 'IMAGE');
    assert.equal(gs.selectedModel, 'krea-2-large');
    assert.equal(gs.recommendedQuality, 'HIGH');
    assert.equal(gs.selectedQuality, 'HIGH');
    assert.equal(gs.selectionMode, 'automatic');
    assert.equal(gs.modelSelectionMode, 'automatic');
    assert.equal(gs.qualitySelectionMode, 'automatic');
    assert.equal(gs.costStatus, 'UNKNOWN', 'Krea MCP no expone precio por llamada -- nunca se inventa un costo real.');
    assert.equal(gs.estimatedCost, 0);
  });

  test('mediaType distinto de IMAGE (VIDEO) -> sin modelo/calidad real, nunca modelos de imagen mostrados como si generaran video (Paso 24)', () => {
    const gs = buildGenerationSettings({ mediaType: 'VIDEO', recommendedModel: krea2Large, recommendationReason: 'r' });
    assert.equal(gs.mediaType, 'VIDEO');
    assert.equal(gs.recommendedModel, null);
    assert.equal(gs.selectedModel, null);
    assert.equal(gs.recommendedQuality, null);
    assert.equal(gs.costStatus, 'UNKNOWN');
  });

  test('lineage completo: recommendedProvider/recommendedModel/recommendedQuality/recommendationReason + selectedProvider/selectedModel/selectedQuality + selectionMode (Paso 15)', () => {
    const gs = buildGenerationSettings({ mediaType: 'IMAGE', recommendedModel: krea2Large, recommendationReason: 'menor costo' });
    for (const key of [
      'recommendedProvider', 'recommendedModel', 'recommendedQuality', 'recommendationReason',
      'selectedProvider', 'selectedModel', 'selectedQuality', 'selectionMode',
    ]) {
      assert.ok(key in gs, `generationSettings debe exponer "${key}" para lineage real.`);
    }
  });

  test('backward compatibility: sin recommendedModel real (ningún provider configurado) -> no lanza, campos null honestos', () => {
    const gs = buildGenerationSettings({ mediaType: 'IMAGE', recommendedModel: null, recommendationReason: 'Ningún modelo real disponible.' });
    assert.equal(gs.selectedModel, null);
    assert.equal(gs.recommendedQuality, null);
  });
});
