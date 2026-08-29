// generation.proposeDirect.test.js — Corrección integral "Crear
// contenido" (2026-08-28): cobertura real de POST /api/create/propose-direct
// -- Media Type (Paso 1/2: A/B/C/D del encargo) y coherencia de
// hook/cta/instrucción (Paso 3/4: E/G del encargo). Servidor real, puerto
// efímero, mismo patrón que videoWorkspace.test.js -- nunca mockea
// hypothesisCreativeEngine.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = '0';
delete process.env.DASHBOARD_NO_LISTEN;

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
}));

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

const STATIC_FORMAT = 'Static comparison frames';

describe('POST /api/create/propose-direct — Media Type (Paso 1/2 del encargo)', () => {
  test('A/D: instrucción real con intención de video -> mediaType "VIDEO" en la respuesta', async () => {
    const { status, body } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Quiero un video corto de una persona entrenando en el gimnasio.',
    });
    assert.equal(status, 200);
    assert.ok(body.batchId, `se esperaba un batchId real, recibido: ${JSON.stringify(body)}`);
    assert.equal(body.mediaType, 'VIDEO');
  });

  test('B: la variante propuesta NUNCA cae en un formato estático real (incompatible con Video Script) -- repetido varias veces, nunca un solo acierto por azar', async () => {
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { status, body } = await post('/api/create/propose-direct', {
        productId: 'ripped-capsules', rawText: `Instrucción de prueba real número ${i} sobre rutina diaria.`,
      });
      assert.equal(status, 200);
      assert.ok(body.batchId, `intento ${i}: se esperaba batchId real, recibido: ${JSON.stringify(body)}`);
      assert.notEqual(body.creativeVariant.creativeVariant.format, STATIC_FORMAT, `intento ${i}: la variante propuesta cayó en formato estático real`);
    }
  });

  test('C: el formato real de la variante propuesta sigue siendo aplicable a Video Script (nunca aplicable:false por formato estático)', async () => {
    const { body: proposal } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Video real mostrando el uso diario del producto.',
    });
    assert.ok(proposal.batchId);
    const { status, body: script } = await post('/api/video-script', {
      hook: proposal.creativeVariant.copy.hook,
      bodyLines: proposal.creativeVariant.copy.bodyLines,
      sectionsUsed: proposal.creativeVariant.copy.sectionsUsed,
      cta: proposal.creativeVariant.copy.cta,
      format: proposal.creativeVariant.creativeVariant.format,
      copyStyle: proposal.creativeVariant.copyStyle,
    });
    assert.equal(status, 200);
    assert.equal(script.applicable, true, `Video Script no aplicable para el formato real propuesto: ${JSON.stringify(script)}`);
  });
});

describe('POST /api/create/propose-direct — coherencia con la instrucción (Paso 3/4 del encargo)', () => {
  test('E/G: hookText/ctaText literales del usuario sobrescriben el copy generado (fuente de verdad real, nunca ignorados en silencio)', async () => {
    const { status, body } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules',
      rawText: 'Mujer adulta entrenando en un gimnasio moderno.',
      hookText: 'Hook literal real de prueba, único y reconocible.',
      ctaText: 'CTA literal real de prueba, único y reconocible.',
    });
    assert.equal(status, 200);
    assert.equal(body.creativeVariant.copy.hook, 'Hook literal real de prueba, único y reconocible.');
    assert.equal(body.creativeVariant.copy.cta, 'CTA literal real de prueba, único y reconocible.');
  });

  test('cada llamada real genera una propuesta NUEVA (nunca memoiza/reutiliza un batch anterior entre llamadas distintas)', async () => {
    const first = await post('/api/create/propose-direct', { productId: 'ripped-capsules', rawText: 'Primera instrucción real de prueba.' });
    const second = await post('/api/create/propose-direct', { productId: 'ripped-capsules', rawText: 'Segunda instrucción real de prueba, distinta.' });
    assert.notEqual(first.body.batchId, second.body.batchId);
  });

  test('Creative Angle real (Corrección "Evolución integral del Creative Director"): la respuesta real expone primaryAngle/hookType/hookRelevanceScore reales del cableado HTTP (la selección determinista en sí ya está cubierta en content-orchestrator/test/creativeAngleSelector.test.js, aislada de estado de campaña compartido)', async () => {
    const { status, body } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules',
      rawText: 'Un hombre en una mañana normal, antes del trabajo, como una historia de estilo de vida real, natural.',
    });
    assert.equal(status, 200);
    assert.ok(body.primaryAngle?.id, `se esperaba primaryAngle real en la respuesta, recibido: ${JSON.stringify(body).slice(0, 300)}`);
    assert.ok(body.hookType?.id, 'se esperaba hookType real en la respuesta');
    assert.equal(typeof body.hookRelevanceScore, 'number', 'hookRelevanceScore real debe ser un número real');
  });
});

