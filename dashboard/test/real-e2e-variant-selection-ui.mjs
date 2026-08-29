// real-e2e-variant-selection-ui.mjs — "UI de Variantes Creativas"
// (2026-08-28), Paso 24/25 del encargo. E2E REAL manual (no forma parte
// de `npm test`): valida el CONTRATO DE DATOS real que consume la nueva
// UI de Dashboard (Generar variantes -> Comparar -> Seleccionar ->
// Detalle -> Producir) contra el servidor real -- nunca produce las 5
// variantes completas (Paso 24: "no requiere 5 producciones reales
// completas"), y prueba el escenario de "cambio de selección" (Paso 25)
// produciendo SOLO la variante finalmente elegida.
//
// Uso: node test/real-e2e-variant-selection-ui.mjs

const BASE = 'http://localhost:4310';
const PRODUCT_ID = 'tongkat-ali-cafe';
const INSTRUCTION = 'Crea un Reel dirigido a hombres adultos que buscan incorporar una rutina de energía y enfoque durante su día. Quiero mostrar a un hombre en una mañana normal: se prepara para el trabajo, toma Café Divina Tongkat Ali y continúa su día con una actitud activa, enfocado y seguro. Que se sienta como una historia de estilo de vida real, natural y aspiracional, no como un anuncio tradicional de producto. El producto debe integrarse de manera natural en la rutina.';

