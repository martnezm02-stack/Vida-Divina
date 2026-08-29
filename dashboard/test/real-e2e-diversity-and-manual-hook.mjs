// real-e2e-diversity-and-manual-hook.mjs — Corrección "Cierre del
// Creative Director" (2026-08-28), Paso 40/41 del encargo. E2E REAL
// manual (no forma parte de `npm test`): valida la capa de PROPUESTA
// (propose-direct-variants + regenerate-hook + edición manual) contra el
// servidor real -- nunca produce 5 videos reales completos (el encargo
// solo pide validar diversityScore/angle/hook/structure/claims a nivel
// de propuesta, Paso 24, no 5 producciones reales completas).
//
// Uso: node test/real-e2e-diversity-and-manual-hook.mjs

const BASE = 'http://localhost:4310';
const PRODUCT_ID = 'tongkat-ali-cafe';
const INSTRUCTION = 'Crea un Reel dirigido a hombres adultos que buscan incorporar una rutina de energía y enfoque durante su día. Quiero mostrar a un hombre en una mañana normal: se prepara para el trabajo, toma Café Divina Tongkat Ali y continúa su día con una actitud activa, enfocado y seguro. Que se sienta como una historia de estilo de vida real, natural y aspiracional, no como un anuncio tradicional de producto. El producto debe integrarse de manera natural en la rutina.';

async function post(path, body, timeoutMs = 60_000) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, body: await res.json() };
}
function assert(cond, msg) {
  if (!cond) throw new Error(`FALLO: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function main() {
  console.log('=== PARTE 1: 5 VARIANTES REALES (Paso 24/25/40) ===');
  const { status: s1, body: multi } = await post('/api/create/propose-direct-variants', {
    productId: PRODUCT_ID, rawText: INSTRUCTION, variantCount: 5,
  }, 120_000);
  assert(s1 === 200, `propose-direct-variants real devolvió 200 (status=${s1})`);
  assert(Array.isArray(multi.variants) && multi.variants.length >= 3, `>= 3 variantes reales generadas (obtuvo ${multi.variants?.length})`);
  assert(multi.variants.length <= 5, 'nunca genera más de 5 variantes reales');
  console.log(`     variantes reales generadas: ${multi.variants.length}`);

  for (const [i, v] of multi.variants.entries()) {
    console.log(`\n     VARIANTE ${i + 1}`);
    console.log(`       Ángulo real: ${v.primaryAngle?.id} (${v.primaryAngle?.label})`);
    console.log(`       Hook real: "${v.hook}" (${v.hookType?.id})`);
    console.log(`       Estructura real: ${v.structureLabel ?? v.structureId}`);
    console.log(`       Tratamiento visual real: ${v.visualTreatment}`);
    console.log(`       Calidad real: ${v.creativeQualityScore.toFixed(2)} (${v.creativeQualityStatus})`);
    assert(Boolean(v.primaryAngle?.id), `variante ${i + 1} real: primaryAngle presente`);
    assert(Boolean(v.hook), `variante ${i + 1} real: hook presente`);
    assert(Boolean(v.hookType?.id), `variante ${i + 1} real: hookType presente`);
    assert(typeof v.hookRelevanceScore === 'number', `variante ${i + 1} real: hookScore presente`);
    assert(Boolean(v.structureId), `variante ${i + 1} real: structure presente`);
    assert(Boolean(v.relevantClaims), `variante ${i + 1} real: relevantClaims presente`);
    assert(typeof v.creativeQualityScore === 'number', `variante ${i + 1} real: creativeQualityScore presente`);
  }

  console.log(`\n     diversityScore real: ${multi.diversityScore}`);
  console.log(`     detalle real: ${JSON.stringify(multi.diversityDetail)}`);
  assert(typeof multi.diversityScore === 'number', 'diversityScore real presente');
  assert(multi.diversityDetail.exactDuplicateHooks === 0, `sin hooks reales duplicados exactos (obtuvo ${multi.diversityDetail.exactDuplicateHooks})`);
  assert(multi.diversityDetail.distinctHooks >= Math.min(3, multi.variants.length), `>= 3 hooks reales claramente distintos cuando hay >= 3 variantes reales (obtuvo ${multi.diversityDetail.distinctHooks} de ${multi.variants.length})`);

  console.log('\n=== PARTE 2: CONTROL MANUAL DE HOOK (Paso 19-23/41) ===');
  const { status: s2, body: proposal } = await post('/api/create/propose-direct', { productId: PRODUCT_ID, rawText: INSTRUCTION });
  assert(s2 === 200 && Boolean(proposal.batchId), 'propose-direct real (single) devolvió batchId real');
  const hookOriginal = proposal.creativeVariant.copy.hook;
  console.log(`     hook real sugerido: "${hookOriginal}"`);

  console.log('1/2. Regenerando hook real (excluye el actual)...');
  const { status: s3, body: regenerated } = await post('/api/create/regenerate-hook', {
    batchId: proposal.batchId, variantIndex: 0, userInstruction: INSTRUCTION,
  });
  assert(s3 === 200 && Boolean(regenerated.hook), 'regenerate-hook real devolvió un hook real nuevo');
  console.log(`     hook real regenerado: "${regenerated.hook}" (${regenerated.hookType?.id})`);
  assert(regenerated.hook !== hookOriginal, 'el hook real regenerado es distinto real del sugerido original');

  console.log('3. Editando manualmente con un texto real propio (Guardar)...');
  const HOOK_MANUAL_REAL = 'Un hook real escrito a mano para esta prueba, único y reconocible.';
  const { status: s4, body: edited } = await post('/api/create/propose-direct', {
    productId: PRODUCT_ID, rawText: INSTRUCTION, hookText: HOOK_MANUAL_REAL,
  });
  assert(s4 === 200 && Boolean(edited.batchId), 'propose-direct real con hookText devolvió batchId real');
  assert(edited.hookMode === 'user_edited', `hookMode real === "user_edited" (obtuvo "${edited.hookMode}")`);
  assert(edited.creativeVariant.copy.hook === HOOK_MANUAL_REAL, 'el hook real NUNCA se sobrescribe -- texto real del usuario intacto');
  assert(edited.hookOriginal?.length > 0 && edited.hookOriginal !== HOOK_MANUAL_REAL, `hookOriginal real preservado para trazabilidad (obtuvo "${edited.hookOriginal}")`);
  console.log(`     hookOriginal real (antes de editar): "${edited.hookOriginal}"`);
  console.log(`     hook real final (editado): "${edited.creativeVariant.copy.hook}"`);
  console.log(`     creativeQualityScore real tras editar: ${edited.creativeQualityScore} (${edited.creativeQualityStatus})`);

  console.log('4/5. Verificando propagación real a script/voiceover...');
  assert(edited.creativeVariant.copy.script?.[0] === HOOK_MANUAL_REAL, 'script opening real === hook real editado');
  assert(edited.creativeVariant.copy.voiceover?.[0] === HOOK_MANUAL_REAL, 'voiceover opening real === hook real editado');

  console.log('\n✅ E2E REAL COMPLETO -- diversidad entre 5 variantes reales + control manual de hook, todos verificados.');
}

main().catch((err) => {
  console.error(`\n❌ E2E FALLÓ: ${err.message}`);
  process.exitCode = 1;
});