describe('GET /api/create/structure-recommendation + /api/create/model-recommendation -- Visual Continuity Context (Paso 8 del encargo)', () => {
  test('I: la vista previa de modelo/calidad expone visualContinuityContext real cuando la instrucción trae sujeto/entorno', async () => {
    const { body: proposal } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Mujer adulta entrenando en un gimnasio moderno, usando el producto.',
    });
    assert.ok(proposal.batchId);
    const { status, body } = await get(`/api/create/model-recommendation?batchId=${proposal.batchId}&variantIndex=0&userInstruction=${encodeURIComponent('Mujer adulta entrenando en un gimnasio moderno, usando el producto.')}`);
    assert.equal(status, 200);
    assert.equal(body.visualContinuityContext.subjectGender, 'female');
    assert.equal(body.visualContinuityContext.environment, 'gimnasio moderno');
  });

  test('S: sin userInstruction (backward compatibility), model-recommendation sigue funcionando igual que antes -- visualContinuityContext vacío, nunca rompe', async () => {
    const { body: proposal } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Instrucción neutra sin sujeto ni entorno mencionado.',
    });
    assert.ok(proposal.batchId);
    const { status, body } = await get(`/api/create/model-recommendation?batchId=${proposal.batchId}&variantIndex=0`);
    assert.equal(status, 200);
    assert.equal(body.visualContinuityContext.subjectGender, null);
    assert.ok(body.recommendedModel !== undefined);
  });
});

describe('POST /api/create/propose-direct — Auto-QA global (Corrección "Cierre del Creative Director")', () => {
  test('creativeQualityScore/creativeQualityStatus reales presentes en la respuesta', async () => {
    const { status, body } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Mujer adulta entrenando en un gimnasio moderno, con energía y enfoque.',
    });
    assert.equal(status, 200);
    assert.equal(typeof body.creativeQualityScore, 'number');
    assert.ok(['ACCEPTED', 'LOW_CONFIDENCE'].includes(body.creativeQualityStatus));
  });

  test('hookText real (edición manual): hookMode real "user_edited", creativeQualityScore real refleja el texto real editado (nunca el candidato descartado)', async () => {
    const HOOK_EDITADO_REAL = 'Este es un hook real editado a mano, único y reconocible en esta corrida.';
    const { status, body } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Mujer adulta entrenando en un gimnasio moderno.', hookText: HOOK_EDITADO_REAL,
    });
    assert.equal(status, 200);
    assert.equal(body.hookMode, 'user_edited');
    assert.equal(body.creativeVariant.copy.hook, HOOK_EDITADO_REAL, 'el hook real editado por el usuario NUNCA se sobrescribe');
    assert.ok(body.hookOriginal?.length > 0, 'hookOriginal real (el sugerido antes de editar) se preserva para trazabilidad real');
  });

  test('PROPAGACIÓN real (Paso 17/22 del encargo): hookText editado real actualiza script[0]/voiceover[0] real, nunca solo copy.hook', async () => {
    const HOOK_EDITADO_REAL = 'Otro hook real editado a mano, distinto y reconocible.';
    const { body } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Mujer adulta entrenando en un gimnasio moderno.', hookText: HOOK_EDITADO_REAL,
    });
    assert.equal(body.creativeVariant.copy.script?.[0], HOOK_EDITADO_REAL, 'script[0] real debe ser el hook real editado');
    assert.equal(body.creativeVariant.copy.voiceover?.[0], HOOK_EDITADO_REAL, 'voiceover[0] real debe ser el hook real editado');
  });
});

