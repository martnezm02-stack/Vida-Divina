// real-e2e-crear-contenido-v2.mjs — Corrección "Flujo creativo integral"
// (2026-08-28), Paso 35 del encargo. E2E REAL manual (no forma parte de
// `npm test`, mismo criterio que los demás real-e2e-*.mjs): produce UNA
// pieza real (V1), abre su Editable Video Project, hace una edición real
// (cambia el estilo de captions de una escena) + regenera la voz real de
// una escena, y RENDERIZA -- confirma que eso, y SOLO eso, produce una V2
// real (nunca la sola regeneración de voz).
//
// Uso: node test/real-e2e-crear-contenido-v2.mjs

const BASE = 'http://localhost:4310';
const PRODUCT_ID = 'venus-capsules';
const INSTRUCTION = 'Quiero un video de una mujer adulta trabajando en una oficina, mostrando cómo puede integrar Cápsulas Venus en su rutina diaria.';

const REQUEST_TIMEOUT_MS = 30_000;
const POLL_REQUEST_TIMEOUT_MS = 60_000;
const POLL_TIMEOUT_MS = 30 * 60_000;
const POLL_INTERVAL_MS = 5_000;
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
  let erroresSeguidos = 0;
  while (true) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) throw new Error(`polling: timeout esperando jobId="${jobId}" (último: "${ultimoEstado}").`);
    let httpStatus; let body;
    try {
      ({ status: httpStatus, body } = await get(`/api/create/produce-status?jobId=${encodeURIComponent(jobId)}`, POLL_REQUEST_TIMEOUT_MS));
    } catch (err) {
      erroresSeguidos += 1;
      if (erroresSeguidos > 10) throw new Error(`polling: demasiados fallos de transporte reales seguidos: ${err.message}`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    erroresSeguidos = 0;
    if (httpStatus !== 200) throw new Error(`polling: produce-status devolvió ${httpStatus}: ${JSON.stringify(body).slice(0, 300)}`);
    ultimoEstado = body.status;
    if (ultimoEstado === 'RUNNING') { await sleep(POLL_INTERVAL_MS); continue; }
    if (!TERMINAL_STATUSES.has(ultimoEstado)) throw new Error(`polling: estado desconocido "${ultimoEstado}".`);
    return body;
  }
}

