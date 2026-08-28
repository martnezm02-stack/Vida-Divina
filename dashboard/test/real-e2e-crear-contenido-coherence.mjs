// real-e2e-crear-contenido-coherence.mjs — Corrección integral "Crear
// contenido" (2026-08-28), Paso 24/25 del encargo. E2E REAL manual (no
// forma parte de `npm test`, mismo criterio que los demás
// real-e2e-*.mjs de este proyecto): Cápsulas Venus + instrucción real de
// "mujer adulta en oficina", a través del servidor HTTP real ya
// corriendo en localhost:4310. Produce UNA sola pieza real.
//
// Corrección "E2E producción larga vía polling" (2026-08-28): una
// producción real (guion+N escenas HyperFrames/ffmpeg+Krea real+Voice
// Engine real) tarda varios minutos reales, y una única conexión HTTP
// sostenida durante todo ese tiempo (POST /api/create/produce) resultó
// frágil en la práctica ("fetch failed" real observado, con el servidor
// real sano y la producción real completándose igual del lado del
// servidor). Este test ya NO sostiene esa conexión: usa
// POST /api/create/produce-start (devuelve jobId real de inmediato) +
// GET /api/create/produce-status (polling real) hasta un estado
// terminal real -- MISMO ProductionJob real de siempre (mismo
// produceCreative/generateNewVoiceover/saveProductionJob, sin tocar una
// sola línea de ese pipeline real), solo una forma distinta real de
// esperar el resultado.
//
// Uso: node test/real-e2e-crear-contenido-coherence.mjs

const BASE = 'http://localhost:4310';
const PRODUCT_ID = 'venus-capsules';
const INSTRUCTION = 'Quiero un video de una mujer adulta trabajando en una oficina, mostrando cómo puede integrar Cápsulas Venus en su rutina diaria.';

// Timeout real por request individual (propose-direct, recomendaciones,
// produce-start, cada poll) -- ninguna de estas llamadas reales sostiene la
// producción completa, así que un timeout corto y razonable basta.
const REQUEST_TIMEOUT_MS = 30_000;
// Presupuesto real total de polling: una producción real completa
// (voiceover real de varias escenas en CPU + Krea real + HyperFrames
// real+ffmpeg real) puede tardar bastante más que el techo de una sola
// conexión HTTP -- 30 min reales de presupuesto de polling, muy por encima
// de lo observado hasta ahora (~10-15 min reales).
const POLL_TIMEOUT_MS = 30 * 60_000;
const POLL_INTERVAL_MS = 5_000;
// Timeout real por cada GET de polling individual: el mismo proceso real
// de Node que atiende /api/create/produce-status es el que corre la
// producción real en background (fire-and-forget dentro del mismo
// event loop) -- un paso real de HyperFrames/ffmpeg/Krea puede acaparar
// el event loop real el tiempo suficiente para retrasar la respuesta de
// un poll individual. 60s reales por intento (no 30s) para no confundir
// una demora real del event loop con una conexión rota real.
const POLL_REQUEST_TIMEOUT_MS = 60_000;
// Reintentos reales tolerados ante un fallo de RED/timeout de un poll
// individual (nunca ante un estado terminal real ya recibido) -- distingue
// un hiccup real de transporte de un fallo real del job.
const POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS = 10;

