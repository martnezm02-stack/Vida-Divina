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

  // VARIANT COUNT (Paso 50/51 del encargo "Master Creative Production
  // Flow"): "5" es SOLO el default/mínimo real -- NUNCA un techo
  // artificial. 7 > 5 real debe poder devolver más de 5 variantes reales
  // (nunca truncado en silencio a 5).
  test('NO limita artificialmente a 5: variantCount real 7 puede devolver más de 5 variantes reales', async () => {
    const { status, body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: 'Instrucción real de prueba para más de 5 variantes.', variantCount: 7,
    });
    assert.equal(status, 200);
    assert.ok(body.variants.length > 5, `se esperaban > 5 variantes reales con variantCount:7, obtuvo ${body.variants.length} -- NO debe truncarse artificialmente a 5`);
    assert.ok(body.variants.length <= 7, 'nunca genera más de lo pedido');
  });

  // GENERAR MÁS VARIANTES (Paso 52-54 del encargo): dos llamadas reales
  // sucesivas para la MISMA campaña real (mismo productId) deben usar
  // tracking real ACUMULADO -- la segunda ronda real evita repetir los
  // hooks reales ya usados en la primera (nunca "empieza desde cero").
  test('GENERAR MÁS VARIANTES: la segunda llamada real para la misma campaña evita repetir hooks reales ya usados en la primera', async () => {
    const rawText = `Instrucción real de prueba tracking acumulado ${Date.now()}.`;
    const primera = await post('/api/create/propose-direct-variants', { productId: 'ripped-capsules', rawText, variantCount: 3 });
    assert.equal(primera.status, 200);
    const hooksIdsPrimera = new Set(primera.body.variants.map((v) => v.hookType?.id).filter(Boolean));

    const segunda = await post('/api/create/propose-direct-variants', { productId: 'ripped-capsules', rawText, variantCount: 3 });
    assert.equal(segunda.status, 200);
    const hooksIdsSegunda = segunda.body.variants.map((v) => v.hookType?.id).filter(Boolean);
    // No es un gate absoluto (el catálogo real de hookTypes es finito y
    // selectHook() puede legítimamente reutilizar un tipo si ya se
    // agotaron alternativas reales, Paso 6/27: "usar el mejor
    // disponible") -- pero NO todas las hookIds reales de la segunda
    // ronda deberían coincidir exactamente con la primera si el
    // tracking real está funcionando.
    const totalmenteRepetido = hooksIdsSegunda.length > 0 && hooksIdsSegunda.every((id) => hooksIdsPrimera.has(id));
    assert.ok(!totalmenteRepetido, 'el tracking real acumulado (previousHooks) debería introducir al menos algo de variación real entre rondas sucesivas de la misma campaña');
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

  // TREATMENT SELECTION real (Corrección "Corrección del último tramo
  // de Creative Intent a Producción", 2026-08-29, Paso 4/5/43 del
  // encargo) -- caso real reportado: Cápsulas Venus con una instrucción
  // real de oficina/jornada laboral/lifestyle premium terminaba con
  // treatment "Fitness / Gym" real (root cause: assignVisualTreatment()
  // nunca recibía userInstruction en este flujo real).
  test('CASO REAL VENUS: instrucción real de oficina/jornada laboral/lifestyle premium -> variante principal NUNCA "Fitness / Gym", treatmentAlignmentScore real presente', async () => {
    const rawText = 'Quiero contar una historia cotidiana y natural de una mujer adulta durante una jornada laboral: comienza su día y, mientras trabaja, atraviesa momentos de incomodidad. El estilo debe ser lifestyle premium, auténtico, natural y aspiracional, no un anuncio tradicional.';
    const { status, body } = await post('/api/create/propose-direct-variants', { productId: 'venus-capsules', rawText, variantCount: 1 });
    assert.equal(status, 200);
    const v = body.variants[0];
    assert.notEqual(v.visualTreatment, 'FITNESS_GYM', `variante principal real NUNCA debe ser Fitness/Gym para esta instrucción real (obtuvo "${v.visualTreatmentLabel}")`);
    assert.equal(typeof v.treatmentAlignmentScore, 'number', 'treatmentAlignmentScore real presente en la variante');
    assert.ok(v.treatmentAlignmentScore >= 0.70, `treatmentAlignmentScore real ${v.treatmentAlignmentScore} debía ser >= 0.70 para el treatment real elegido`);
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

describe('GET /api/create/visual-plan-preview — auditable ANTES de producir (Corrección "Hacer auditable la propuesta antes de producir")', () => {
  const INSTRUCTION = 'Rutina matutina real de energía y enfoque antes de entrenar, mostrando a una persona real usando el producto.';

  test('A/B: variante generada -> plan visual y prompts visibles ANTES de producción real (sin producir nada)', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 1,
    });
    const v = body.variants[0];
    const { status, body: plan } = await get(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    assert.equal(status, 200);
    assert.equal(plan.status, 'READY');
    assert.ok(plan.scenes.length > 0, 'plan visual real: al menos 1 escena real, ANTES de producir');
    const conPrompt = plan.scenes.filter((s) => s.generatedPrompt);
    assert.ok(conPrompt.length > 0, 'al menos 1 escena real trae generatedPrompt real ANTES de producir');
    const sinPrompt = plan.scenes.filter((s) => !s.generatedPrompt);
    for (const s of sinPrompt) assert.ok(s.promptPendingReason?.length > 0, 'escena real sin prompt trae explicación real (nunca "prompt vacío" sin motivo)');
  });

  test('C/D: abrir plan visual + prompts NO llama Krea (lectura real local, rápida y determinista -- nunca una generación externa)', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 1,
    });
    const v = body.variants[0];
    const inicio = Date.now();
    const { status, body: plan } = await get(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    const duracionMs = Date.now() - inicio;
    assert.equal(status, 200);
    assert.ok(duracionMs < 3000, `visual-plan-preview real responde rápido (${duracionMs}ms) -- una llamada real a Krea tarda segundos/minutos, nunca <3s (Paso 5 del encargo: revisar NUNCA genera)`);
    // Determinismo real: dos lecturas reales seguidas del MISMO batch/escena
    // devuelven EXACTAMENTE el mismo generatedPrompt real -- una llamada
    // real a un provider externo no sería determinista byte a byte.
    const { body: plan2 } = await get(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    assert.deepEqual(plan.scenes.map((s) => s.generatedPrompt), plan2.scenes.map((s) => s.generatedPrompt), 'generatedPrompt real determinista entre dos lecturas reales seguidas (nunca una generación externa nueva)');
  });

  test('E/F: cambiar de variante real actualiza el preview real -- nunca mezcla datos de una variante con otra', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 2,
    });
    assert.ok(body.variants.length >= 2, 'se necesitan >= 2 variantes reales para esta prueba');
    const [vA, vB] = body.variants;
    const { body: planA } = await get(`/api/create/visual-plan-preview?batchId=${vA.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    const { body: planB } = await get(`/api/create/visual-plan-preview?batchId=${vB.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    const promptsA = planA.scenes.map((s) => s.generatedPrompt).join('|');
    const promptsB = planB.scenes.map((s) => s.generatedPrompt).join('|');
    assert.notEqual(promptsA, promptsB, 'el preview real de la variante B es real y distinto del de la variante A (hooks/ángulos reales distintos), nunca mezclado');
  });

  test('G/H: product reference y model/quality reales visibles ANTES de producir', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 1,
    });
    const v = body.variants[0];
    const { body: plan } = await get(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    assert.equal(typeof plan.assetRequirements?.productAssetAvailable, 'boolean', 'product reference real presente (G)');
    assert.ok(plan.generationSettings?.recommendedModel?.length > 0, 'modelo sugerido real presente (H)');
    assert.ok(plan.generationSettings?.recommendedQuality?.length > 0, 'calidad sugerida real presente (H)');
  });

  test('K: llamar el preview real varias veces NUNCA crea un batch/campaña nuevo real -- solo lectura, nunca dispara producción', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 1,
    });
    const v = body.variants[0];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { status } = await get(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
      assert.equal(status, 200);
    }
    // El batch real sigue siendo el MISMO (nunca se creó uno nuevo por leer el preview).
    const { status: statusFinal, body: recFinal } = await get(`/api/create/model-recommendation?batchId=${v.batchId}&variantIndex=0`);
    assert.equal(statusFinal, 200, 'el batch real original sigue existiendo intacto tras 3 lecturas reales del preview');
    assert.ok(recFinal.recommendedModel !== undefined, 'model-recommendation real sigue respondiendo sobre el MISMO batch real (nunca uno nuevo)');
  });

  test('VISUAL BRIEF: visualBrief real (descripción humana) presente y separado real de generatedPrompt (técnico, por escena) -- nunca el mismo valor real (Paso 16/17/18/38 del encargo "Refinamiento creativo")', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 1,
    });
    const v = body.variants[0];
    assert.ok(v.visualBrief?.length > 0, 'visualBrief real presente en la respuesta de propose-direct-variants');
    const { body: plan } = await get(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    assert.ok(plan.visualBrief?.length > 0, 'visualBrief real presente en visual-plan-preview');
    const escenaConPrompt = plan.scenes.find((s) => s.generatedPrompt);
    assert.ok(escenaConPrompt, 'se necesita al menos 1 escena real con generatedPrompt real para esta prueba');
    assert.notEqual(plan.visualBrief, escenaConPrompt.generatedPrompt, 'visualBrief real (descripción humana, UNA por pieza) nunca es el mismo texto real que generatedPrompt (técnico, por escena)');
  });

  test('PROMPT POR ESCENA: cada escena real trae model/quality/product reference reales junto al prompt (Paso 19 del encargo)', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 1,
    });
    const v = body.variants[0];
    const { body: plan } = await get(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    for (const s of plan.scenes) {
      assert.ok(s.model, `escena "${s.sceneId}" real trae model real`);
      assert.ok(s.quality, `escena "${s.sceneId}" real trae quality real`);
      assert.equal(typeof s.productReferenceUsed, 'boolean', `escena "${s.sceneId}" real trae productReferenceUsed real (boolean)`);
    }
  });

  test('COPIAR PROMPT: el texto real que se copiaría es EXACTAMENTE generatedPrompt, sin metadata técnica adicional real (Paso 14/38 del encargo)', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 1,
    });
    const v = body.variants[0];
    const { body: plan } = await get(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    const escenaConPrompt = plan.scenes.find((s) => s.generatedPrompt);
    assert.ok(escenaConPrompt, 'se necesita al menos 1 escena real con generatedPrompt real para esta prueba');
    // El frontend (app.js#renderVisualPlanPreview) usa s.generatedPrompt
    // literal como data-prompt del botón "Copiar prompt" -- este test
    // verifica el contrato real del backend: ningún campo técnico
    // adicional (requestId/sceneId/model) está mezclado dentro del string
    // real del prompt.
    assert.ok(!escenaConPrompt.generatedPrompt.includes(escenaConPrompt.sceneId), 'generatedPrompt real nunca incluye el sceneId técnico como texto');
  });

  test('L: backward compatibility real -- "batchId"/"variantIndex" siguen siendo obligatorios, mismo criterio real que model-recommendation/structure-recommendation', async () => {
    const sinBatch = await get('/api/create/visual-plan-preview?variantIndex=0');
    assert.equal(sinBatch.status, 400);
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 1,
    });
    const sinVariantIndex = await get(`/api/create/visual-plan-preview?batchId=${body.variants[0].batchId}`);
    assert.equal(sinVariantIndex.status, 400);
  });

  test('I: generatedPrompt real mostrado en el preview == generatedPrompt real persistido tras producir (source of truth único, Paso 12 del encargo)', async () => {
    const { body } = await post('/api/create/propose-direct-variants', {
      productId: 'ripped-capsules', rawText: INSTRUCTION, variantCount: 1,
    });
    const v = body.variants[0];
    const { body: plan } = await get(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
    const escenaConPromptPreview = plan.scenes.find((s) => s.generatedPrompt);
    assert.ok(escenaConPromptPreview, 'se necesita al menos 1 escena real con generatedPrompt real en el preview para esta prueba');

    const { status, body: job } = await post('/api/create/produce', {
      batchId: v.batchId, variantIndex: 0, outputProfileNames: ['INSTAGRAM_REEL'],
    });
    assert.equal(status, 200);
    const escenaProducidaReal = (job.visualGenerationRequests ?? []).find((r) => r.sceneId === escenaConPromptPreview.sceneId);
    assert.ok(escenaProducidaReal, 'la escena real del preview existe también en la producción real ya terminada');
    assert.equal(escenaProducidaReal.generatedPrompt, escenaConPromptPreview.generatedPrompt, 'el generatedPrompt real mostrado en el preview es EXACTAMENTE el mismo real que terminó persistido tras producir -- nunca reconstruido');

    // FORMAT OUTPUT — HARD LOCK (A/D/K del encargo "Master Creative
    // Production Flow"): outputProfileNames real == ["INSTAGRAM_REEL"]
    // (un único formato real pedido) -> EXACTAMENTE 1 output real, nunca
    // INSTAGRAM_FEED agregado como efecto colateral.
    assert.equal(job.outputs.length, 1, 'un único formato real pedido -> EXACTAMENTE 1 output real (nunca un segundo formato agregado)');
    assert.equal(job.outputs[0].profileName, 'INSTAGRAM_REEL');
    assert.ok(!job.outputs.some((o) => o.profileName === 'INSTAGRAM_FEED'), 'INSTAGRAM_FEED NUNCA aparece cuando no fue solicitado real');
    assert.deepEqual(job.requestedFormats, ['INSTAGRAM_REEL'], 'requestedFormats real == exactamente lo pedido');
    assert.deepEqual(job.actualOutputs, ['INSTAGRAM_REEL'], 'actualOutputs real == exactamente lo producido');
    assert.equal(job.formatSelectionValid, true, 'formatSelectionValid real true cuando requestedFormats/actualOutputs coinciden exactamente');
  });
});