async function main() {
  console.log('1. Produciendo V1 real (mismo flujo ya validado)...');
  const { body: proposal } = await post('/api/create/propose-direct', { productId: PRODUCT_ID, rawText: INSTRUCTION });
  assert(Boolean(proposal.batchId), 'propose-direct real devolvió batchId');
  const { body: start } = await post('/api/create/produce-start', {
    batchId: proposal.batchId, variantIndex: 0, userInstruction: INSTRUCTION, selectedStructureId: null, outputProfileNames: ['INSTAGRAM_REEL'],
  });
  assert(Boolean(start.jobId), 'produce-start real devolvió jobId');
  console.log(`     jobId real: ${start.jobId} -- esperando producción real (varios minutos)...`);
  const job = await pollProduction(start.jobId);
  assert(SUCCESS_STATUSES.has(job.status), `V1 real terminó en éxito real (obtuvo "${job.status}": ${job.error ?? job.errors?.join('; ') ?? ''})`);
  assert(Boolean(job.productionJobId), 'V1 real trae productionJobId real');
  const v1Output = job.outputs.find((o) => o.outputPath);
  assert(Boolean(v1Output), 'V1 real trae al menos 1 output real con outputPath');
  console.log(`     V1 real: productionJobId=${job.productionJobId}, output real="${v1Output.outputPath}"`);

  console.log('2. Abriendo V1 como Editable Video Project real...');
  const { status: sProj, body: project } = await post('/api/projects', { productionJobId: job.productionJobId });
  assert(sProj === 200 && Boolean(project.projectId), `POST /api/projects real devolvió 200 con projectId real (status=${sProj})`);
  assert(project.versions.length === 1, `proyecto real recién abierto tiene EXACTAMENTE 1 versión real (obtuvo ${project.versions.length})`);
  const v1VersionOutputPath = project.versions[0].outputs[0].outputPath;
  console.log(`     projectId real: ${project.projectId}`);

  console.log('3. Editando una escena real (captionStyleOverride) -- draft real, sin renderizar todavía...');
  const primeraEscena = project.scenes[0];
  const { status: sEdit, body: editBody } = await post(`/api/projects/${project.projectId}/edit`, {
    scenes: { [primeraEscena.sceneId]: { captionStyleOverride: { position: 'TOP' } } },
  });
  assert(sEdit === 200 && Boolean(editBody.pendingChangeset), 'edición real de escena devolvió 200 con pendingChangeset real');
  assert(editBody.project.versions.length === 1, 'la edición real del draft NO crea una versión real todavía (sigue en 1)');

  console.log('4. Regenerando la voz real de una escena -- SOLO debe quedar como cambio pendiente del draft (Paso 36 del encargo)...');
  const { status: sVoice, body: voiceBody } = await post(`/api/projects/${project.projectId}/scenes/${primeraEscena.sceneId}/regenerate-voice`, {
    voiceoverText: primeraEscena.narration,
  }, 10 * 60_000); // Voice Engine real en CPU puede tardar varios minutos reales por generación (mismo criterio ya validado en el resto de este proyecto).
  if (sVoice === 200 && voiceBody.status === 'SOURCE_ASSET_REQUIRED') {
    console.log(`     (Voice Engine no disponible real: ${voiceBody.error} -- se continúa SOLO con la edición de captions, el punto crítico de esta prueba real es el RENDER, no la voz.)`);
  } else {
    assert(sVoice === 200 && Boolean(voiceBody.project), `regenerar voz real devolvió 200 con proyecto real actualizado (status=${sVoice})`);
    assert(voiceBody.project.versions.length === 1, 'CRÍTICO (Paso 19/36 del encargo): regenerar voz real NO crea una versión real nueva por sí sola (sigue en 1)');
  }

  console.log('5. Renderizando -- esto SÍ debe crear V2 real (esto puede tardar varios minutos reales)...');
  const { status: sRender, body: renderBody } = await post(`/api/projects/${project.projectId}/render`, { mode: 'RENDER' }, 20 * 60_000);
  assert(sRender === 200, `render real devolvió 200 (status=${sRender})`);
  assert(renderBody.version.status !== 'FAILED', `V2 real no falló (status real: ${renderBody.version.status}, error: ${renderBody.version.error ?? 'ninguno'})`);
  assert(renderBody.version.versionNumber === 2, `V2 real tiene versionNumber real === 2 (obtuvo ${renderBody.version.versionNumber})`);
  assert(renderBody.project.versions.length === 2, `el proyecto real ahora tiene EXACTAMENTE 2 versiones reales (obtuvo ${renderBody.project.versions.length})`);

  console.log('6. Verificando V2 real...');
  const v2 = renderBody.version;
  const v2Output = v2.outputs.find((o) => o.outputPath);
  assert(Boolean(v2Output), 'V2 real trae al menos 1 output real con outputPath');
  assert(v2Output.outputPath !== v1VersionOutputPath, `V2 real tiene un archivo FÍSICO DISTINTO de V1 real (nunca sobrescribe V1)\n     V1: ${v1VersionOutputPath}\n     V2: ${v2Output.outputPath}`);
  assert(Boolean(v2.productionJobId), 'V2 real tiene productionJobId real propio (Paso 20/21 del encargo)');
  assert(v2.productionJobId !== job.productionJobId, 'el productionJobId real de V2 es DISTINTO del de V1');
  assert(Boolean(v2.previousProductionJobId), 'V2 real trae lineage real hacia la versión anterior (previousProductionJobId)');
  assert(v2.previousProductionJobId === job.productionJobId, `lineage real de V2 apunta exactamente al productionJobId real de V1 (obtuvo "${v2.previousProductionJobId}")`);
  assert(Boolean(v2Output.displayName), `V2 real trae displayName humano real (obtuvo "${v2Output.displayName}")`);
  assert(/v2$/.test(v2Output.displayName), `displayName real de V2 termina en "v2" (obtuvo "${v2Output.displayName}")`);

  console.log('7. Verificando que V1 real sigue INTACTA (nunca modificada por el render de V2)...');
  const { status: sV1After, body: projectAfter } = await post('/api/projects', { productionJobId: job.productionJobId });
  assert(sV1After === 200, 'V1 real sigue recuperable vía su ProductionJob original');
  assert(projectAfter.versions[0].outputs[0].outputPath === v1VersionOutputPath, 'V1 real (versions[0]) sigue apuntando EXACTAMENTE al mismo archivo real de antes');

  console.log('8. Verificando físicamente en disco (Assets real, vía filesystem) que V2 es un archivo real distinto...');
  const fs = await import('node:fs');
  assert(fs.existsSync(v1VersionOutputPath), 'archivo real de V1 existe físicamente en disco');
  assert(fs.existsSync(v2Output.outputPath), 'archivo real de V2 existe físicamente en disco');

  console.log('\n✅ E2E REAL V2 COMPLETO -- V1 intacta, V2 real generada con lineage/productionJobId/displayName correctos.');
  console.log(`   V1 productionJobId: ${job.productionJobId} · output: ${v1VersionOutputPath}`);
  console.log(`   V2 productionJobId: ${v2.productionJobId} · output: ${v2Output.outputPath} · displayName: ${v2Output.displayName}`);
}

main().catch((err) => {
  console.error(`\n❌ E2E FALLÓ: ${err.message}`);
  process.exitCode = 1;
});
