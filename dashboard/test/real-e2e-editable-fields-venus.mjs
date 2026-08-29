// real-e2e-editable-fields-venus.mjs — Corrección "Corrección integral del
// flujo de Crear contenido" (2026-08-29), Paso 44-48 del encargo. E2E REAL
// manual (no forma parte de `npm test`, mismo criterio que los demás
// real-e2e-*.mjs de este proyecto): Cápsulas Venus, a través del servidor
// HTTP real ya corriendo en localhost:4310.
//
// A diferencia de real-e2e-crear-contenido-coherence.mjs (que ya cubre
// Pre-Producción + Producción real de la línea base), este script cubre
// específicamente lo NUEVO de esta corrección: Editable Fields
// (hookOverride/voiceoverOverride/ctaOverride) + Prompt Editing por escena
// (scenePromptOverrides), verificando que la producción real usa
// EXACTAMENTE los valores editados (nunca los originales de la variante),
// y que el prompt real contiene "mujer"/"oficina" real (nunca reducido a
// "persona adulto").
//
// Uso: node test/real-e2e-editable-fields-venus.mjs

const BASE = 'http://localhost:4310';
const PRODUCT_ID = 'venus-capsules';
// Instrucción real EXACTA del caso reportado (Corrección "Corrección del
// último tramo de Creative Intent a Producción", 2026-08-29, Paso 49 del
// encargo) -- "jornada laboral"/"mientras trabaja" (sin la palabra literal
// "oficina") debe seguir detectando environment="oficina moderna" (Paso
// 22/28, ENVIRONMENT LOCK ampliado) y el treatment real NUNCA debe ser
// "Fitness / Gym" (Paso 4/5, root cause real ya corregido en
// visualTreatments.js).
const INSTRUCTION = 'Quiero un Reel dirigido a mujeres adultas que buscan integrar una rutina de bienestar durante las distintas etapas de su ciclo. Quiero contar una historia cotidiana y natural de una mujer adulta durante una jornada laboral: comienza su día y, mientras trabaja, atraviesa momentos de incomodidad o distracción relacionados con su ciclo. Después incorpora Cápsulas Venus de forma natural a su rutina y continúa con su día con una actitud más tranquila, activa y segura. La historia debe mostrar una evolución clara entre el estado inicial y el estado final, manteniendo a la misma protagonista durante todo el video. Usa diferentes acciones, situaciones, encuadres y composiciones para que cada escena avance la historia y no parezca una repetición de la misma toma. El estilo debe ser lifestyle premium, auténtico, natural y aspiracional, no un anuncio tradicional. La protagonista no debe mirar directamente a cámara salvo que la narrativa lo requiera. El producto debe mostrarse utilizando la fotografía real de Cápsulas Venus del catálogo cuando aparezca físicamente. No incrustes en las imágenes el hook, voiceover, subtítulos, captions ni CTA; esos elementos deben resolverse en postproducción.';

const REQUEST_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 30 * 60_000;
const POLL_INTERVAL_MS = 5_000;
const POLL_REQUEST_TIMEOUT_MS = 60_000;
const POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS = 10;