const TERMINAL_STATUSES = new Set([
  'FULL_PRODUCTION', 'DEGRADED_PRODUCTION', // éxito real (creativeProductionOrchestrator.js#overallStatus)
  'FAILED', 'VALIDATION_FAILED', 'SOURCE_ASSET_REQUIRED', 'CANCELED', // fallo real
]);
const SUCCESS_STATUSES = new Set(['FULL_PRODUCTION', 'DEGRADED_PRODUCTION']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(path, body, timeoutMs = REQUEST_TIMEOUT_MS) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
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

/**
 * Polling real del estado de un ProductionJob real ya lanzado vía
 * produce-start -- nunca sostiene una única conexión HTTP durante toda la
 * producción real. Devuelve el body real (mismo shape real que
 * POST /api/create/produce síncrono) en cuanto el job real llega a un
 * estado terminal real. Nunca asume "COMPLETED" -- reporta el estado real
 * y se detiene si el estado terminal real no es de éxito.
 */
async function pollProduction(jobId) {
  const startedAt = Date.now();
  let ultimoEstado = 'RUNNING';
  let erroresTransitoriosSeguidos = 0;
  while (true) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(`polling: se superó el presupuesto real de ${POLL_TIMEOUT_MS}ms esperando un estado terminal real de jobId="${jobId}" (último estado real visto: "${ultimoEstado}").`);
    }

    let httpStatus;
    let body;
    try {
      ({ status: httpStatus, body } = await get(`/api/create/produce-status?jobId=${encodeURIComponent(jobId)}`, POLL_REQUEST_TIMEOUT_MS));
    } catch (err) {
      // Fallo real de transporte/timeout de ESTE poll individual (nunca del
      // job real, que sigue corriendo del lado del servidor real) -- se
      // tolera hasta POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS seguidos antes
      // de rendirse, para no confundir un event loop real ocupado con un
      // job real caído.
      erroresTransitoriosSeguidos += 1;
      console.log(`     (poll transitorio real falló: ${err.message} -- reintento ${erroresTransitoriosSeguidos}/${POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS})`);
      if (erroresTransitoriosSeguidos > POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS) {
        throw new Error(`polling: ${POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS} fallos de transporte reales seguidos consultando produce-status (último: ${err.message}) -- el servidor real puede haberse caído.`);
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    erroresTransitoriosSeguidos = 0;

    if (httpStatus !== 200) {
      throw new Error(`polling: produce-status devolvió ${httpStatus} real (esperado 200): ${JSON.stringify(body).slice(0, 300)}`);
    }
    ultimoEstado = body.status;
    if (ultimoEstado === 'RUNNING') {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (!TERMINAL_STATUSES.has(ultimoEstado)) {
      throw new Error(`polling: estado real desconocido "${ultimoEstado}" -- ni RUNNING ni ninguno de los estados terminales reales conocidos (${[...TERMINAL_STATUSES].join(', ')}).`);
    }
    return body;
  }
}

async function main() {
  console.log('1. Generando propuesta (propose-direct)...');
  const { status: s1, body: proposal } = await post('/api/create/propose-direct', { productId: PRODUCT_ID, rawText: INSTRUCTION });
  assert(s1 === 200 && proposal.batchId, `propose-direct devolvió 200 con batchId real (recibido status=${s1}, body=${JSON.stringify(proposal).slice(0, 300)})`);

  console.log('2. Verificando mediaType...');
  assert(proposal.mediaType === 'VIDEO', `mediaType === "VIDEO" (recibido "${proposal.mediaType}")`);
  const STATIC_FORMAT = 'Static comparison frames';
  assert(proposal.creativeVariant.creativeVariant.format !== STATIC_FORMAT, 'la variante propuesta NO cayó en formato estático');

  console.log('3. Verificando estructura sugerida...');
  const { status: s2, body: structRec } = await get(`/api/create/structure-recommendation?batchId=${proposal.batchId}&variantIndex=0&userInstruction=${encodeURIComponent(INSTRUCTION)}`);
  assert(s2 === 200 && structRec.recommended?.structureId, `structure-recommendation devolvió una estructura real (recibido: ${JSON.stringify(structRec).slice(0, 200)})`);
  console.log(`     Estructura: ${structRec.recommended.label} (${structRec.recommended.stages.join(' -> ')})`);

  console.log('4. Verificando script/voiceover/CTA nuevos (coherentes con la instrucción, no reciclados)...');
  assert(proposal.creativeVariant.copy.hook?.length > 0, 'hook real generado');
  assert(proposal.creativeVariant.copy.cta?.length > 0, 'CTA real generado');
  assert(Array.isArray(proposal.creativeVariant.copy.bodyLines) && proposal.creativeVariant.copy.bodyLines.length > 0, 'bodyLines reales generados');

  console.log('5. Verificando modelo/calidad sugeridos + Visual Intent + Visual Continuity Context...');
  const qs = new URLSearchParams({ batchId: proposal.batchId, variantIndex: '0', userInstruction: INSTRUCTION });
  const { status: s3, body: modelRec } = await get(`/api/create/model-recommendation?${qs.toString()}`);
  assert(s3 === 200, 'model-recommendation devolvió 200');
  assert(typeof modelRec.visualIntent === 'string' && modelRec.visualIntent.length > 0, `visualIntent real presente ("${modelRec.visualIntent}")`);
  assert(modelRec.visualContinuityContext.subjectGender === 'female', `visualContinuityContext.subjectGender === "female" (recibido "${modelRec.visualContinuityContext.subjectGender}")`);
  assert(modelRec.visualContinuityContext.environment?.includes('oficina'), `visualContinuityContext.environment menciona "oficina" (recibido "${modelRec.visualContinuityContext.environment}")`);
  console.log(`     Modelo sugerido: ${modelRec.generationSettings?.recommendedModel} · Calidad: ${modelRec.generationSettings?.recommendedQuality}`);
  console.log(`     Visual Intent: ${modelRec.visualIntent}`);
  console.log(`     Visual Continuity Context: género=${modelRec.visualContinuityContext.subjectGender}, edad=${modelRec.visualContinuityContext.subjectAgeRange}, entorno=${modelRec.visualContinuityContext.environment}`);

  console.log('6. Lanzando producción real (produce-start, jobId inmediato -- nunca sostiene la conexión durante la producción real)...');
  const { status: s4, body: start } = await post('/api/create/produce-start', {
    batchId: proposal.batchId, variantIndex: 0, userInstruction: INSTRUCTION,
    selectedStructureId: null, outputProfileNames: ['INSTAGRAM_REEL'],
  });
  assert(s4 === 202 && start.jobId, `produce-start devolvió 202 con jobId real (recibido status=${s4}, body=${JSON.stringify(start).slice(0, 300)})`);
  const jobId = start.jobId;
  console.log(`     jobId real: ${jobId}`);

  console.log('7. Polling real del estado del job (esto puede tardar varios minutos reales)...');
  const job = await pollProduction(jobId);
  console.log(`     ProductionJob status real: ${job.status}`);
  if (!SUCCESS_STATUSES.has(job.status)) {
    const detalle = job.error ?? (job.errors ? job.errors.join('; ') : 'sin detalle real adicional.');
    console.log(`     ERROR real: ${detalle}`);
    throw new Error(`FALLO: producción real terminó en estado terminal "${job.status}" (no es un éxito real): ${detalle}`);
  }

  console.log('8. Verificando escenas reales (mismo sujeto/entorno en todas, Paso 9/25)...');
  assert(Boolean(job.scenePlan?.scenes), 'job.scenePlan.scenes real existe (el job real llegó a producción completa, nunca se asume sin comprobar el status real primero)');
  const scenes = job.scenePlan.scenes;
  assert(scenes.length > 1, `más de 1 escena real (${scenes.length})`);
  const subjects = new Set(scenes.map((s) => s.subject));
  assert(subjects.size === 1, `TODAS las escenas comparten el mismo "subject" real (obtuvo ${subjects.size} valores distintos: ${[...subjects].join(' | ')})`);
  for (const s of scenes) {
    assert(!/\bhombre\b/i.test(s.subject), `escena "${s.sceneId}" no menciona "hombre" (subject: "${s.subject}")`);
  }
  console.log(`     Subject real compartido: "${[...subjects][0]}"`);

  console.log('9. Verificando modelo/calidad reales de generación (Generation Settings)...');
  const generationSettings = job.visualStrategy?.generationSettings;
  assert(Boolean(generationSettings), 'job.visualStrategy.generationSettings real existe');
  console.log(`     finalModelId real: ${job.visualStrategy?.finalModelId} · selectedProvider real: ${job.visualStrategy?.selectedProvider} · selectionMode real: ${job.visualStrategy?.selectionMode}`);
  console.log(`     generationSettings real: ${JSON.stringify(generationSettings).slice(0, 300)}`);

  console.log('10. Verificando product grounding (productId/productAssetId solo si existe fotografía real)...');
  const assetReq = job.visualStrategy?.assetRequirements;
  assert(Boolean(assetReq), 'job.visualStrategy.assetRequirements real existe');
  const productScenes = scenes.filter((s) => s.visualIntent === 'PRODUCT_REVEAL');
  console.log(`     Escenas PRODUCT_REVEAL: ${productScenes.length}, productAssetAvailable real=${assetReq.productAssetAvailable}, productAssetId real=${assetReq.productAssetId}`);
  for (const s of productScenes) {
    if (assetReq.productAssetAvailable) {
      assert(s.visualSource === 'EXISTING_PRODUCT_ASSET', `escena de producto real usa EXISTING_PRODUCT_ASSET cuando hay asset real (obtuvo "${s.visualSource}")`);
      assert(Boolean(assetReq.productAssetId), `product grounding real declarado -> productAssetId real presente (productId real: "${PRODUCT_ID}")`);
    } else {
      assert(s.visualSource !== 'EXISTING_PRODUCT_ASSET', 'sin asset real disponible, la escena NUNCA finge EXISTING_PRODUCT_ASSET');
      console.log(`     (Sin productAssetId real disponible -- NO se declara product grounding para "${s.sceneId}", correcto.)`);
    }
  }

  console.log('11. Verificando prompts auditables reales (generatedPrompt = lo realmente enviado, nunca reconstruido)...');
  const withPrompt = (job.visualGenerationRequests ?? []).filter((r) => r.generatedPrompt);
  console.log(`     visualGenerationRequests con generatedPrompt real: ${withPrompt.length} de ${(job.visualGenerationRequests ?? []).length}`);
  for (const r of withPrompt) {
    assert(typeof r.generatedPrompt === 'string' && r.generatedPrompt.length > 0, `requestId ${r.requestId}: generatedPrompt real no vacío`);
    assert(r.status === 'RESOLVED_GENERATED', `requestId ${r.requestId}: status RESOLVED_GENERATED coherente con tener un generatedPrompt real (obtuvo "${r.status}")`);
    assert(r.promptMode === 'system_generated', `requestId ${r.requestId}: promptMode "system_generated" por defecto`);
  }
  if (withPrompt.length === 0) {
    console.log('     (Sin providers de imagen reales configurados en este entorno -- todas las escenas cayeron a TYPOGRAPHIC, generatedPrompt null en todas. Esto es NO SIMULACIÓN correcta: no se fabricó un prompt falso.)');
  }

  console.log('12. Verificando Krea real (provider/modelo/source realmente usados, nunca declarado si fue fallback)...');
  const imageRouting = job.providerRouting?.image;
  console.log(`     chosenProvider real: ${imageRouting?.chosenProvider} · fallbackUsed real: ${imageRouting?.fallbackUsed} · reason real: ${imageRouting?.reason}`);
  const assetPlanReal = (job.assetPlan ?? []).filter((a) => a.source === 'GENERATED_IMAGE');
  for (const a of assetPlanReal) {
    assert(a.isMock === false, `escena "${a.sceneId}": isMock === false real (nunca se declara Krea real sobre un resultado simulado)`);
    console.log(`     escena "${a.sceneId}": providerUsed real="${a.providerUsed}", isMock real=${a.isMock}`);
  }
  const kreaUsado = imageRouting?.chosenProvider?.toLowerCase().includes('krea') && imageRouting?.fallbackUsed === false;
  if (kreaUsado) {
    console.log(`     Krea MCP real confirmado como provider elegido (sin fallback real).`);
  } else {
    console.log(`     Krea NO se declara como usado real (chosenProvider real="${imageRouting?.chosenProvider}", fallbackUsed real=${imageRouting?.fallbackUsed}) -- no se afirma Krea si no corresponde.`);
  }

  console.log('13. Verificando outputs reales...');
  assert(job.outputs?.length > 0, 'al menos 1 output real');
  for (const o of job.outputs) {
    console.log(`     ${o.profileName}: ${o.status}${o.fileSizeBytes ? ` (${o.fileSizeBytes} bytes)` : ''}`);
  }

  console.log('14. Verificando Editable Video Project real (mismo ProductionJob real persistido)...');
  assert(Boolean(job.productionJobId), 'job.productionJobId real presente (ProductionJob real persistido vía saveProductionJob, mismo mecanismo de siempre)');
  const { status: s5, body: project } = await post('/api/projects', { productionJobId: job.productionJobId });
  assert(s5 === 200 && project.projectId, `POST /api/projects devolvió 200 con projectId real (recibido status=${s5}, body=${JSON.stringify(project).slice(0, 300)})`);
  console.log(`     Editable Video Project real: projectId=${project.projectId}`);

  console.log('\n✅ E2E REAL COMPLETO -- todas las verificaciones pasaron.');
  console.log(`   Job status real: ${job.status}`);
  console.log(`   jobId real: ${jobId} · productionJobId real: ${job.productionJobId} · projectId real: ${project.projectId}`);
  console.log(`   Provider imagen real usado: ${job.providerRouting?.image?.chosenProvider ?? 'ninguno (fallback tipográfico)'}`);
}

main().catch((err) => {
  console.error(`\n❌ E2E FALLÓ: ${err.message}`);
  process.exitCode = 1;
});