describe('FORMAT OUTPUT — HARD LOCK (Corrección "Master Creative Production Flow", 2026-08-29)', () => {
  // K/L del encargo: computeFormatSelectionValid real es lógica pura --
  // cubierta aquí sin pagar el costo real de una producción completa
  // (ya cubierta arriba, caso A/D con una producción real completa).
  test('K: requestedFormats real === actualOutputFormats real (mismo contenido, orden indiferente) -> valid true', async () => {
    const { computeFormatSelectionValid } = await import('../server/routes/generation.js');
    const r = computeFormatSelectionValid(['INSTAGRAM_REEL', 'INSTAGRAM_FEED'], [
      { profileName: 'INSTAGRAM_FEED', status: 'COMPLETADO' },
      { profileName: 'INSTAGRAM_REEL', status: 'COMPLETADO' },
    ]);
    assert.equal(r.formatSelectionValid, true);
    assert.deepEqual(new Set(r.actualOutputs), new Set(['INSTAGRAM_REEL', 'INSTAGRAM_FEED']));
  });

  test('L: un formato real extra/inesperado en los outputs reales -> formatSelectionValid false (producción real INVÁLIDA, nunca declarada éxito)', async () => {
    const { computeFormatSelectionValid } = await import('../server/routes/generation.js');
    const r = computeFormatSelectionValid(['INSTAGRAM_REEL'], [
      { profileName: 'INSTAGRAM_REEL', status: 'COMPLETADO' },
      { profileName: 'INSTAGRAM_FEED', status: 'COMPLETADO' },
    ]);
    assert.equal(r.formatSelectionValid, false, 'un output real no pedido invalida formatSelectionValid, incluso si el pedido real también está presente');
  });

  test('un output real FAILED nunca cuenta como formato realmente entregado', async () => {
    const { computeFormatSelectionValid } = await import('../server/routes/generation.js');
    const r = computeFormatSelectionValid(['INSTAGRAM_REEL', 'INSTAGRAM_FEED'], [
      { profileName: 'INSTAGRAM_REEL', status: 'COMPLETADO' },
      { profileName: 'INSTAGRAM_FEED', status: 'POSTPRODUCTION_FAILED' },
    ]);
    assert.equal(r.formatSelectionValid, false);
    assert.deepEqual(r.actualOutputs, ['INSTAGRAM_REEL']);
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