async function post(path, body, timeoutMs = 60_000) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, body: await res.json() };
}
async function get(path, timeoutMs = 60_000) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, body: await res.json() };
}
function assert(cond, msg) {
  if (!cond) throw new Error(`FALLO: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function main() {
  console.log('1. Generando 5 variantes reales (propose-direct-variants)...');
  const { status: s1, body: multi } = await post('/api/create/propose-direct-variants', {
    productId: PRODUCT_ID, rawText: INSTRUCTION, variantCount: 5,
  }, 120_000);
  assert(s1 === 200, `propose-direct-variants real devolvió 200 (status=${s1})`);
  assert(Array.isArray(multi.variants) && multi.variants.length >= 3, `>= 3 variantes reales aparecen para el Dashboard (obtuvo ${multi.variants?.length})`);
  console.log(`     variantes reales: ${multi.variants.length}`);

  console.log('2. Verificando datos reales que consume cada tarjeta de comparación...');
  const hooks = new Set();
  for (const [i, v] of multi.variants.entries()) {
    assert(Boolean(v.primaryAngle?.label), `variante ${i + 1}: primaryAngle.label real (humano) presente`);
    assert(Boolean(v.hook), `variante ${i + 1}: hook real presente`);
    assert(Boolean(v.structureLabel), `variante ${i + 1}: structureLabel real presente`);
    assert(typeof v.visualTreatmentLabel === 'string', `variante ${i + 1}: visualTreatmentLabel real (humano) presente`);
    assert(typeof v.productAssetAvailable === 'boolean', `variante ${i + 1}: productAssetAvailable real presente (aviso de producto)`);
    assert(Boolean(v.creativeQualityStatus), `variante ${i + 1}: creativeQualityStatus real presente (badge de calidad)`);
    assert(Boolean(v.batchId), `variante ${i + 1}: batchId real presente (cada variante es su propio batch)`);
    hooks.add(v.hook);
  }
  assert(hooks.size >= Math.min(3, multi.variants.length), `hooks reales claramente distintos entre variantes (obtuvo ${hooks.size} de ${multi.variants.length})`);
  console.log(`     diversityScore real: ${multi.diversityScore}`);
  assert(typeof multi.diversityScore === 'number', 'diversityScore real presente (cabecera de diversidad)');

  console.log('3. Simulando selección inicial: Variante 1...');
  let selected = multi.variants[0];
  console.log(`     seleccionada (inicial): Variante 1 -- "${selected.hook}"`);

  console.log('3a. Ver detalle real de la variante seleccionada (Paso 8 del encargo)...');
  assert(Array.isArray(selected.creativeVariant?.copy?.script) && selected.creativeVariant.copy.script.length > 0, 'detalle real: script presente');
  assert(Array.isArray(selected.creativeVariant?.copy?.voiceover) && selected.creativeVariant.copy.voiceover.length > 0, 'detalle real: voiceover presente');
  assert(Boolean(selected.hookType?.label), 'detalle real: hookType.label (humano) presente');

  console.log('3b. Modelo/Calidad sugeridos reales para la variante seleccionada (Paso 14 del encargo)...');
  const { status: sModel, body: modelRec } = await get(`/api/create/model-recommendation?batchId=${selected.batchId}&variantIndex=0`);
  assert(sModel === 200, 'model-recommendation real responde para el batch real de la variante seleccionada');
  assert(Boolean(modelRec.recommendedModel?.displayName), 'model-recommendation real trae displayName humano (nunca id técnico)');

  console.log('4. Paso 25/41 del encargo: el usuario CAMBIA de selección (Variante 1 -> última variante disponible)...');
  const nuevaSeleccion = multi.variants[multi.variants.length - 1];
  assert(nuevaSeleccion.batchId !== selected.batchId, 'la nueva selección real es un batch real distinto del anterior');
  selected = nuevaSeleccion;
  console.log(`     seleccionada (final): Variante ${multi.variants.length} -- "${selected.hook}"`);

  console.log('4a. Paso 1/2/3/21/22 del encargo "Hacer auditable": revisando plan visual + prompts ANTES de producir (nunca debe llamar a Krea)...');
  const inicioPreview = Date.now();
  const { status: sPlan, body: plan } = await get(`/api/create/visual-plan-preview?batchId=${selected.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
  const duracionPreviewMs = Date.now() - inicioPreview;
  assert(sPlan === 200, 'visual-plan-preview real devolvió 200 (status=' + sPlan + ')');
  assert(plan.status === 'READY' && plan.scenes.length > 0, `plan visual real disponible ANTES de producir (${plan.scenes?.length} escena(s))`);
  assert(duracionPreviewMs < 3000, `visual-plan-preview real respondió rápido (${duracionPreviewMs}ms) -- NO llamó a Krea (Paso 5 del encargo)`);
  const escenasConPrompt = plan.scenes.filter((s) => s.generatedPrompt);
  assert(escenasConPrompt.length > 0, `prompts reales visibles ANTES de producir (${escenasConPrompt.length} de ${plan.scenes.length} escenas)`);
  for (const s of plan.scenes) {
    console.log(`     Escena "${s.sceneId}" (${s.sectionType}): ${s.generatedPrompt ? 'prompt real listo' : `sin prompt -- ${s.promptPendingReason}`}`);
  }
  assert(typeof plan.assetRequirements?.productAssetAvailable === 'boolean', 'product reference real visible ANTES de producir');
  assert(Boolean(plan.generationSettings?.recommendedModel), 'modelo sugerido real visible ANTES de producir');
  assert(Boolean(plan.generationSettings?.recommendedQuality), 'calidad sugerida real visible ANTES de producir');
  console.log(`     Producto real disponible: ${plan.assetRequirements.productAssetAvailable ? '✅' : '⚠️ sin fotografía'} · Modelo real sugerido: ${plan.generationSettings.recommendedModel} · Calidad real sugerida: ${plan.generationSettings.recommendedQuality}`);

  console.log('5. Produciendo SOLO la variante finalmente seleccionada (nunca las otras, Paso 15/26 del encargo)...');
  const { status: sProd, body: job } = await post('/api/create/produce', {
    batchId: selected.batchId, variantIndex: 0, outputProfileNames: ['INSTAGRAM_REEL'],
  }, 20 * 60_000);
  assert(sProd === 200, `produce real devolvió 200 (status=${sProd})`);
  assert(['FULL_PRODUCTION', 'DEGRADED_PRODUCTION'].includes(job.status), `producción real terminó en un estado exitoso real (obtuvo "${job.status}")`);
  console.log(`     Job status real: ${job.status}`);

  console.log('6. Confirmando que el output real corresponde a la variante finalmente seleccionada (nunca a otra)...');
  assert(job.script?.onScreenText?.hook === selected.hook, `el hook real producido coincide con la ÚLTIMA selección real (obtuvo "${job.script?.onScreenText?.hook}", esperado "${selected.hook}")`);

  console.log('6a. Confirmando que el prompt real ya producido es EXACTAMENTE el mismo real que se mostró en el preview (Paso 12 del encargo)...');
  const escenaPreview = plan.scenes.find((s) => s.generatedPrompt);
  const escenaReal = (job.visualGenerationRequests ?? []).find((r) => r.sceneId === escenaPreview?.sceneId);
  assert(Boolean(escenaReal), 'la escena real del preview también existe en la producción real ya terminada');
  assert(escenaReal.generatedPrompt === escenaPreview.generatedPrompt, 'generatedPrompt real del preview === generatedPrompt real persistido (nunca reconstruido, source of truth único)');

  console.log('7. Confirmando displayName humano real en el output (Paso 17 del encargo)...');
  assert(Array.isArray(job.outputs) && job.outputs.length > 0, 'al menos un output real');
  for (const o of job.outputs) {
    assert(Boolean(o.displayName), `output real trae displayName humano (obtuvo "${o.displayName}")`);
    assert(!/^output-[0-9a-f-]{20,}/i.test(o.displayName), 'displayName real NUNCA es el nombre técnico output-<uuid>.mp4');
    console.log(`     ${o.profileName}: "${o.displayName}"`);
  }

  console.log('\n✅ E2E REAL COMPLETO -- comparar/seleccionar/cambiar selección/producir solo la variante elegida, todos verificados.');
}

main().catch((err) => {
  console.error(`\n❌ E2E FALLÓ: ${err.message}`);
  process.exitCode = 1;
});