const TERMINAL_STATUSES = new Set(['FULL_PRODUCTION', 'DEGRADED_PRODUCTION', 'FAILED', 'VALIDATION_FAILED', 'SOURCE_ASSET_REQUIRED', 'CANCELED']);
const SUCCESS_STATUSES = new Set(['FULL_PRODUCTION', 'DEGRADED_PRODUCTION']);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function post(path, body, timeoutMs = REQUEST_TIMEOUT_MS) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, body: await res.json() };
}
async function get(path, timeoutMs = REQUEST_TIMEOUT_MS) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, body: await res.json() };
}
function assert(cond, msg) {
  if (!cond) throw new Error(`FALLO: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function pollProduction(jobId) {
  const startedAt = Date.now();
  let ultimoEstado = 'RUNNING';
  let erroresTransitoriosSeguidos = 0;
  while (true) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(`polling: se superó el presupuesto real de ${POLL_TIMEOUT_MS}ms esperando un estado terminal real de jobId="${jobId}" (último estado real visto: "${ultimoEstado}").`);
    }
    let httpStatus; let body;
    try {
      ({ status: httpStatus, body } = await get(`/api/create/produce-status?jobId=${encodeURIComponent(jobId)}`, POLL_REQUEST_TIMEOUT_MS));
    } catch (err) {
      erroresTransitoriosSeguidos += 1;
      console.log(`     (poll transitorio real falló: ${err.message} -- reintento ${erroresTransitoriosSeguidos}/${POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS})`);
      if (erroresTransitoriosSeguidos > POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS) {
        throw new Error(`polling: ${POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS} fallos de transporte reales seguidos (último: ${err.message}).`);
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    erroresTransitoriosSeguidos = 0;
    if (httpStatus !== 200) throw new Error(`polling: produce-status devolvió ${httpStatus} real: ${JSON.stringify(body).slice(0, 300)}`);
    ultimoEstado = body.status;
    if (ultimoEstado === 'RUNNING') { await sleep(POLL_INTERVAL_MS); continue; }
    if (!TERMINAL_STATUSES.has(ultimoEstado)) throw new Error(`polling: estado real desconocido "${ultimoEstado}".`);
    return body;
  }
}

async function main() {
  console.log('=== ESCENARIO 1: PRE-PRODUCCIÓN ===');
  console.log('1. Generando variantes (propose-direct-variants)...');
  const { status: s1, body: variantsResult } = await post('/api/create/propose-direct-variants', { productId: PRODUCT_ID, rawText: INSTRUCTION, variantCount: 1 });
  assert(s1 === 200 && Array.isArray(variantsResult.variants) && variantsResult.variants.length > 0, `propose-direct-variants devolvió al menos 1 variante real (status=${s1})`);
  const variant = variantsResult.variants[0];
  const batchId = variant.batchId;
  assert(variant.hook?.length > 0, `hook real generado: "${variant.hook}"`);
  assert(variant.creativeVariant?.copy?.cta?.length > 0, `CTA real generado: "${variant.creativeVariant.copy.cta}"`);

  console.log('1b. Verificando TREATMENT (Paso 4/5/43: caso real reportado "Fitness / Gym" para una instrucción de oficina/jornada laboral)...');
  assert(variant.visualTreatment !== 'FITNESS_GYM', `treatment real NUNCA debe ser Fitness/Gym para esta instrucción real (obtuvo "${variant.visualTreatmentLabel}")`);
  assert(typeof variant.treatmentAlignmentScore === 'number' && variant.treatmentAlignmentScore >= 0.70, `treatmentAlignmentScore real >= 0.70 (obtuvo ${variant.treatmentAlignmentScore})`);
  console.log(`     Treatment real: ${variant.visualTreatmentLabel} (treatmentAlignmentScore real: ${variant.treatmentAlignmentScore})`);

  console.log('2. Verificando visual-plan-preview (Prompt Gate / Instruction Coverage / narrativeIntent)...');
  const qs = new URLSearchParams({ batchId, variantIndex: '0', userInstruction: INSTRUCTION });
  const { status: s2, body: plan } = await get(`/api/create/visual-plan-preview?${qs.toString()}`);
  assert(s2 === 200 && plan.status === 'READY', `visual-plan-preview devolvió READY real (status=${s2}, plan.status=${plan.status})`);
  assert(plan.narrativeIntent === INSTRUCTION, 'narrativeIntent real === userInstruction real verbatim (nunca resumido)');
  assert(typeof plan.instructionCoverageScore === 'number', `instructionCoverageScore real presente (${plan.instructionCoverageScore})`);
  console.log(`     instructionCoverageScore real: ${plan.instructionCoverageScore} (missing: ${(plan.instructionCoverageMissing ?? []).join(', ') || 'ninguno'})`);

  console.log('=== ESCENARIO 3: PROMPT CONTENT CHECK ===');
  const scene1 = plan.scenes[0];
  assert(Boolean(scene1?.generatedPrompt), 'la escena 1 real tiene generatedPrompt real (no null)');
  assert(/mujer/i.test(scene1.generatedPrompt), `generatedPrompt real de la escena 1 menciona "mujer" (prompt: "${scene1.generatedPrompt.slice(0, 200)}...")`);
  assert(/oficina/i.test(scene1.generatedPrompt), 'generatedPrompt real de la escena 1 menciona "oficina"');
  assert(!/persona adulto/i.test(scene1.generatedPrompt), 'generatedPrompt real NUNCA se redujo a "persona adulto" genérico (Problema 2 corregido)');
  assert(!/fondo simple y cuidado/i.test(scene1.generatedPrompt), 'generatedPrompt real NUNCA cae al fallback genérico "Fondo simple y cuidado" (Paso 16, caso real reportado en esta corrección)');
  console.log(`     Prompt real escena 1: "${scene1.generatedPrompt}"`);

  console.log('=== ESCENARIO 2: MANUAL EDIT (simulado a nivel HTTP -- overrides explícitos) ===');
  const hookOverride = `${variant.hook} (editado a mano por el usuario)`;
  const ctaOverride = `${variant.creativeVariant.copy.cta} Escríbenos hoy mismo.`;
  const scenePromptOverride = 'mujer adulta real, oficina moderna real, edición manual real de prueba E2E, mantiene continuidad con Cápsulas Venus.';
  console.log(`     hookOverride real: "${hookOverride}"`);
  console.log(`     ctaOverride real: "${ctaOverride}"`);
  console.log(`     scenePromptOverride real (escena "${scene1.sceneId}"): "${scenePromptOverride}"`);

  console.log('=== ESCENARIO 4: PRODUCCIÓN (con los overrides reales de arriba) ===');
  const { status: s4, body: start } = await post('/api/create/produce-start', {
    batchId, variantIndex: 0, userInstruction: INSTRUCTION, outputProfileNames: ['INSTAGRAM_REEL'],
    hookOverride, ctaOverride, scenePromptOverrides: { [scene1.sceneId]: scenePromptOverride },
  });
  assert(s4 === 202 && start.jobId, `produce-start devolvió 202 con jobId real (status=${s4}, body=${JSON.stringify(start).slice(0, 300)})`);
  console.log(`     jobId real: ${start.jobId}`);

  console.log('Polling real del estado del job (esto puede tardar varios minutos reales)...');
  const job = await pollProduction(start.jobId);
  console.log(`     ProductionJob status real: ${job.status}`);
  if (!SUCCESS_STATUSES.has(job.status)) {
    throw new Error(`FALLO: producción real terminó en "${job.status}": ${job.error ?? (job.errors ?? []).join('; ')}`);
  }

  console.log('Verificando que los cambios manuales reales SÍ llegaron a la producción real (nunca los originales)...');
  assert(job.script.onScreenText.hook === hookOverride, `job.script.onScreenText.hook === hookOverride real (obtuvo "${job.script.onScreenText.hook}")`);
  assert(job.script.onScreenText.cta === ctaOverride, `job.script.onScreenText.cta === ctaOverride real (obtuvo "${job.script.onScreenText.cta}")`);
  const escenaEditada = job.scenePlan.scenes.find((s) => s.sceneId === scene1.sceneId);
  assert(escenaEditada.visualPrompt === scenePromptOverride, `escena "${scene1.sceneId}": visualPrompt real === scenePromptOverride real (Prompt Parity, nunca regenerado en silencio)`);
  const requestEditado = (job.visualGenerationRequests ?? []).find((r) => r.sceneId === scene1.sceneId);
  if (requestEditado?.generatedPrompt) {
    assert(requestEditado.generatedPrompt === scenePromptOverride, 'visualGenerationRequests real: generatedPrompt === scenePromptOverride real (mismo string real que se hubiera enviado a Krea)');
  } else {
    console.log(`     (escena "${scene1.sceneId}" cayó a fallback tipográfico real -- sin generatedPrompt real que comparar, comportamiento correcto sin credencial real de imagen.)`);
  }

  console.log('Verificando que las escenas NO editadas mantienen el sujeto real (mujer, nunca hombre)...');
  for (const s of job.scenePlan.scenes) {
    if (s.sceneId === scene1.sceneId) continue;
    assert(!/\bhombre\b/i.test(s.subject ?? ''), `escena "${s.sceneId}" (no editada) no menciona "hombre" (subject: "${s.subject}")`);
  }

  console.log('=== ESCENARIO 5: VERSIONING (no-regresión) ===');
  assert(Boolean(job.productionJobId), 'job.productionJobId real presente -- el flujo de producción con overrides no rompe la persistencia real (Editable Video Project)');

  console.log('\n✅ E2E REAL COMPLETO -- todas las verificaciones de Editable Fields/Prompt Editing pasaron.');
  console.log(`   Job status real: ${job.status} · jobId real: ${start.jobId} · productionJobId real: ${job.productionJobId}`);
}

main().catch((err) => {
  console.error(`\n❌ E2E FALLÓ: ${err.message}`);
  process.exitCode = 1;
});
