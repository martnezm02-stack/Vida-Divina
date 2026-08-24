import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDirectInstructionForContentRequest } from '../src/directInstructionAdapter.js';
import { parseContentRequest } from '../src/contentRequest.js';

function reqDireto(overrides = {}) {
  return parseContentRequest({
    rawText: 'Usa esta fotografía real de Té Divina y mi voz oficial. Haz un Reel vertical de 20 segundos con CTA a WhatsApp.',
    contentType: 'VIDEO_REEL',
    forcedMode: 'DIRECT_INSTRUCTION_MODE',
    explicitFields: {
      voiceoverText: 'TéDivina, parte del catálogo de productos de Vida Divina.',
      cta: 'Escríbenos por WhatsApp para conocer más.',
      visualAssets: [{ assetId: 'abc123', sourcePath: 'x.jpeg' }],
      ...overrides,
    },
  });
}

describe('resolveDirectInstructionForContentRequest — reutiliza directInstructionMode.js real', () => {
  test('produce un ProductionBrief real con el modo, duración y CTA correctos', () => {
    const brief = resolveDirectInstructionForContentRequest({ contentRequest: reqDireto() });
    assert.equal(brief.mode, 'DIRECT_INSTRUCTION');
    assert.equal(brief.durationSeconds, 20);
    assert.equal(brief.cta, 'Escríbenos por WhatsApp para conocer más.');
    assert.equal(brief.voiceoverText, 'TéDivina, parte del catálogo de productos de Vida Divina.');
  });

  test('rechaza un ContentRequest que no está en DIRECT_INSTRUCTION_MODE', () => {
    const campaignReq = parseContentRequest({ rawText: 'campaña de Té Divina para Instagram', contentType: 'CAMPAIGN' });
    assert.throws(() => resolveDirectInstructionForContentRequest({ contentRequest: campaignReq }), /no DIRECT_INSTRUCTION_MODE/);
  });

  test('aplica el guard de claims prohibidos (Parte 8) incluso en modo directo', () => {
    const req = reqDireto({ voiceoverText: 'Este té trata el estreñimiento y garantiza resultados.' });
    assert.throws(() => resolveDirectInstructionForContentRequest({ contentRequest: req }), /claim prohibido/);
  });

  test('aplica el Brand Visual System (Parte 6) incluso en modo directo', () => {
    const req = reqDireto({ cta: 'Escríbenos por WhatsApp, fondo neón brillante garantizado.' });
    assert.throws(() => resolveDirectInstructionForContentRequest({ contentRequest: req }), /Brand Visual System/);
  });

  test('texto legítimo real (desintoxicación/tratamiento) sigue pasando ambos guards', () => {
    const req = reqDireto({ voiceoverText: 'TéDivina promueve la desintoxicación natural. No es un tratamiento médico.' });
    assert.doesNotThrow(() => resolveDirectInstructionForContentRequest({ contentRequest: req }));
  });
});