describe('POST /api/create/propose-direct-variants — diversidad real entre variantes (Corrección "Cierre del Creative Director")', () => {
  test('genera hasta 5 variantes reales, cada una con angle/hook/structure/quality reales, y un diversityScore real', async () => {
    const { status, body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: 'Rutina matutina real de energía y enfoque antes de entrenar.', variantCount: 5,
    });
    assert.equal(status, 200);
    assert.ok(body.variants?.length >= 3, `se esperaban >= 3 variantes reales, obtuvo ${body.variants?.length}`);
    assert.ok(body.variants.length <= 5, 'nunca genera más de 5 variantes reales');
    for (const v of body.variants) {
      assert.ok(v.primaryAngle?.id, 'cada variante real trae primaryAngle real');
      assert.ok(v.hook?.length > 0, 'cada variante real trae hook real');
      assert.equal(typeof v.creativeQualityScore, 'number', 'cada variante real trae creativeQualityScore real');
    }
    assert.equal(typeof body.diversityScore, 'number');
    assert.ok(body.diversityScore >= 0 && body.diversityScore <= 1);
  });

  test('respeta variantCount real explícito, nunca genera más de lo pedido', async () => {
    const { status, body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: 'Instrucción real de prueba para límite de variantes.', variantCount: 2,
    });
    assert.equal(status, 200);
    assert.ok(body.variants.length <= 2);
  });
});

describe('POST /api/create/propose-direct-variants — datos reales para la UI de comparación (Corrección "UI de Variantes Creativas")', () => {
  test('cada variante real trae visualTreatmentLabel/visualIntent/recommendedModel/productAssetAvailable -- ya calculados, la tarjeta nunca los reconstruye', async () => {
    const { status, body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: 'Rutina matutina real de energía y enfoque antes de entrenar.', variantCount: 3,
    });
    assert.equal(status, 200);
    for (const v of body.variants) {
      assert.equal(typeof v.visualTreatment, 'string', 'visualTreatment real presente');
      assert.equal(typeof v.visualTreatmentLabel, 'string', 'visualTreatmentLabel real (humano) presente para la tarjeta');
      assert.equal(typeof v.productAssetAvailable, 'boolean', 'productAssetAvailable real presente para el aviso de producto');
      if (v.recommendedModel) assert.ok(v.recommendedModel.displayName?.length > 0, 'recommendedModel.displayName real, nunca el id técnico');
    }
  });

  test('cada variante real es su propio batch -- /api/create/model-recommendation funciona con variantIndex=0 real (Paso 14 del encargo, selección de modelo por variante)', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: 'Rutina matutina real de energía y enfoque antes de entrenar.', variantCount: 2,
    });
    const v = body.variants[0];
    const { status, body: rec } = await get(`/api/create/model-recommendation?batchId=${v.batchId}&variantIndex=0`);
    assert.equal(status, 200);
    assert.ok(rec.recommendedModel || rec.recommendedModel === null, 'model-recommendation real responde para el batch real de la variante seleccionada');
  });

  test('producir usa SOLO la variante real seleccionada (batchId propio) -- el copy/hook producido real coincide con el de esa variante, nunca con otra', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: 'Rutina matutina real de energía y enfoque antes de entrenar.', variantCount: 2,
    });
    assert.ok(body.variants.length >= 2, 'se necesitan >= 2 variantes reales para esta prueba');
    const selected = body.variants[1];
    const { status, body: job } = await post('/api/create/produce', {
      batchId: selected.batchId, variantIndex: 0, outputProfileNames: ['INSTAGRAM_REEL'],
    });
    assert.equal(status, 200);
    assert.equal(job.script?.onScreenText?.hook, selected.hook, 'el hook real producido coincide con el de la variante seleccionada, nunca con otra variante del lote');
    assert.ok(job.outputs?.length > 0, 'produce real devuelve al menos un output real para la variante seleccionada');
    assert.ok(job.outputs.every((o) => o.displayName?.length > 0), 'displayName humano real presente en cada output (Paso 17 del encargo, nunca output-<uuid>.mp4)');
  });
});

describe('POST /api/create/regenerate-hook — control manual (Corrección "Cierre del Creative Director")', () => {
  test('regenera un hook real distinto del actual, mismo ángulo real, excluyendo el hookId real actual', async () => {
    const { body: proposal } = await post('/api/create/propose-direct', {
      productId: 'ripped-capsules', rawText: 'Rutina matutina real de energía y enfoque.',
    });
    assert.ok(proposal.batchId);
    const { status, body } = await post('/api/create/regenerate-hook', {
      batchId: proposal.batchId, variantIndex: 0, userInstruction: 'Rutina matutina real de energía y enfoque.',
    });
    assert.equal(status, 200);
    assert.ok(body.hook?.length > 0, 'regenerate-hook real devuelve un hook real nuevo');
    assert.notEqual(body.hookId, proposal.creativeVariant.hookId ?? proposal.hookType?.id, 'el hookId real regenerado nunca es el mismo tipo real ya excluido');
  });

  test('rechaza sin batchId real', async () => {
    const { status } = await post('/api/create/regenerate-hook', {});
    assert.equal(status, 400);
  });
});
