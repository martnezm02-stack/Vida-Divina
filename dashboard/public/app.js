// app.js — frontend vanilla, sin build step. Toda la generación real pasa
// por fetch() hacia la API local (server/routes/*.js), que a su vez llama
// al Content Generation Engine real. Este archivo nunca genera contenido
// por sí mismo -- solo arma la solicitud y muestra el resultado real.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({ error: 'Respuesta no válida del servidor.' }));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

// ---------------- Navegación ----------------
function goto(view) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${view}`).classList.remove('hidden');
  $$('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'assets') loadAssets();
  if (view === 'products') loadProducts();
  if (view === 'campaigns') { loadCampaigns(); initMarketingCampaignForm(); loadMarketingCampaigns(); }
  if (view === 'edit') loadEditSources();
  if (view === 'adapt') loadAdaptSources();
  if (view === 'calendar') loadCalendar();
  if (view === 'performance') loadPerformanceAnalysis();
  if (view === 'attribution') loadAttribution();
  if (view === 'intelligence') loadIntelligence();
  if (view === 'learning') loadLearning();
  if (view === 'decisions') loadStrategyDecisions();
  if (view === 'content-plans') { loadContentPlans(); loadAutoPublishStatus(); }
  if (view === 'home') loadCommandCenter();
  if (view === 'autocreate') initAutocreateProductSelect();
  if (view === 'review') loadReviewQueue();
  if (view === 'whatsapp') { loadWhatsappStatus(); loadWhatsappInbox(); }
}
$$('.navbtn').forEach((b) => b.addEventListener('click', () => goto(b.dataset.view)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => goto(b.dataset.goto)));

// ---------------- Estado del motor (home) ----------------
async function loadEngineStatus() {
  const el = $('#engine-status');
  try {
    const { voiceEngineReachable } = await api('/api/audio-assets');
    el.textContent = voiceEngineReachable
      ? 'Content Generation Engine conectado. Voice Engine activo — puede generar voz nueva.'
      : 'Content Generation Engine conectado. Voice Engine no está corriendo — se usarán Audio Assets ya generados.';
    el.classList.add(voiceEngineReachable ? 'ok' : 'warn');
  } catch (err) {
    el.textContent = `No se pudo conectar con el motor real: ${err.message}`;
    el.classList.add('warn');
  }
}

// ---------------- VIDA DIVINA COMMAND CENTER (Fase 14, Parte 2) ----------------
function pill(up, labelUp = 'OK', labelDown = 'DOWN') {
  return `<span class="cc-pill ${up ? 'up' : 'down'}">${up ? labelUp : labelDown}</span>`;
}
async function loadCommandCenter() {
  const el = $('#command-center-grid');
  el.innerHTML = '<p class="placeholder">Cargando estado real…</p>';
  try {
    const s = await api('/api/system-status');
    const cards = [
      `<div class="cc-card"><div class="cc-title">Content Generation</div>${pill(true, 'OPERATIVO')}
        <div class="cc-detail">Voice Engine: ${pill(s.contentGeneration.voiceEngineReachable, 'ACTIVO', 'NO CORRIENDO')}</div></div>`,
      `<div class="cc-card"><div class="cc-title">Instagram</div>${pill(s.publishing.instagram.configured, 'CONFIGURADO', 'SIN CONFIGURAR')}</div>`,
      `<div class="cc-card"><div class="cc-title">Facebook</div>${pill(s.publishing.facebook.configured, 'CONFIGURADO', 'SIN CONFIGURAR')}</div>`,
      `<div class="cc-card"><div class="cc-title">Publishing (Media Hosting)</div>${pill(s.publishing.mediaHosting.configured, 'CONFIGURADO', 'SIN CONFIGURAR')}</div>`,
      `<div class="cc-card"><div class="cc-title">Performance</div>${pill(s.performance.hasData, 'CON DATOS', 'SIN DATOS TODAVÍA')}
        <div class="cc-detail">${s.performance.publishedCount} publicaciones registradas · ${s.performance.observationCount} observaciones</div></div>`,
      `<div class="cc-card cc-autopublish"><div class="cc-title">Auto Publish</div>
        <div class="cc-autopublish-row">
          <span class="cc-pill ${s.autoPublish.enabled ? 'up' : 'down'}">AUTO PUBLISH: ${s.autoPublish.enabled ? 'ON' : 'OFF'}</span>
          <span class="cc-pill ${s.autoPublish.readiness === 'READY' ? 'up' : 'down'}">READINESS: ${s.autoPublish.readiness === 'READY' ? 'READY' : 'NOT READY'}</span>
          ${s.autoPublish.enabled ? `<span class="cc-detail">activado por ${s.autoPublish.actorId}</span>` : ''}
        </div>
        ${s.autoPublish.readiness !== 'READY' ? `<ul class="cc-reasons">${s.autoPublish.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}
      </div>`,
    ];
    el.innerHTML = cards.join('');
  } catch (err) {
    el.innerHTML = `<p class="empty-state">No se pudo cargar el estado real: ${err.message}</p>`;
  }
}

// ---------------- CREATE ----------------
let productsCache = [];
async function initCreateForm() {
  productsCache = await api('/api/products');
  const productSel = $('#create-product');
  productSel.innerHTML = productsCache.map((p) => `<option value="${p.productSlug}">${p.nombreComercial ?? p.productSlug}${p.factsAvailable ? '' : ' (sin catálogo real)'}</option>`).join('');
  updateCreateImages();
  productSel.addEventListener('change', updateCreateImages);
  $('#create-image').addEventListener('change', updateCreateProductBodyVisibility);

  const { existingAudioAssets } = await api('/api/audio-assets');
  const audioSel = $('#create-audio-existing');
  audioSel.innerHTML = existingAudioAssets.map((a) => `<option value="${a.path}">${a.filename} (${a.durationSeconds ?? '?'}s)</option>`).join('') || '<option value="">Ningún Audio Asset real disponible</option>';

  const profiles = await api('/api/output-profiles');
  $('#create-profiles').innerHTML = profiles.filter((p) => p.kind === 'VIDEO').map((p) => `<label><input type="checkbox" name="profile" value="${p.name}" ${p.name === 'INSTAGRAM_REEL' ? 'checked' : ''}/> ${p.name}</label>`).join('');

  // Fix "Audio Source / Voiceover Consistency" (2026-08-23): "existing" es
  // una elección DELIBERADA del usuario -- cuando la hace a mano, se toma
  // una foto del voiceoverText vigente en ese momento como "consistente".
  // Si el texto cambia después sin que el usuario vuelva a confirmar
  // "existing", updateAudioConsistencyUI() lo detecta y avisa (Parte 3/5).
  const audioSourceSel = $('#create-audio-source');
  audioSourceSel.addEventListener('change', (e) => {
    const form = $('#create-form');
    $('#create-audio-existing-wrap').classList.toggle('hidden', e.target.value !== 'existing');
    if (e.target.value === 'existing') form.dataset.audioConsistentText = form.voiceoverText.value;
    updateAudioConsistencyUI(form);
  });
  updateAudioConsistencyUI($('#create-form'));
}

/**
 * Fix "Audio Source / Voiceover Consistency" (2026-08-23), Partes 3/4/5/7:
 * regla principal -- NUEVO VOICEOVER debe implicar GENERAR NUEVO AUDIO,
 * nunca reutilizar en silencio un Audio Asset existente que ya no
 * corresponde al texto actual. "generate" es siempre consistente por
 * construcción (Voice Engine recibe el texto vigente al momento de
 * enviar, ver el submit handler más abajo) -- el mismatch solo puede
 * existir en modo "existing", comparado contra
 * form.dataset.audioConsistentText (la foto del texto tomada cuando el
 * usuario eligió "existing" a propósito). No se calcula un hash: dos
 * strings en el mismo DOM se comparan igual de bien con "===" que con un
 * hash, sin la complejidad de crypto.subtle async dentro de un listener
 * síncrono de UI.
 */
function updateAudioConsistencyUI(form) {
  const hintEl = $('#create-audio-hint');
  if (!hintEl || !form) return;
  const mode = form.audioSource.value;
  hintEl.classList.remove('warning');
  if (mode === 'generate') {
    form.dataset.audioMismatch = 'false';
    hintEl.textContent = 'Se generará una nueva voz usando el voice-over actual.';
    return;
  }
  const consistentText = form.dataset.audioConsistentText ?? '';
  const mismatch = form.voiceoverText.value !== consistentText;
  form.dataset.audioMismatch = String(mismatch);
  if (mismatch) {
    hintEl.classList.add('warning');
    hintEl.innerHTML = 'El texto del voice-over cambió, pero estás usando un audio existente. El audio no se actualizará automáticamente. <button type="button" class="btn-secondary" id="create-audio-regenerate-btn">Generar nuevo audio</button>';
    $('#create-audio-regenerate-btn', hintEl).addEventListener('click', () => {
      form.audioSource.value = 'generate';
      $('#create-audio-existing-wrap').classList.add('hidden');
      updateAudioConsistencyUI(form);
    });
  } else {
    hintEl.textContent = 'Este audio no se regenerará si cambia el texto.';
  }
}

function updateCreateImages() {
  const slug = $('#create-product').value;
  const product = productsCache.find((p) => p.productSlug === slug);
  const sel = $('#create-image');
  const reales = (product?.rawAssets ?? []).filter((a) => a.status === 'PRODUCT_REFERENCE_AVAILABLE');
  sel.innerHTML = '<option value="">(sin fotografía)</option>' + reales.map((a) => `<option value="${a.sourcePath}">${a.originalFilename}</option>`).join('');
  updateCreateProductBodyVisibility();
}

function updateCreateProductBodyVisibility() {
  const sinFoto = !$('#create-image').value;
  const wrap = $('#create-product-body-wrap');
  const textarea = $('#create-product-body');
  wrap.classList.toggle('hidden', !sinFoto);
  textarea.required = sinFoto;
}

$('#create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const resultEl = $('#create-result');
  const outputProfileNames = $$('input[name="profile"]:checked', form).map((c) => c.value);

  btn.disabled = true; btn.textContent = 'GENERANDO…';
  resultEl.innerHTML = '<p class="placeholder">Produciendo contenido real (HyperFrames + PostProduction)…</p>';

  try {
    const body = {
      mode: form.mode.value,
      productId: form.productId.value,
      rawText: form.rawText.value,
      hookText: form.hookText.value,
      voiceoverText: form.voiceoverText.value,
      voiceoverSource: form.voiceoverSource.value || 'GENERATED',
      ctaText: form.ctaText.value,
      imageAssetPath: form.imageAssetPath.value || null,
      productBody: form.productBody.value || null,
      audioSource: form.audioSource.value,
      audioAssetPath: form.audioAssetPath.value,
      audioTextMismatch: form.dataset.audioMismatch === 'true',
      outputProfileNames,
    };
    const result = await api('/api/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    renderFinalAssetPackage(resultEl, result, { hookText: body.hookText, voiceoverText: body.voiceoverText, voiceoverSource: body.voiceoverSource, ctaText: body.ctaText, audioSource: body.audioSource });
  } catch (err) {
    resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
  } finally {
    btn.disabled = false; btn.textContent = 'GENERAR';
  }
});

// Fase 16, Parte 11: "Sugerir variantes (hipótesis)" en Crear Contenido --
// mismo hypothesisCreativeEngine que Crear Autónomo (nunca un segundo
// motor, ver dashboard/server/routes/generation.js#handleSuggestHypothesisVariants).
const createSuggestBtn = $('#create-suggest-hypothesis-btn');
if (createSuggestBtn) {
  createSuggestBtn.addEventListener('click', async () => {
    const form = $('#create-form');
    const container = $('#create-hypothesis-suggestions');
    const productId = form.productId.value;
    if (!productId) {
      container.classList.remove('hidden');
      container.innerHTML = '<p class="placeholder">Selecciona un producto real primero.</p>';
      return;
    }
    createSuggestBtn.disabled = true; createSuggestBtn.textContent = 'GENERANDO HIPÓTESIS…';
    container.classList.remove('hidden');
    container.innerHTML = '<p class="placeholder">Consultando Product Facts reales y construyendo hipótesis…</p>';
    try {
      const result = await api('/api/create/suggest-hypothesis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) });
      if (result.status !== 'HYPOTHESIS_EXPERIMENT_READY') {
        container.innerHTML = `<div class="result-status MISSING_CREATIVE_MATCH">${result.status}</div><p>${(result.errors ?? [result.reason]).join(' ')}</p>`;
        return;
      }
      container.innerHTML = renderHypothesisExperiment(result);
      container.querySelectorAll('.btn-use-variant').forEach((b) => {
        b.addEventListener('click', () => {
          const variant = result.variantsDetail[Number(b.dataset.variantIndex)];
          form.hookText.value = variant.copy.hook ?? '';
          form.ctaText.value = variant.copy.cta ?? '';
          if (form.productBody) form.productBody.value = variant.copy.primaryText ?? '';
          applyVideoScriptToCreateForm(form, variant);
          container.classList.add('hidden');
        });
      });
    } catch (err) {
      container.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
    } finally {
      createSuggestBtn.disabled = false; createSuggestBtn.textContent = 'SUGERIR VARIANTES (HIPÓTESIS)';
    }
  });
}

// ---------------- EDIT ----------------
async function loadEditSources() {
  const { rawAssets, finalOutputs } = await api('/api/assets');
  const videos = finalOutputs;
  $('#edit-source').innerHTML = videos.map((v) => `<option value="${v.sourcePath}">${v.filename}</option>`).join('') || '<option value="">Sin videos disponibles todavía — usa Crear primero</option>';

  const ops = await api('/api/operations');
  const opsEl = $('#edit-operations');
  const soportadas = ops.supported.map((op) => `<label><input type="checkbox" name="op" value="${op}"/> ${op}</label>`).join('');
  const noSoportadas = ops.unsupported.map((u) => `<label class="unsupported" title="${u.reason}"><input type="checkbox" disabled/> ${u.operation} (no disponible)</label>`).join('');
  opsEl.innerHTML = soportadas + noSoportadas;

  opsEl.addEventListener('change', () => {
    $('#edit-text-overlay-wrap').classList.toggle('hidden', !$$('input[name="op"]:checked', opsEl).some((c) => c.value === 'TEXT_OVERLAY'));
  });
}

$('#edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const resultEl = $('#edit-result');
  const operations = $$('input[name="op"]:checked', form).map((c) => c.value);
  if (operations.length === 0) { resultEl.innerHTML = '<p class="placeholder">Selecciona al menos una operación.</p>'; return; }

  const operationParams = {};
  if (operations.includes('TEXT_OVERLAY')) operationParams.TEXT_OVERLAY = { text: form.textOverlay.value || 'Escríbenos por WhatsApp', position: 'bottom' };

  btn.disabled = true; btn.textContent = 'APLICANDO…';
  resultEl.innerHTML = '<p class="placeholder">Aplicando operaciones reales sobre el video…</p>';
  try {
    const result = await api('/api/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceAssetPath: form.sourceAssetPath.value, operations, operationParams }) });
    renderFinalAssetPackage(resultEl, result);
  } catch (err) {
    resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
  } finally {
    btn.disabled = false; btn.textContent = 'APLICAR OPERACIONES';
  }
});

// ---------------- ADAPT ----------------
async function loadAdaptSources() {
  const { finalOutputs } = await api('/api/assets');
  $('#adapt-source').innerHTML = finalOutputs.map((v) => `<option value="${v.sourcePath}">${v.filename}</option>`).join('') || '<option value="">Sin videos disponibles todavía</option>';

  const profiles = await api('/api/output-profiles');
  $('#adapt-profiles').innerHTML = profiles.map((p) => `<label><input type="checkbox" name="profile" value="${p.name}"/> ${p.name}${p.kind !== 'VIDEO' ? ' (próximamente)' : ''}</label>`).join('');
}

$('#adapt-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const resultEl = $('#adapt-result');
  const outputProfileNames = $$('input[name="profile"]:checked', form).map((c) => c.value);
  if (outputProfileNames.length === 0) { resultEl.innerHTML = '<p class="placeholder">Selecciona al menos un Output Profile.</p>'; return; }

  btn.disabled = true; btn.textContent = 'ADAPTANDO…';
  resultEl.innerHTML = '<p class="placeholder">Derivando versiones reales del mismo video…</p>';
  try {
    const result = await api('/api/adapt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceAssetPath: form.sourceAssetPath.value, outputProfileNames }) });
    renderFinalAssetPackage(resultEl, result);
  } catch (err) {
    resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
  } finally {
    btn.disabled = false; btn.textContent = 'ADAPTAR';
  }
});

// ---------------- Resultado (compartido CREATE/EDIT/ADAPT/Review/Publication Detail) ----------------
// Fase 14, Parte 5/13 -- reutilizado en cualquier vista que necesite mostrar
// un Final Asset Package real (nunca solo JSON): resultado de generación,
// Review Queue, Publication Detail.
function renderAssetPackagePreview(result) {
  let html = '';
  const outputs = result?.outputAssets ?? [];
  for (const out of outputs) {
    const p = out.probe;
    html += `<div class="output-card">
      <h4>${out.outputProfileName ?? 'Resultado'}</h4>
      <div class="meta">${p ? `${p.width}×${p.height} · ${p.fps} · ${Number(p.videoDurationSeconds ?? 0).toFixed(1)}s · ${p.videoCodec}/${p.audioCodec}` : ''}</div>
      ${out.mediaUrl ? `<button class="btn-secondary" data-preview="${out.mediaUrl}" data-preview-source="${out.path ?? ''}">VER PREVIEW</button>` : ''}
    </div>`;
  }
  const slides = result?.assetPackage?.assets ?? [];
  if (slides.length > 0) {
    html += '<div class="carousel-gallery">' + slides.map((s) => `<img src="${s.mediaUrl}" alt="slide ${s.slideIndex}" class="carousel-slide-thumb" />`).join('') + '</div>';
  }
  return html;
}
function bindAssetPreviewButtons(el) {
  $$('[data-preview]', el).forEach((b) => b.addEventListener('click', () => openPreview(b.dataset.preview, b.dataset.previewSource)));
}

// Video Workspace (Fase 14, Parte 6) -- muestra el guion/CTA/audio
// literalmente tal como se enviaron a generar (nunca los inventa: son
// exactamente los campos obligatorios de CREATE, el motor solo los
// renderiza). requestSummary es opcional -- EDIT/ADAPT no tienen guion
// nuevo (reutilizan el asset existente), por eso no lo pasan.
function renderVideoWorkspaceInfo(result, requestSummary) {
  if (!requestSummary) return '';
  // Auditoría "Video Workspace + Voice Engine" (2026-08-23), bug real
  // confirmado: esta línea mostraba "Generado vía Voice Engine" basada en
  // requestSummary.audioSource (lo que se PIDIÓ), nunca en result.audioAssets
  // (lo que REALMENTE se generó) -- así que aparecía igual aunque el audio
  // nunca se hubiera confirmado. Ahora solo afirma éxito cuando
  // result.audioAssets[0] existe de verdad; si no, lo dice explícitamente en
  // vez de dar por hecho un resultado que no está confirmado.
  const audioAsset = result?.audioAssets?.[0]?.path;
  const audioLabel = audioAsset ? audioAsset.split(/[\\/]/).pop() : 'No confirmado (ver estado/errores arriba -- no se generó ningún Audio Asset real en esta solicitud)';
  return `<div class="output-card">
    <h4>Video Workspace</h4>
    ${requestSummary.hookText ? `<div class="meta"><strong>Hook:</strong> ${requestSummary.hookText}</div>` : ''}
    ${requestSummary.voiceoverText ? `<div class="meta"><strong>Guion (voiceover):</strong> ${requestSummary.voiceoverText}</div>` : ''}
    ${requestSummary.voiceoverSource ? `<div class="meta"><strong>Fuente del voiceover:</strong> ${requestSummary.voiceoverSource === 'USER_EDITED' ? 'Editado por el usuario' : 'Generado (Video Script)'}</div>` : ''}
    ${requestSummary.ctaText ? `<div class="meta"><strong>CTA:</strong> ${requestSummary.ctaText}</div>` : ''}
    <div class="meta"><strong>Audio:</strong> ${audioLabel}</div>
  </div>`;
}

function renderFinalAssetPackage(el, result, requestSummary = null) {
  const statusClass = result.status ?? 'ERROR';
  let html = `<div class="result-status ${statusClass}">${statusClass}</div>`;
  // Auditoría "Video Workspace + Voice Engine" (2026-08-23), bug real
  // confirmado: el contrato del backend (finalAssetPackage(),
  // content-orchestrator/src/contentGenerationEngine.js) SIEMPRE devuelve
  // "errors" (arreglo), nunca "error" (singular) -- esta línea comprobaba
  // el campo equivocado y ocultaba en silencio el mensaje real de fallo.
  if ((result.errors ?? []).length > 0) {
    html += `<div class="output-card"><div class="meta"><strong>Stage:</strong> ${result.status ?? 'DESCONOCIDO'}</div><div class="meta"><strong>Error:</strong> ${result.errors.join(' · ')}</div></div>`;
  }
  if (result.warning) html += `<p>${result.warning}</p>`;
  if (result.campaignResolution) {
    html += `<p class="campaign-trace">CreativeCell real: ${result.campaignResolution.creativeCellId} — persona "${result.campaignResolution.personaName}"</p>`;
  }
  html += renderVideoWorkspaceInfo(result, requestSummary);
  html += renderAssetPackagePreview(result);
  if ((result.warnings ?? []).length > 0) html += `<p style="font-size:12px;color:#6b654f;">${result.warnings.join(' · ')}</p>`;
  if (result.status === 'COMPLETED' || result.status === 'PARTIAL') {
    html += '<button class="btn-primary" id="fap-publish-btn">PUBLICAR →</button>';
    html += '<button class="btn-secondary" id="fap-schedule-btn">PROGRAMAR →</button>';
    html += '<button class="btn-secondary" id="fap-campaignplan-btn">REGISTRAR COMO CONTENT PLAN (Campaign Pilot) →</button>';
  }
  el.innerHTML = html;
  bindAssetPreviewButtons(el);
  const publishBtn = $('#fap-publish-btn', el);
  if (publishBtn) publishBtn.addEventListener('click', () => openPublishModal(result));
  const scheduleBtn = $('#fap-schedule-btn', el);
  if (scheduleBtn) scheduleBtn.addEventListener('click', () => openScheduleModal(result));
  const campaignPlanBtn = $('#fap-campaignplan-btn', el);
  if (campaignPlanBtn) campaignPlanBtn.addEventListener('click', () => registerAsContentPlan(result));
}

// ---------------- CAMPAIGN PILOT (Fase 16, Parte 13-17) ----------------
// Registra un Final Asset Package YA renderizado (real, sin re-renderizar)
// como ContentPlan real -- StrategyContext + Quality Gate reales, vía
// planContent() (content-planning/) -- nunca AUTO_PUBLISH desde aquí.
async function registerAsContentPlan(result) {
  const userIntent = prompt('¿Qué campaña/objetivo comercial representa este contenido? (se usa para resolver Strategy Context real)');
  if (!userIntent?.trim()) return;
  const humanReview = confirm('¿Enviar a revisión humana (HUMAN_REVIEW)? Cancelar = solo preparar (PREPARE_ONLY), sin agendar.');
  try {
    const plan = await api('/api/content-plans/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIntent, executionMode: humanReview ? 'HUMAN_REVIEW' : 'PREPARE_ONLY', assetPackage: result }),
    });
    alert(`ContentPlan real creado -- status: ${plan.status}. Puedes verlo en Content Plans / Campañas.`);
  } catch (err) {
    alert(`No se pudo registrar como ContentPlan: ${err.message}`);
  }
}

// ---------------- Preview modal ----------------
async function openPreview(mediaUrl, sourcePath = null) {
  $('#preview-video').src = mediaUrl;
  $('#preview-meta').textContent = 'Cargando metadata real…';
  $('#preview-modal').classList.remove('hidden');
  if (!sourcePath) { $('#preview-meta').textContent = ''; return; }
  try {
    const info = await api(`/api/preview-info?path=${encodeURIComponent(sourcePath)}`);
    const p = info.probe;
    const partes = [];
    if (p?.ok) partes.push(`${p.width}×${p.height}`, p.fps, `${Number(p.videoDurationSeconds ?? 0).toFixed(1)}s`, `${p.videoCodec}/${p.audioCodec}`);
    partes.push(`${(info.fileSizeBytes / 1024 / 1024).toFixed(1)} MB`);
    partes.push(`assetId ${info.assetId.slice(0, 12)}…`);
    if (info.lineage) partes.push(`lineage: ${info.lineage.operation}${info.lineage.outputProfileName ? ` (${info.lineage.outputProfileName})` : ''}`);
    $('#preview-meta').textContent = partes.join(' · ');
  } catch {
    $('#preview-meta').textContent = '';
  }
}
$('#preview-close').addEventListener('click', () => {
  $('#preview-modal').classList.add('hidden');
  $('#preview-video').pause();
  $('#preview-video').src = '';
});

// ---------------- ASSETS (Content Library, Fase 14 Parte 19) ----------------
let assetsCache = { rawAssets: [], finalOutputs: [] };

function rawAssetCard(a) {
  return `<div class="asset-card" data-status="RAW">
    <img src="/media/assets-products/${encodeURIComponent(a.productSlug)}/raw/${encodeURIComponent(a.originalFilename)}" alt="${a.originalFilename}" />
    <div class="body">
      <div class="filename">${a.originalFilename}</div>
      <span class="tag RAW">RAW</span>
      <div class="meta" style="font-size:11px;color:#6b654f;margin-top:4px;">${a.productId} · ${a.width ?? '?'}×${a.height ?? '?'}</div>
    </div>
  </div>`;
}
function outputAssetCard(o) {
  const category = o.lineage ? (o.lineage.operation?.startsWith('ADAPT') ? 'FINAL' : o.lineage.operation?.startsWith('EDIT') ? 'EDITED' : 'GENERATED') : 'FINAL';
  return `<div class="asset-card" data-status="${category}" data-format="${o.lineage?.outputProfileName ?? ''}" data-modified="${o.modifiedAt}">
    <div class="body">
      <div class="filename">${o.filename}</div>
      <span class="tag ${category}">${category}</span>
      ${o.lineage?.outputProfileName ? `<span class="tag" style="background:var(--cream-3);color:var(--soft-black);">${o.lineage.outputProfileName}</span>` : ''}
      <div class="meta" style="font-size:11px;color:#6b654f;margin-top:4px;">${(o.fileSizeBytes / 1024 / 1024).toFixed(1)} MB · ${new Date(o.modifiedAt).toLocaleString()}</div>
      ${o.mediaUrl ? `<button class="btn-secondary" data-preview="${o.mediaUrl}" data-preview-source="${o.sourcePath}">VER</button>` : ''}
    </div>
  </div>`;
}

async function loadAssets() {
  const el = $('#assets-list');
  el.innerHTML = '<p class="placeholder">Cargando…</p>';
  assetsCache = await api('/api/assets');
  const formatSel = $('#assets-format-filter');
  const formats = [...new Set(assetsCache.finalOutputs.map((o) => o.lineage?.outputProfileName).filter(Boolean))];
  formatSel.innerHTML = '<option value="">Todos</option>' + formats.map((f) => `<option value="${f}">${f}</option>`).join('');
  renderAssetsList();
}

function renderAssetsList() {
  const el = $('#assets-list');
  const status = $('#assets-status-filter').value;
  const format = $('#assets-format-filter').value;
  const sinceDate = $('#assets-date-filter').value;

  let rawCards = status && status !== 'RAW' ? '' : assetsCache.rawAssets.map(rawAssetCard).join('');
  let finalOutputs = assetsCache.finalOutputs;
  if (status && status !== 'RAW') finalOutputs = finalOutputs.filter((o) => {
    const category = o.lineage ? (o.lineage.operation?.startsWith('ADAPT') ? 'FINAL' : o.lineage.operation?.startsWith('EDIT') ? 'EDITED' : 'GENERATED') : 'FINAL';
    return category === status;
  });
  if (status === 'RAW') finalOutputs = [];
  if (format) finalOutputs = finalOutputs.filter((o) => o.lineage?.outputProfileName === format);
  if (sinceDate) finalOutputs = finalOutputs.filter((o) => new Date(o.modifiedAt) >= new Date(sinceDate));
  const outputCards = finalOutputs.map(outputAssetCard).join('');

  el.innerHTML = rawCards + outputCards || '<p class="empty-state">Sin assets para este filtro.</p>';
  $$('[data-preview]', el).forEach((b) => b.addEventListener('click', () => openPreview(b.dataset.preview, b.dataset.previewSource)));
}
$('#assets-status-filter')?.addEventListener('change', renderAssetsList);
$('#assets-format-filter')?.addEventListener('change', renderAssetsList);
$('#assets-date-filter')?.addEventListener('change', renderAssetsList);

// ---------------- PRODUCTS ----------------
async function loadProducts() {
  const el = $('#products-list');
  el.innerHTML = '<p class="placeholder">Cargando…</p>';
  const products = await api('/api/products');
  // Corrección raíz (Fase 17): p.productSlug es solo el nombre de la
  // carpeta de assets/products/ -- NUNCA se presenta como si fuera el
  // nombre comercial real cuando factsAvailable es false (eso fue
  // exactamente lo que hizo creer que "Tongkat Ali" era un producto real y
  // completo del catálogo, cuando en realidad no tiene ningún archivo real
  // vinculado en docs/productos/).
  // Campos reales adicionales (objetivo/ingredientes/presentación/modo de
  // uso/estado comercial) -- ya existían en productFactsLoader.js/
  // productCatalog.js pero nunca llegaban a esta vista; NOT_AVAILABLE
  // explícito cuando la ficha real no documenta el campo (nunca se rellena).
  const NOT_AVAILABLE = '<span style="font-style:italic;color:var(--burgundy);">NOT_AVAILABLE</span>';
  const campo = (label, valor) => `<div style="font-size:12px;margin-top:4px;"><strong>${label}:</strong> ${valor ?? NOT_AVAILABLE}</div>`;

  el.innerHTML = products.map((p) => `
    <div class="product-card">
      ${p.rawAssets[0] ? `<img src="/media/assets-products/${encodeURIComponent(p.productSlug)}/raw/${encodeURIComponent(p.rawAssets[0].originalFilename)}" alt="${p.productSlug}" />` : ''}
      <div class="body">
        <div class="product-name">${p.factsAvailable ? p.nombreComercial : `${p.productSlug} <span style="font-weight:400;font-style:italic;color:var(--burgundy);">(sin nombre comercial real)</span>`}</div>
        ${p.factsAvailable ? `
          ${p.estadoComercial && p.estadoComercial !== 'ACTIVO' ? `<div class="tag" style="background:#f2c94c;color:#3a2e00;display:inline-block;margin:4px 0;">${p.estadoComercial}</div>` : ''}
          <div class="problema">${p.problema ?? ''}</div>
          ${campo('Objetivo', p.objetivoPrincipal)}
          ${campo('Beneficios', p.beneficios)}
          ${campo('Ingredientes', p.ingredientes)}
          ${campo('Presentación', p.presentacion)}
          ${campo('Modo de uso', p.modoDeUso)}
          ${campo('Público objetivo', p.publicoObjetivo)}
        ` : '<div class="no-facts">Sin catálogo real disponible todavía (no hay archivo vinculado en docs/productos/) -- no puede usarse en Crear Autónomo hasta agregarlo.</div>'}
        <div style="margin-top:8px;">
          <span class="tag RAW">${p.rawAssetCount} RAW</span>
        </div>
      </div>
    </div>`).join('') || '<p class="empty-state">Sin productos con assets reales todavía.</p>';
}

// ---------------- CAMPAIGNS ----------------
async function loadCampaigns() {
  const el = $('#campaigns-list');
  el.innerHTML = '<p class="placeholder">Cargando…</p>';
  const campaigns = await api('/api/campaigns');
  if (campaigns.length === 0) {
    el.innerHTML = '<p class="empty-state">Sin ProductionArtifacts persistidos todavía. Se completan cuando Campaign Mode construye y guarda un ProductionArtifact/VisualProductionPackage real.</p>';
    return;
  }
  el.innerHTML = campaigns.map((c) => `
    <div class="campaign-card">
      <strong>${c.concept}</strong>
      <div class="campaign-trace">CreativeCell ${c.creativeCellCandidateId} → ProductionArtifact ${c.productionArtifactId} → ${c.visualProductionPackages.length} VisualProductionPackage(s)</div>
      <div style="font-size:12px;color:#6b654f;">${c.commercialObjective} · ${c.format} · ${new Date(c.createdAt).toLocaleString()}</div>
    </div>`).join('');
}

// ---------------- MARKETING CAMPAIGNS (Fase 14, Parte 8/9) ----------------
const MARKETING_CAMPAIGN_STATUS_LABELS = { PLANNED: 'PLANIFICADO', READY_FOR_REVIEW: 'PLANIFICADO', GENERATING: 'PLANIFICADO', PUBLISHED: 'PUBLICADO' };

async function initMarketingCampaignForm() {
  const sel = $('#mkt-campaign-product');
  if (!sel || sel.dataset.loaded) return;
  const products = productsCache.length ? productsCache : (productsCache = await api('/api/products'));
  sel.innerHTML = products.map((p) => `<option value="${p.productSlug}">${p.nombreComercial ?? p.productSlug}</option>`).join('');
  sel.dataset.loaded = '1';
}

$('#marketing-campaign-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const resultEl = $('#marketing-campaign-result');
  btn.disabled = true; btn.textContent = 'CREANDO…';
  try {
    const body = {
      name: form.name.value, objective: form.objective.value, productId: form.productId.value,
      platform: form.platform.value, startDate: form.startDate.value, endDate: form.endDate.value,
      targetContentCount: Number(form.targetContentCount.value), frequency: form.frequency.value,
      executionMode: form.executionMode.value,
    };
    const campaign = await api('/api/marketing-campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    resultEl.innerHTML = `<div class="result-status COMPLETED">CAMPAÑA CREADA</div><p>${campaign.name} · ${campaign.platform} · ${campaign.startDate} → ${campaign.endDate}</p>`;
    form.reset();
    loadMarketingCampaigns();
  } catch (err) {
    resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
  } finally {
    btn.disabled = false; btn.textContent = 'CREAR CAMPAÑA';
  }
});

function marketingCampaignCard(c) {
  return `<div class="campaign-card" data-mkt-campaign-id="${c.id}">
    <strong>${c.name}</strong>
    <div style="font-size:12px;">${c.objective} · ${c.platform} · ${c.frequency} · Execution Mode: ${c.executionMode}</div>
    <div style="font-size:12px;color:#6b654f;">${c.startDate} → ${c.endDate} · objetivo: ${c.targetContentCount} contenidos</div>
    <button class="btn-secondary" data-action="overview">VER CAMPAIGN OVERVIEW</button>
  </div>`;
}
async function loadMarketingCampaigns() {
  const el = $('#marketing-campaigns-list');
  el.innerHTML = '<p class="placeholder">Cargando…</p>';
  const campaigns = await api('/api/marketing-campaigns');
  el.innerHTML = campaigns.length ? campaigns.map(marketingCampaignCard).join('') : '<p class="empty-state">Sin campañas creadas todavía.</p>';
  $$('[data-mkt-campaign-id]', el).forEach((card) => {
    card.querySelector('[data-action="overview"]')?.addEventListener('click', () => openCampaignOverview(card.dataset.mktCampaignId));
  });
}

async function openCampaignOverview(id) {
  const modal = $('#campaign-overview-modal');
  const body = $('#campaign-overview-body');
  body.innerHTML = '<p class="placeholder">Cargando…</p>';
  modal.classList.remove('hidden');
  try {
    const { campaign, overview } = await api(`/api/marketing-campaigns/${id}`);
    body.innerHTML = `
      <div class="pubdetail-grid">
        <div><strong>Nombre</strong>${campaign.name}</div>
        <div><strong>Objetivo</strong>${overview.objective}</div>
        <div><strong>Producto</strong>${overview.productName ?? campaign.productId}</div>
        <div><strong>Plataformas</strong>${overview.platforms.join(', ')}</div>
        <div><strong>Rango</strong>${campaign.startDate} → ${campaign.endDate}</div>
        <div><strong>Execution Mode</strong>${campaign.executionMode}</div>
      </div>
      <div class="pubdetail-grid">
        <div><strong>Planificados</strong>${overview.planned}</div>
        <div><strong>Publicados</strong>${overview.published}</div>
        <div><strong>Pendientes</strong>${overview.pending}</div>
        <div><strong>Fallidos</strong>${overview.failed}</div>
      </div>
      <p style="font-size:11px;color:#9c9683;">${overview.correlationMethod}</p>
      ${overview.planned === 0 ? '<p class="empty-state">Sin ContentPlan real correlacionado todavía para este producto/plataforma/rango de fechas.</p>' : ''}
      <h4 style="margin:16px 0 4px;">Content Plans de esta campaña</h4>
      <div id="campaign-overview-plans">${overview.contentPlans.map((p) => contentPlanCard({ ...p, status: p.effectiveStatus })).join('') || ''}</div>
    `;
    bindContentDetailButtons($('#campaign-overview-plans', body));
  } catch (err) {
    body.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}
$('#campaign-overview-close')?.addEventListener('click', () => $('#campaign-overview-modal').classList.add('hidden'));

// ---------------- PERFORMANCE ANALYSIS ENGINE (solo lectura) ----------------
function scoreCard(r) {
  const scoreTxt = typeof r.score === 'number' ? `${r.score.toFixed(1)}` : 'N/D';
  return `<div class="campaign-card">
    <strong>${r.platform.toUpperCase()} · score ${scoreTxt}</strong>
    <div style="font-size:12px;color:#6b654f;">${r.externalPostId ?? r.contentId} · ${r.method}</div>
  </div>`;
}
function insightCard(i) {
  return `<div class="campaign-card">
    <strong>${i.insightType} · ${i.platform}</strong>
    <div style="font-size:12px;">${i.scope} · confidence ${i.confidence}</div>
    <div style="font-size:12px;color:#6b654f;">${i.explanation}</div>
  </div>`;
}
async function loadPerformanceAnalysis() {
  const platform = $('#performance-platform-filter').value;
  const summaryEl = $('#performance-summary'), topEl = $('#performance-top'), bottomEl = $('#performance-bottom'), insightsEl = $('#performance-insights');
  [topEl, bottomEl, insightsEl].forEach((el) => { el.innerHTML = '<p class="placeholder">Cargando…</p>'; });
  const r = await api(`/api/performance/analysis${platform ? `?platform=${platform}` : ''}`);
  if (r.status !== 'OK') {
    summaryEl.innerHTML = `<p class="empty-state">${r.status}: ${r.reason ?? ''}</p>`;
    topEl.innerHTML = bottomEl.innerHTML = insightsEl.innerHTML = '';
    return;
  }
  summaryEl.innerHTML = `<p>${r.summary.totalPublications} publicaciones · ${r.summary.publicationsWithScore} con score · plataformas: ${r.summary.platforms.join(', ')} · mínimo de muestra para benchmarks: ${r.summary.minSampleSizeForBenchmarks}</p>`;
  topEl.innerHTML = r.topPerformers.length ? r.topPerformers.map(scoreCard).join('') : '<p class="empty-state">Sin datos suficientes.</p>';
  bottomEl.innerHTML = r.underperformers.length ? r.underperformers.map(scoreCard).join('') : '<p class="empty-state">Sin datos suficientes.</p>';
  insightsEl.innerHTML = r.insights.length ? r.insights.map(insightCard).join('') : '<p class="empty-state">Sin patrones con evidencia suficiente todavía.</p>';
}
$('#performance-platform-filter')?.addEventListener('change', loadPerformanceAnalysis);

// ---------------- ATTRIBUTION ENGINE (solo lectura) ----------------
function attributionCard(r) {
  return `<div class="campaign-card">
    <strong>${r.attributionType} · ${r.platform} · confidence ${r.confidence}</strong>
    <div style="font-size:12px;">lead ${r.leadId ?? '—'} · sale ${r.saleId ?? '—'} · revenue ${r.revenue ?? 'N/D'} ${r.currency ?? ''}</div>
    <div style="font-size:12px;color:#6b654f;">${r.explanation}</div>
  </div>`;
}
async function loadAttribution() {
  const summaryEl = $('#attribution-summary'), listEl = $('#attribution-list');
  listEl.innerHTML = '<p class="placeholder">Cargando…</p>';
  const summary = await api('/api/attribution/summary');
  if (summary.status !== 'OK') {
    summaryEl.innerHTML = `<p class="empty-state">${summary.status}: ${summary.reason ?? ''}</p>`;
    listEl.innerHTML = '';
    return;
  }
  summaryEl.innerHTML = `<p>${summary.totalRecords} registros · DIRECT ${summary.byType.DIRECT} · INDIRECT ${summary.byType.INDIRECT} · ASSISTED ${summary.byType.ASSISTED} · UNKNOWN ${summary.byType.UNKNOWN}
    · leads atribuidos: ${summary.metrics.attributedLeads} · ventas atribuidas: ${summary.metrics.attributedSales} · revenue atribuido: ${summary.metrics.attributedRevenue ?? 'N/D'}</p>`;
  const records = await api('/api/attribution');
  listEl.innerHTML = records.length ? records.map(attributionCard).join('') : '<p class="empty-state">Sin registros todavía.</p>';
}

// ---------------- MARKETING INTELLIGENCE ENGINE (solo lectura) ----------------
function intelligenceCard(i) {
  return `<div class="campaign-card">
    <strong>${i.category} · ${i.insightType} · confidence ${i.confidence}</strong>
    <div style="font-size:12px;">${i.scope}${i.platform ? ` · ${i.platform}` : ''} · evidenceCount ${i.evidenceCount}${i.benchmark !== null ? ` · benchmark ${i.benchmark}` : ''}${i.delta !== null ? ` · delta ${i.delta}` : ''}</div>
    <div style="font-size:13px;font-weight:600;">${i.title}</div>
    <div style="font-size:12px;color:#6b654f;">${i.summary}</div>
    ${i.attributionSummary ? `<div style="font-size:12px;">leads ${i.attributionSummary.attributedLeads} · ventas ${i.attributionSummary.attributedSales} · revenue ${i.attributionSummary.attributedRevenue ?? 'N/D'}</div>` : ''}
    <div style="font-size:11px;color:#9c9683;">recommendationReady: ${i.recommendationReady} · producto(s): ${i.relatedProductIds.length ? i.relatedProductIds.join(', ') : '—'}</div>
  </div>`;
}
async function loadIntelligence() {
  const platform = $('#intelligence-platform-filter').value;
  const category = $('#intelligence-category-filter').value;
  const confidence = $('#intelligence-confidence-filter').value;
  const summaryEl = $('#intelligence-summary'), listEl = $('#intelligence-list');
  listEl.innerHTML = '<p class="placeholder">Cargando…</p>';

  const summary = await api(`/api/intelligence/summary${platform ? `?platform=${platform}` : ''}`);
  if (summary.status !== 'OK') {
    summaryEl.innerHTML = `<p class="empty-state">${summary.status}: ${summary.reason ?? ''}</p>`;
  } else {
    const byCat = Object.entries(summary.byCategory).map(([k, v]) => `${k}: ${v}`).join(' · ');
    summaryEl.innerHTML = `<p>${summary.totalRecords} insights · recommendationReady: ${summary.recommendationReadyCount} · ${byCat}</p>`;
  }

  const params = new URLSearchParams();
  if (platform) params.set('platform', platform);
  if (category) params.set('category', category);
  if (confidence) params.set('confidence', confidence);
  const records = await api(`/api/intelligence${params.toString() ? `?${params}` : ''}`);
  listEl.innerHTML = records.length ? records.map(intelligenceCard).join('') : '<p class="empty-state">Sin insights persistidos todavía para este filtro.</p>';
}
$('#intelligence-platform-filter')?.addEventListener('change', loadIntelligence);
$('#intelligence-category-filter')?.addEventListener('change', loadIntelligence);
$('#intelligence-confidence-filter')?.addEventListener('change', loadIntelligence);

// ---------------- LEARNING & STRATEGY FEEDBACK ENGINE (solo lectura, NO ACTION AUTOMÁTICA) ----------------
function learningCard(lr) {
  return `<div class="campaign-card">
    <strong>${lr.learningType} · confidence ${lr.confidence}</strong>
    <div style="font-size:12px;">${lr.scope}${lr.platform ? ` · ${lr.platform}` : ''}${lr.format ? ` · formato ${lr.format}` : ''}${lr.product ? ` · producto ${lr.product}` : ''} · evidenceCount ${lr.evidenceCount}</div>
    <div style="font-size:13px;"><em>Observación:</em> ${lr.observation}</div>
    ${lr.pattern ? `<div style="font-size:12px;color:#6b654f;"><em>Patrón:</em> ${lr.pattern}</div>` : ''}
    ${lr.implication ? `<div style="font-size:12px;color:#6b654f;"><em>Implicación:</em> ${lr.implication}</div>` : ''}
    ${lr.supersededBy ? `<div style="font-size:11px;color:#a04b3a;">Reemplazado por un aprendizaje más reciente (${lr.supersededBy}) -- histórico, nunca eliminado.</div>` : ''}
  </div>`;
}
function strategyFeedbackCard(sf) {
  return `<div class="campaign-card">
    <strong>${sf.status} · confidence ${sf.confidence} · esperado: ${sf.expectedDirection}</strong>
    <div style="font-size:12px;">${sf.affectedPlatform ?? '—'}${sf.affectedFormat ? ` · ${sf.affectedFormat}` : ''}${sf.affectedProduct ? ` · ${sf.affectedProduct}` : ''}</div>
    <div style="font-size:13px;font-weight:600;">QUÉ: ${sf.recommendation}</div>
    <div style="font-size:12px;color:#6b654f;">POR QUÉ: ${sf.rationale}</div>
    <div style="font-size:11px;color:#a04b3a;">PROPOSED -- nunca se ejecuta automáticamente.</div>
  </div>`;
}
async function loadLearning() {
  const platform = $('#learning-platform-filter').value;
  const learningType = $('#learning-type-filter').value;
  const confidence = $('#learning-confidence-filter').value;
  const summaryEl = $('#learning-summary'), listEl = $('#learning-list'), feedbackEl = $('#strategy-feedback-list');
  listEl.innerHTML = feedbackEl.innerHTML = '<p class="placeholder">Cargando…</p>';

  const summary = await api(`/api/learning/summary${platform ? `?platform=${platform}` : ''}`);
  summaryEl.innerHTML = summary.status !== 'OK'
    ? `<p class="empty-state">${summary.status}: ${summary.reason ?? ''}</p>`
    : `<p>${summary.totalRecords} learnings · ${summary.supersededCount} reemplazados por evidencia más reciente · ${Object.entries(summary.byLearningType).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>`;

  const params = new URLSearchParams();
  if (platform) params.set('platform', platform);
  if (learningType) params.set('learningType', learningType);
  if (confidence) params.set('confidence', confidence);
  const records = await api(`/api/learning${params.toString() ? `?${params}` : ''}`);
  listEl.innerHTML = records.length ? records.map(learningCard).join('') : '<p class="empty-state">Sin learnings persistidos todavía para este filtro.</p>';

  const feedback = await api(`/api/strategy-feedback${params.toString() ? `?${params}` : ''}`);
  feedbackEl.innerHTML = feedback.length ? feedback.map(strategyFeedbackCard).join('') : '<p class="empty-state">Sin recomendaciones propuestas todavía para este filtro.</p>';
}
$('#learning-platform-filter')?.addEventListener('change', loadLearning);
$('#learning-type-filter')?.addEventListener('change', loadLearning);
$('#learning-confidence-filter')?.addEventListener('change', loadLearning);

// ---------------- STRATEGY DECISION ENGINE (solo lectura, EXECUTION: NOT EXECUTED, sin botones de ejecución) ----------------
function decisionCard(d) {
  return `<div class="campaign-card">
    <strong>${d.decision} · risk ${d.risk} · confidence ${d.confidence}</strong>
    <div style="font-size:12px;">${d.scope} · ${d.scopeType}${d.affectedPlatform ? ` · ${d.affectedPlatform}` : ''}${d.affectedFormat ? ` · ${d.affectedFormat}` : ''}${d.affectedProduct ? ` · ${d.affectedProduct}` : ''} · evidenceCount ${d.evidenceCount} · impacto esperado ${d.expectedImpact}</div>
    <div style="font-size:13px;">${d.decisionReason}</div>
    ${d.contradictions.length ? `<div style="font-size:12px;color:#a04b3a;">Contradicciones: ${d.contradictions.map((c) => `${c.learningType} (${c.expectedDirection})`).join(', ')}</div>` : ''}
    ${d.supersedes ? `<div style="font-size:11px;color:#6b654f;">Reemplaza una decisión anterior (${d.supersedes}) -- histórica, no eliminada.</div>` : ''}
    <div style="font-size:11px;font-weight:600;">EXECUTION: ${d.executionStatus.replace('_', ' ')}</div>
  </div>`;
}
async function loadStrategyDecisions() {
  const decision = $('#decisions-decision-filter').value;
  const risk = $('#decisions-risk-filter').value;
  const scope = $('#decisions-scope-filter').value;
  const summaryEl = $('#decisions-summary'), acceptEl = $('#decisions-accept-list'), deferEl = $('#decisions-defer-list'), rejectEl = $('#decisions-reject-list');
  acceptEl.innerHTML = deferEl.innerHTML = rejectEl.innerHTML = '<p class="placeholder">Cargando…</p>';

  const summary = await api('/api/strategy-decisions/summary');
  summaryEl.innerHTML = summary.status !== 'OK'
    ? `<p class="empty-state">${summary.status}: ${summary.reason ?? ''}</p>`
    : `<p>${summary.totalRecords} decisiones · ${Object.entries(summary.byDecision).map(([k, v]) => `${k}: ${v}`).join(' · ')} · executionStatus real: ${summary.allExecutionStatus.join(', ')}</p>`;

  const params = new URLSearchParams();
  if (risk) params.set('risk', risk);
  if (scope) params.set('scope', scope);
  const decisions = decision ? [decision] : ['ACCEPT', 'DEFER', 'REJECT'];
  const results = { ACCEPT: [], DEFER: [], REJECT: [] };
  for (const d of decisions) {
    const p = new URLSearchParams(params); p.set('decision', d);
    results[d] = await api(`/api/strategy-decisions?${p}`);
  }
  acceptEl.innerHTML = results.ACCEPT.length ? results.ACCEPT.map(decisionCard).join('') : '<p class="empty-state">Sin decisiones ACCEPT todavía.</p>';
  deferEl.innerHTML = results.DEFER.length ? results.DEFER.map(decisionCard).join('') : '<p class="empty-state">Sin decisiones DEFER todavía.</p>';
  rejectEl.innerHTML = results.REJECT.length ? results.REJECT.map(decisionCard).join('') : '<p class="empty-state">Sin decisiones REJECT todavía.</p>';
}
$('#decisions-decision-filter')?.addEventListener('change', loadStrategyDecisions);
$('#decisions-risk-filter')?.addEventListener('change', loadStrategyDecisions);
$('#decisions-scope-filter')?.addEventListener('change', loadStrategyDecisions);

// ---------------- CONTENT PLANNING & EXECUTION (solo lectura) ----------------
// Fase 13, Parte 23 -- campos explícitos pedidos: Execution Mode / Auto
// Publish ON-OFF / Eligibility / Quality / Publication.
function publicationLabel(p) {
  if (p.status === 'SCHEDULED') return 'SCHEDULED';
  if (/FAILED/.test(p.status)) return 'FAILED';
  if (p.status === 'PUBLISHED') return 'PUBLISHED';
  return 'NOT_PUBLISHED';
}
function contentPlanCard(p) {
  const quality = p.qualityGateResult ? (p.qualityGateResult.passed ? 'PASS' : 'FAIL') : 'N/A';
  const eligibility = p.autoPublish ? (p.autoPublish.eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE') : 'N/A';
  const autoPublishState = p.autoPublish ? (p.autoPublish.enabled ? 'ON' : 'OFF') : 'N/A';
  return `<div class="campaign-card">
    <strong>${p.status} · Execution Mode: ${p.executionMode}</strong>
    <div style="font-size:12px;">${p.platform ?? '—'}${p.format ? ` · ${p.format}` : ''}${p.product ? ` · ${p.product}` : ''}${p.objective ? ` · ${p.objective}` : ''}</div>
    <div style="font-size:11px;">Auto Publish: ${autoPublishState} · Eligibility: ${eligibility} · Quality: ${quality} · Publication: ${publicationLabel(p)}</div>
    ${p.strategyDecisionIds.length ? `<div style="font-size:11px;color:#6b654f;">strategy decisions: ${p.strategyDecisionIds.join(', ')}</div>` : '<div style="font-size:11px;color:#9c9683;">sin StrategyDecision aplicable</div>'}
    ${p.reason ? `<div style="font-size:12px;">${p.reason}</div>` : ''}
    ${p.autoPublish?.reasons?.length ? `<div style="font-size:11px;color:#a04b3a;">${p.autoPublish.reasons.join(' · ')}</div>` : ''}
    <div style="font-size:11px;">assetPackageId: ${p.assetPackageId ?? '—'} · publicationId: ${p.publicationId ?? '—'}</div>
    <button class="btn-secondary" data-action="view-content" data-plan-id="${p.id}">VER CONTENIDO</button>
  </div>`;
}
function bindContentDetailButtons(el) {
  $$('[data-action="view-content"][data-plan-id]', el).forEach((b) => b.addEventListener('click', () => openContentDetail(b.dataset.planId)));
}
async function loadContentPlans() {
  const status = $('#content-plans-status-filter').value;
  const executionMode = $('#content-plans-mode-filter').value;
  const listEl = $('#content-plans-list');
  listEl.innerHTML = '<p class="placeholder">Cargando…</p>';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (executionMode) params.set('executionMode', executionMode);
  const plans = await api(`/api/content-plans${params.toString() ? `?${params}` : ''}`);
  listEl.innerHTML = plans.length ? plans.map(contentPlanCard).join('') : '<p class="empty-state">Sin ContentPlan persistidos todavía para este filtro.</p>';
  bindContentDetailButtons(listEl);
}
$('#content-plans-status-filter')?.addEventListener('change', loadContentPlans);
$('#content-plans-mode-filter')?.addEventListener('change', loadContentPlans);

// ---------------- AUTOMATIC PUBLISHING (Fase 13, Partes 6-14) ----------------
// Activar/desactivar SOLO cambia configuración (autoPublishConfig.js) --
// nunca crea ContentPlan, nunca genera, nunca publica, nunca llama a Meta.
async function loadAutoPublishStatus() {
  const el = $('#auto-publish-status');
  el.innerHTML = '<p class="placeholder">Cargando…</p>';
  const { config, readiness } = await api('/api/auto-publish');
  el.innerHTML = `
    <p><strong>AUTO-PUBLISH: ${config.enabled ? 'ON' : 'OFF'}</strong>${config.enabled ? ` (activado por ${config.actorId})` : ''}</p>
    <p><strong>READINESS: ${readiness.readiness}</strong></p>
    <ul style="font-size:12px;margin:4px 0;">${readiness.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>
    ${config.enabled ? '<p style="font-size:12px;color:#3a7a4e;">Los contenidos elegibles podrán publicarse automáticamente después de pasar los Quality Gates y cumplir las reglas de ejecución.</p>' : ''}
  `;
}
$('#auto-publish-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const actorId = form.actorId.value.trim();
  const reason = form.reason.value.trim() || null;
  const resultEl = $('#auto-publish-result');
  try {
    const result = await api('/api/auto-publish/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actorId, reason }) });
    resultEl.innerHTML = result.activated
      ? '<p style="color:#3a7a4e;">Publicación automática ACTIVADA.</p>'
      : `<p style="color:#a04b3a;">NOT_READY -- no se activó. ${result.readiness.reasons.join(' · ')}</p>`;
    await loadAutoPublishStatus();
  } catch (err) {
    resultEl.innerHTML = `<p style="color:#a04b3a;">${err.message}</p>`;
  }
});
$('#auto-publish-disable-btn')?.addEventListener('click', async () => {
  const form = $('#auto-publish-form');
  const actorId = form.actorId.value.trim();
  const reason = form.reason.value.trim() || null;
  const resultEl = $('#auto-publish-result');
  if (!actorId) { resultEl.innerHTML = '<p style="color:#a04b3a;">Escribe tu nombre real antes de desactivar.</p>'; return; }
  try {
    await api('/api/auto-publish/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actorId, reason }) });
    resultEl.innerHTML = '<p>Publicación automática DESACTIVADA. El historial y las publicaciones existentes no se ven afectados.</p>';
    await loadAutoPublishStatus();
  } catch (err) {
    resultEl.innerHTML = `<p style="color:#a04b3a;">${err.message}</p>`;
  }
});

// ---------------- AUTOCREATE (Bloque 1 — Crear autónomo) ----------------

// Fase 16 — Marketing Creative Playbook + Hypothesis Testing Integration.
// Un solo builder de tarjeta de variante, reutilizado tanto por "Crear
// autónomo" como por "Crear contenido -> Sugerir variantes" (mismo motor,
// mismo render -- nunca dos UI independientes para el mismo concepto).
function variantCardHtml(v, index) {
  return `
    <div class="variant-card" data-variant-index="${index}">
      <span class="hypothesis-badge">HIPÓTESIS — REQUIERE REVISIÓN HUMANA</span>
      <h4>Variante ${v.blueprintId}</h4>
      <div class="variant-field"><strong>Persona (hipótesis)</strong>${v.personaHypothesis.name}</div>
      <div class="variant-field"><strong>Pain (hipótesis)</strong>${v.painHypothesis.painPoint}</div>
      <div class="variant-field"><strong>Ángulo</strong>${v.creativeVariant.angleText}</div>
      <div class="variant-field"><strong>Hook</strong>${v.copy.hook}</div>
      <div class="variant-field"><strong>Copy</strong>${v.copy.primaryText}</div>
      <div class="variant-field"><strong>CTA</strong>${v.copy.cta}</div>
      <div class="variant-field"><strong>Awareness stage</strong>${v.creativeVariant.awareness}</div>
      <div class="variant-field"><strong>Formato</strong>${v.creativeVariant.format}</div>
      <div class="variant-field"><strong>Dirección visual</strong>${v.visualDirection.sceneDescription} · ${v.visualDirection.aspectRatio}</div>
      <button type="button" class="btn-secondary btn-use-variant" data-variant-index="${index}">USAR ESTA VARIANTE →</button>
    </div>
  `;
}

function renderHypothesisExperiment(result) {
  const cards = result.variantsDetail.map((v, i) => variantCardHtml(v, i)).join('');
  return `
    <div class="result-status HYPOTHESIS_EXPERIMENT_READY">EXPERIMENTO — HIPÓTESIS</div>
    <div class="hypothesis-banner">
      No encontramos una dirección creativa validada (Evidence-Based) para este objetivo.
      Como todavía estamos construyendo historial de clientes, creamos un experimento basado
      en hipótesis usando únicamente información documentada del producto. ${result.disclaimer}
    </div>
    <div class="variant-grid">${cards}</div>
  `;
}

function renderCreativeProposal(proposal) {
  if (proposal.status === 'HYPOTHESIS_EXPERIMENT_READY') {
    return renderHypothesisExperiment(proposal);
  }
  if (proposal.status !== 'PROPOSAL_READY') {
    const motivo = (proposal.errors ?? []).join(' ') || proposal.status;
    return `<div class="result-status VALIDATION_FAILED">${proposal.status}</div><p>${motivo}</p>`;
  }
  return `
    <div class="result-status COMPLETED">PROPUESTA LISTA</div>
    <div class="proposal-card">
      <div><strong>Producto</strong><br/>${proposal.product.nombreComercial}</div>
      <div><strong>Persona</strong><br/>${proposal.audience.personaName}</div>
      <div><strong>Pain</strong><br/>${proposal.pain.painPoint}</div>
      <div><strong>Ángulo</strong><br/>${proposal.angle.angleText}</div>
      <div><strong>Hook</strong><br/>${proposal.hook ?? '<em>no resuelto</em>'}</div>
      <div><strong>Guion</strong><br/>${(proposal.script ?? []).join('<br/>')}</div>
      <div><strong>CTA</strong><br/>${proposal.cta}</div>
      <div><strong>Formato</strong><br/>${proposal.format} (sugerido: ${proposal.suggestedDeliveryFormat})</div>
      <div><strong>Plataforma</strong><br/>${proposal.platform ?? 'no detectada'}</div>
      <div><strong>Duración objetivo</strong><br/>${proposal.durationTargetSeconds}</div>
    </div>
    ${proposal.missingFields.length ? `<p style="font-size:12px;color:#6b654f;">Pendiente de confirmar: ${proposal.missingFields.join(' · ')}</p>` : ''}
    ${renderStrategyContextBadge(proposal.strategyContext)}
    <button class="btn-primary" id="autocreate-use-btn">USAR EN CREAR →</button>
  `;
}

// Fase 11 (Strategy-Aware Content Generation) -- trazabilidad, no un panel de intelligence nuevo: solo muestra si esta propuesta usó StrategyContext y con qué evidencia real.
function renderStrategyContextBadge(strategyContext) {
  if (!strategyContext?.applied) {
    return `<p style="font-size:12px;color:#9c9683;">Strategy context applied: NO${strategyContext?.reason ? ` (${strategyContext.reason})` : ''}</p>`;
  }
  return `<p style="font-size:12px;color:#3a7a4e;">Strategy context applied: YES · decisions: ${strategyContext.strategyDecisionIds.join(', ')} · direction: ${strategyContext.strategicDirection} · confidence: ${strategyContext.confidence}</p>`;
}

// Corrección raíz (Fase 17): mismo catálogo real que ya usa Crear
// (productsCache, /api/products) -- nunca un catálogo paralelo. Los
// productos sin hechos reales en docs/productos/ (factsAvailable:false,
// ej. una carpeta de assets sin catálogo vinculado) se listan igual pero
// marcados explícitamente, nunca ocultados ni presentados como completos.
async function initAutocreateProductSelect() {
  const sel = $('#autocreate-product');
  if (!sel || sel.dataset.loaded) return;
  const products = productsCache.length ? productsCache : (productsCache = await api('/api/products'));
  sel.innerHTML = '<option value="">(detectar automáticamente del texto)</option>'
    + products.map((p) => `<option value="${p.productSlug}">${p.nombreComercial ?? p.productSlug}${p.factsAvailable ? '' : ' (sin catálogo real todavía)'}</option>`).join('');
  sel.dataset.loaded = '1';
}

const autocreateForm = $('#autocreate-form');
let lastProposal = null;
if (autocreateForm) {
  autocreateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = $('#autocreate-result');
    const btn = autocreateForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'GENERANDO PROPUESTA…';
    resultEl.innerHTML = '<p class="placeholder">Consultando Creative Intelligence real…</p>';
    try {
      const productId = autocreateForm.productId.value || null;
      const proposal = await api('/api/create/propose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIntent: autocreateForm.userIntent.value, productId }) });
      lastProposal = proposal;
      resultEl.innerHTML = renderCreativeProposal(proposal);
      const useBtn = $('#autocreate-use-btn', resultEl);
      if (useBtn) useBtn.addEventListener('click', () => applyProposalToCreateForm(proposal));
      resultEl.querySelectorAll('.btn-use-variant').forEach((b) => {
        b.addEventListener('click', () => applyHypothesisVariantToCreateForm(proposal.product.productId, proposal.variantsDetail[Number(b.dataset.variantIndex)], proposal.userIntent));
      });
    } catch (err) {
      resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = 'GENERAR PROPUESTA';
    }
  });
}

async function applyProposalToCreateForm(proposal) {
  goto('create');
  await initCreateForm();
  const form = $('#create-form');
  form.productId.value = proposal.product.productId;
  updateCreateImages();
  form.rawText.value = proposal.userIntent;
  form.hookText.value = proposal.hook ?? '';
  form.voiceoverText.value = proposal.voiceoverText ?? '';
  form.ctaText.value = proposal.cta ?? '';
}

// Video Workspace (auditoría "Video Workspace + Voice Engine", 2026-08-23):
// separa CREATIVE COPY de VIDEO SCRIPT -- llama a
// /api/video-script (content-orchestrator/src/videoScriptGenerator.js)
// para obtener el voiceoverText inicial y su target de duración, en vez de
// reutilizar crudo variant.copy.voiceover como antes. A partir de aquí el
// texto queda marcado "GENERATED" y es completamente editable: si el
// usuario lo modifica, el texto editado ("USER_EDITED") es la única
// fuente de verdad que llega a Voice Engine -- esta función NUNCA vuelve
// a llamarse después de que el usuario edita (solo se dispara al aplicar
// una variante nueva).
async function applyVideoScriptToCreateForm(form, variant) {
  const infoEl = $('#create-video-script-info');
  const textarea = form.voiceoverText;
  const sourceInput = form.voiceoverSource;
  const fallbackText = (variant.copy.voiceover ?? [variant.copy.primaryText]).join(' ');

  let videoScript = null;
  try {
    videoScript = await api('/api/video-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook: variant.copy.hook,
        bodyLines: variant.copy.bodyLines,
        sectionsUsed: variant.copy.sectionsUsed,
        cta: variant.copy.cta,
        format: variant.creativeVariant.format,
        copyStyle: variant.copyStyle,
      }),
    });
  } catch (err) {
    textarea.value = fallbackText;
    if (infoEl) infoEl.classList.add('hidden');
  }

  if (videoScript?.applicable) {
    textarea.value = videoScript.voiceoverText;
    if (infoEl) {
      infoEl.classList.remove('hidden');
      infoEl.innerHTML = `<strong>Video Script</strong> — estilo: ${videoScript.styleCategory} · target: ${videoScript.targetDurationRange.min}-${videoScript.targetDurationRange.max}s · estimado: ${videoScript.estimatedDurationSeconds}s (${videoScript.durationStatus}) · ${videoScript.wordCount} palabras. Este es el texto que se enviará al Voice Engine — puedes editarlo libremente.`;
    }
  } else if (videoScript) {
    textarea.value = variant.copy.primaryText ?? fallbackText;
    if (infoEl) infoEl.classList.add('hidden');
  }

  form.dataset.generatedVoiceoverText = textarea.value;
  sourceInput.value = 'GENERATED';

  // Fix "Audio Source / Voiceover Consistency" (2026-08-23), Parte 1:
  // aplicar un Video Script nuevo SIEMPRE fuerza audioSource="generate" --
  // nunca deja seleccionado en silencio un Audio Asset existente que ya
  // no corresponde a este voiceover. El usuario sigue pudiendo elegir
  // "existing" manualmente después (Parte 3, excepción explícita).
  form.audioSource.value = 'generate';
  $('#create-audio-existing-wrap').classList.add('hidden');
  updateAudioConsistencyUI(form);

  if (!textarea.dataset.sourceTrackingBound) {
    textarea.addEventListener('input', () => {
      sourceInput.value = textarea.value === form.dataset.generatedVoiceoverText ? 'GENERATED' : 'USER_EDITED';
      // Parte 2: si el usuario ya había elegido "existing" a propósito y
      // ahora edita el texto, esto puede introducir un mismatch real --
      // updateAudioConsistencyUI() lo detecta comparando contra la foto
      // tomada cuando se eligió "existing" (nunca contra el texto recién
      // generado). En modo "generate" nunca hay mismatch posible (Voice
      // Engine siempre usa el texto vigente al enviar).
      updateAudioConsistencyUI(form);
    });
    textarea.dataset.sourceTrackingBound = '1';
  }
}

// Fase 16, Parte 9/11: prellena el formulario "Crear" con UNA variante de
// hipótesis elegida por el humano -- sigue siendo texto editable, nunca se
// envía automáticamente. mode se fija en DIRECT: esta variante no viene de
// un CreativeCell aprobado (sería incorrecto pedirle a campaignMode.js que
// la re-resuelva), y desde la corrección de Fase 16 Parte 10, DIRECT y
// CAMPAIGN producen el mismo render para copy manual de todas formas.
async function applyHypothesisVariantToCreateForm(productId, variant, userIntent = '') {
  goto('create');
  await initCreateForm();
  const form = $('#create-form');
  form.productId.value = productId;
  updateCreateImages();
  form.mode.value = 'DIRECT';
  form.rawText.value = userIntent;
  form.hookText.value = variant.copy.hook ?? '';
  form.ctaText.value = variant.copy.cta ?? '';
  if (form.productBody) form.productBody.value = variant.copy.primaryText ?? '';
  await applyVideoScriptToCreateForm(form, variant);
}

// ---------------- CAROUSEL (Bloque 2 — Carousel real) ----------------
let lastCarouselProposal = null;
const carouselProposeForm = $('#carousel-propose-form');
if (carouselProposeForm) {
  carouselProposeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = $('#carousel-propose-result');
    const btn = carouselProposeForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'GENERANDO PROPUESTA…';
    resultEl.innerHTML = '<p class="placeholder">Consultando Creative Intelligence real…</p>';
    try {
      const proposal = await api('/api/carousel/propose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIntent: carouselProposeForm.userIntent.value, slideCount: Number(carouselProposeForm.slideCount.value) }),
      });
      lastCarouselProposal = proposal;
      if (proposal.status !== 'PROPOSAL_READY') {
        resultEl.innerHTML = renderCreativeProposal(proposal);
        return;
      }
      const slidesHtml = proposal.carousel.slides.map((s, i) => `
        <div class="output-card">
          <h4>Slide ${i + 1}/${proposal.carousel.actualSlideCount}</h4>
          <div>${s.headline ?? ''}</div>
          ${s.body ? `<div style="font-size:12px;color:#6b654f;">${s.body}</div>` : ''}
          ${s.cta ? `<div style="font-weight:700;">${s.cta}</div>` : ''}
        </div>`).join('');
      resultEl.innerHTML = `
        <div class="result-status COMPLETED">PROPUESTA LISTA — ${proposal.carousel.actualSlideCount} slides</div>
        ${proposal.carousel.warnings.length ? `<p style="font-size:12px;color:#6b654f;">${proposal.carousel.warnings.join(' · ')}</p>` : ''}
        ${slidesHtml}
        <button class="btn-primary" id="carousel-produce-btn">PRODUCIR CARRUSEL REAL</button>
      `;
      $('#carousel-produce-btn', resultEl).addEventListener('click', () => produceCarousel(proposal));
    } catch (err) {
      resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = 'GENERAR PROPUESTA';
    }
  });
}

async function produceCarousel(proposal) {
  const resultEl = $('#carousel-propose-result');
  resultEl.innerHTML = '<p class="placeholder">Renderizando slides reales (HyperFrames)…</p>';
  try {
    const result = await api('/api/carousel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: proposal.product.productId, slides: proposal.carousel.slides }),
    });
    renderFinalAssetPackage(resultEl, result);
  } catch (err) {
    resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
  }
}

// ---------------- PUBLICAR (Bloque 3) ----------------
let publishTargetsCache = [];
let assetToPublish = null;

// Publication Gate (Fase 16, Parte 18) -- resumen explícito antes de
// cualquier acción de publicar/programar: PLATFORM/CONTENT/CAPTION/MEDIA/
// DATE/STRATEGY/QUALITY/EXECUTION MODE. `meta` es opcional (Crear/Editar/
// Adaptar no siempre tienen un ContentPlan asociado) -- cuando no hay dato
// real, se omite la fila en vez de inventar un valor.
function renderPublicationGateSummary(result, meta) {
  if (!meta) return '';
  const rows = [];
  if (meta.executionMode) rows.push(`<div><strong>Execution Mode</strong>${meta.executionMode}</div>`);
  if (meta.product) rows.push(`<div><strong>Producto</strong>${meta.product}</div>`);
  if (meta.platform) rows.push(`<div><strong>Plataforma</strong>${meta.platform}</div>`);
  if (meta.strategyContext) rows.push(`<div><strong>Strategy</strong>${meta.strategyContext.applied ? `${meta.strategyContext.strategicDirection} (confidence ${meta.strategyContext.confidence})` : 'sin StrategyContext aplicable'}</div>`);
  if (meta.qualityGateResult) rows.push(`<div><strong>Quality Gate</strong>${meta.qualityGateResult.passed ? 'PASS' : 'FAIL'}</div>`);
  if (!rows.length) return '';
  return `<div class="pubdetail-grid">${rows.join('')}</div>`;
}

async function openPublishModal(result, meta = null) {
  assetToPublish = result;
  publishTargetsCache = await api('/api/publish/targets').catch(() => []);
  const sel = $('#publish-platform');
  sel.innerHTML = publishTargetsCache.map((t) => `<option value="${t.platform}" ${t.configured ? '' : 'disabled'}>${t.platform}${t.configured ? '' : ' (configuración requerida)'}</option>`).join('');
  updatePublishFieldsVisibility();
  $('#publish-summary').innerHTML = renderPublicationGateSummary(result, meta);
  $('#publish-result').innerHTML = '';
  $('#publish-modal').classList.remove('hidden');
}

function updatePublishFieldsVisibility() {
  const platform = $('#publish-platform').value;
  $('#publish-destination-wrap').classList.toggle('hidden', platform !== 'WHATSAPP');
  $('#publish-mediaurl-wrap').classList.toggle('hidden', platform === 'WHATSAPP');
}

const publishPlatformSel = $('#publish-platform');
if (publishPlatformSel) publishPlatformSel.addEventListener('change', updatePublishFieldsVisibility);

const publishCloseBtn = $('#publish-close');
if (publishCloseBtn) publishCloseBtn.addEventListener('click', () => $('#publish-modal').classList.add('hidden'));

const publishForm = $('#publish-form');
if (publishForm) {
  publishForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = $('#publish-result');
    const btn = publishForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'PUBLICANDO…';
    resultEl.innerHTML = '<p class="placeholder">Publicando…</p>';
    try {
      const platform = publishForm.platform.value;
      const isCarousel = assetToPublish.assetPackageType === 'CAROUSEL';
      const body = {
        assetPackage: assetToPublish,
        platform,
        destination: publishForm.destination.value || null,
        caption: publishForm.caption.value || null,
        mediaUrl: !isCarousel ? (publishForm.mediaUrl.value || null) : null,
        mediaUrls: isCarousel && publishForm.mediaUrl.value ? publishForm.mediaUrl.value.split(',').map((s) => s.trim()) : null,
      };
      const result = await api('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      resultEl.innerHTML = `<div class="result-status ${result.status}">${result.status}</div>${result.detail ? `<p>${typeof result.detail === 'string' ? result.detail : ''}</p>` : ''}${result.error ? `<p>${result.error}</p>` : ''}${result.externalId ? `<p>ID externo: ${result.externalId}</p>` : ''}`;
    } catch (err) {
      resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = 'CONFIRMAR PUBLICACIÓN';
    }
  });
}

// ---------------- CALENDARIO (Media Hosting + Publishing Scheduler) ----------------
const SCHEDULE_STATUS_LABELS = {
  DRAFT: 'BORRADOR', APPROVED: 'APROBADO', SCHEDULED: 'PROGRAMADO', PUBLISHING: 'PUBLICANDO',
  PUBLISHED: 'PUBLICADO', FAILED: 'ERROR', CANCELLED: 'CANCELADO', CONFIGURATION_REQUIRED: 'CONFIGURACIÓN REQUERIDA',
};

function openScheduleModal(result, meta = null) {
  assetToPublish = result;
  $('#schedule-summary').innerHTML = renderPublicationGateSummary(result, meta);
  $('#schedule-result').innerHTML = '';
  $('#schedule-form').reset();
  $('#schedule-modal').classList.remove('hidden');
}

const scheduleCloseBtn = $('#schedule-close');
if (scheduleCloseBtn) scheduleCloseBtn.addEventListener('click', () => $('#schedule-modal').classList.add('hidden'));

const publishGotoScheduleBtn = $('#publish-goto-schedule');
if (publishGotoScheduleBtn) {
  publishGotoScheduleBtn.addEventListener('click', () => {
    $('#publish-modal').classList.add('hidden');
    openScheduleModal(assetToPublish);
  });
}

const scheduleForm = $('#schedule-form');
if (scheduleForm) {
  scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = $('#schedule-result');
    const btn = scheduleForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'GUARDANDO…';
    try {
      const body = { assetPackage: assetToPublish, platform: scheduleForm.platform.value, caption: scheduleForm.caption.value };
      await api('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      resultEl.innerHTML = '<p>Guardado como BORRADOR. Ábrelo en Calendario para aprobar y programar la fecha/hora.</p>';
      setTimeout(() => { $('#schedule-modal').classList.add('hidden'); goto('calendar'); }, 900);
    } catch (err) {
      resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = 'GUARDAR COMO BORRADOR';
    }
  });
}

async function loadCalendar() {
  const statusEl = $('#calendar-hosting-status');
  try {
    const { configured } = await api('/api/media-hosting/status');
    statusEl.textContent = configured
      ? 'Media Hosting (Cloudflare R2) configurado -- las publicaciones vencidas se alojan y publican de verdad.'
      : 'Media Hosting (Cloudflare R2) SIN configurar en este entorno -- las publicaciones vencidas quedarán en CONFIGURACIÓN REQUERIDA hasta definir R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET/R2_PUBLIC_BASE_URL.';
    statusEl.classList.toggle('warn', !configured);
    statusEl.classList.toggle('ok', configured);
  } catch {
    statusEl.textContent = 'No se pudo verificar Media Hosting.';
  }
  await renderCalendarList();
}

async function renderCalendarList() {
  const el = $('#calendar-list');
  el.innerHTML = '<p class="placeholder">Cargando…</p>';
  const list = await api('/api/schedule');
  if (list.length === 0) {
    el.innerHTML = '<p class="empty-state">Sin publicaciones programadas todavía. Usa "PROGRAMAR →" desde un resultado de Crear/Carrusel/Adaptar.</p>';
    return;
  }
  el.innerHTML = list.map((r) => `
    <div class="asset-card" data-schedule-id="${r.id}">
      <div class="body">
        <span class="tag ${r.status}">${SCHEDULE_STATUS_LABELS[r.status] ?? r.status}</span>
        <div class="filename">${r.platform} · ${r.caption ?? ''}</div>
        <div class="meta" style="font-size:11px;color:#6b654f;margin-top:4px;">
          ${r.scheduledAt ? `Programado: ${new Date(r.scheduledAt).toLocaleString()} (${r.timezone})` : 'Sin fecha aún'}
          ${r.publishedAt ? ` · Publicado: ${new Date(r.publishedAt).toLocaleString()}` : ''}
          ${r.externalPublicationId ? ` · ID externo: ${r.externalPublicationId}` : ''}
        </div>
        ${r.error ? `<div class="meta" style="font-size:11px;color:#b03a2e;margin-top:4px;">${r.error}</div>` : ''}
        <div class="schedule-actions" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
          <button class="btn-secondary" data-action="detail">VER DETALLE</button>
          ${r.status === 'DRAFT' ? `<button class="btn-secondary" data-action="approve">APROBAR</button>` : ''}
          ${r.status === 'APPROVED' ? `
            <input type="date" class="sched-date" style="width:130px;" />
            <input type="time" class="sched-time" style="width:90px;" />
            <input type="text" class="sched-tz" placeholder="America/Mexico_City" style="width:170px;" />
            <button class="btn-secondary" data-action="program">PROGRAMAR</button>` : ''}
          ${['DRAFT', 'APPROVED', 'SCHEDULED'].includes(r.status) ? `<button class="btn-secondary" data-action="cancel">CANCELAR</button>` : ''}
        </div>
      </div>
    </div>`).join('');

  $$('[data-schedule-id]', el).forEach((card) => {
    const id = card.dataset.scheduleId;
    card.querySelector('[data-action="detail"]')?.addEventListener('click', () => openPublicationDetail(id));
    const approveBtn = card.querySelector('[data-action="approve"]');
    if (approveBtn) approveBtn.addEventListener('click', async () => {
      const approvedBy = prompt('¿Quién aprueba esta publicación? (nombre real)');
      if (!approvedBy?.trim()) return;
      try { await api(`/api/schedule/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvedBy }) }); renderCalendarList(); }
      catch (err) { alert(err.message); }
    });
    const programBtn = card.querySelector('[data-action="program"]');
    if (programBtn) programBtn.addEventListener('click', async () => {
      const date = card.querySelector('.sched-date').value;
      const time = card.querySelector('.sched-time').value;
      const timezone = card.querySelector('.sched-tz').value.trim();
      if (!date || !time || !timezone) { alert('Fecha, hora y timezone (IANA, ej. America/Mexico_City) son obligatorios.'); return; }
      try { await api(`/api/schedule/${id}/program`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, time, timezone }) }); renderCalendarList(); }
      catch (err) { alert(err.message); }
    });
    const cancelBtn = card.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener('click', async () => {
      if (!confirm('¿Cancelar esta publicación programada?')) return;
      try { await api(`/api/schedule/${id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); renderCalendarList(); }
      catch (err) { alert(err.message); }
    });
  });
}

// ---------------- PUBLICATION DETAIL (Fase 14, Parte 13) ----------------
// Reutiliza GET /api/schedule/:id (registro real completo, incluye
// assetPackageSnapshot), correlaciona con ContentPlan real (por
// publicationId) y con Performance real (por externalPublicationId <->
// external_post_id) -- ninguna de las dos correlaciones inventa un vínculo:
// si no hay coincidencia real, se muestra explícito "Sin ContentPlan
// asociado" / "NOT AVAILABLE", nunca 0 ni un dato simulado.
async function openPublicationDetail(id) {
  const modal = $('#pubdetail-modal');
  const body = $('#pubdetail-body');
  body.innerHTML = '<p class="placeholder">Cargando…</p>';
  modal.classList.remove('hidden');
  try {
    const record = await api(`/api/schedule/${id}`);
    let plan = null;
    try { plan = (await api('/api/content-plans')).find((p) => p.publicationId === id) ?? null; } catch { /* ContentPlan API real puede no tener datos -- no rompe el detalle */ }
    let perf = null;
    if (record.externalPublicationId) {
      try { perf = (await api('/api/performance')).find((p) => p.external_post_id === record.externalPublicationId) ?? null; } catch { /* Performance API real puede no tener datos */ }
    }

    let html = `<div class="result-status ${record.status}">${SCHEDULE_STATUS_LABELS[record.status] ?? record.status}</div>`;
    html += renderAssetPackagePreview(record.assetPackageSnapshot);
    html += `<div class="pubdetail-grid">
      <div><strong>Plataforma</strong>${record.platform}</div>
      <div><strong>Publication ID</strong>${record.id}</div>
      <div><strong>External ID</strong>${record.externalPublicationId ?? 'NOT AVAILABLE'}</div>
      <div><strong>Fecha</strong>${record.publishedAt ? new Date(record.publishedAt).toLocaleString() : (record.scheduledAt ? new Date(record.scheduledAt).toLocaleString() : 'Sin fecha aún')}</div>
      <div><strong>Estado</strong>${record.status}</div>
      <div><strong>Permalink</strong>NOT AVAILABLE</div>
    </div>`;
    if (record.caption) html += `<p><strong>Caption:</strong> ${record.caption}</p>`;
    if (record.error) html += `<p style="color:#a04b3a;"><strong>Error real:</strong> ${record.error}</p>`;

    html += '<h4 style="margin-bottom:4px;">Strategy Decision / ContentPlan</h4>';
    html += plan
      ? contentPlanCard(plan)
      : '<p class="empty-state">Sin ContentPlan real asociado a esta publicación (creada directamente desde Crear/Editar/Adaptar).</p>';

    html += '<h4 style="margin-bottom:4px;">Performance</h4>';
    html += perf
      ? `<div class="campaign-card"><div style="font-size:12px;">engagement ${perf.metrics?.engagement ?? 'NOT AVAILABLE'} · views ${perf.metrics?.views ?? 'NOT AVAILABLE'} · likes ${perf.metrics?.likes ?? 'NOT AVAILABLE'} · comments ${perf.metrics?.comments ?? 'NOT AVAILABLE'} · shares ${perf.metrics?.shares ?? 'NOT AVAILABLE'} · saves ${perf.metrics?.saves ?? 'NOT AVAILABLE'}</div></div>`
      : '<p class="empty-state">NOT AVAILABLE -- sin datos de Performance todavía para este publicationId externo.</p>';

    body.innerHTML = html;
    bindAssetPreviewButtons(body);
    bindContentDetailButtons(body);
  } catch (err) {
    body.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}
$('#pubdetail-close')?.addEventListener('click', () => $('#pubdetail-modal').classList.add('hidden'));

// ---------------- REVIEW QUEUE (Human Review, Fase 14 Parte 12) ----------------
// Filtra ContentPlans reales READY_FOR_REVIEW + HUMAN_REVIEW y, cuando
// tienen un ScheduledPublication real vinculado (publicationId), reutiliza
// exactamente las mismas acciones reales de CALENDARIO (approve/cancel) --
// nunca una aprobación simulada en el frontend.
async function loadReviewQueue() {
  const el = $('#review-queue-list');
  el.innerHTML = '<p class="placeholder">Cargando…</p>';
  const plans = await api('/api/content-plans?status=READY_FOR_REVIEW&executionMode=HUMAN_REVIEW');
  if (plans.length === 0) {
    el.innerHTML = '<p class="empty-state">Sin contenido pendiente de revisión humana en este momento.</p>';
    return;
  }
  const withSchedule = await Promise.all(plans.map(async (p) => {
    if (!p.publicationId) return { plan: p, schedule: null };
    try { return { plan: p, schedule: await api(`/api/schedule/${p.publicationId}`) }; }
    catch { return { plan: p, schedule: null }; }
  }));
  el.innerHTML = withSchedule.map(({ plan, schedule }, i) => {
    const quality = plan.qualityGateResult ? (plan.qualityGateResult.passed ? 'PASS' : 'FAIL') : 'N/A';
    return `<div class="campaign-card" data-review-index="${i}">
      <strong>${plan.platform ?? '—'}${plan.product ? ` · ${plan.product}` : ''}</strong>
      <div style="font-size:12px;">Strategy: ${plan.strategyDecisionIds.length ? plan.strategyDecisionIds.join(', ') : 'sin StrategyDecision aplicable'} · Quality: ${quality}</div>
      ${schedule ? `<div style="font-size:12px;color:#6b654f;">Caption: ${schedule.caption ?? ''}</div>${renderAssetPackagePreview(schedule.assetPackageSnapshot)}` : '<p style="font-size:12px;color:#9c9683;">Sin AssetPackage real vinculado todavía -- produce el contenido vía Crear/Carrusel y usa "PROGRAMAR →".</p>'}
      <div class="schedule-actions" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
        ${schedule ? '<button class="btn-secondary" data-action="detail">VER DETALLE</button>' : ''}
        ${schedule?.status === 'DRAFT' ? '<button class="btn-secondary" data-action="approve">APROBAR</button>' : ''}
        ${schedule?.status === 'DRAFT' || schedule?.status === 'APPROVED' ? '<button class="btn-secondary" data-action="reject">RECHAZAR</button>' : ''}
        <button class="btn-secondary" data-action="edit">EDITAR</button>
      </div>
    </div>`;
  }).join('');
  bindAssetPreviewButtons(el);
  $$('[data-review-index]', el).forEach((card) => {
    const { plan, schedule } = withSchedule[Number(card.dataset.reviewIndex)];
    card.querySelector('[data-action="detail"]')?.addEventListener('click', () => openPublicationDetail(schedule.id));
    card.querySelector('[data-action="approve"]')?.addEventListener('click', async () => {
      const approvedBy = prompt('¿Quién aprueba esta publicación? (nombre real)');
      if (!approvedBy?.trim()) return;
      try { await api(`/api/schedule/${schedule.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvedBy }) }); loadReviewQueue(); }
      catch (err) { alert(err.message); }
    });
    card.querySelector('[data-action="reject"]')?.addEventListener('click', async () => {
      if (!confirm('¿Rechazar (cancelar) esta publicación?')) return;
      try { await api(`/api/schedule/${schedule.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); loadReviewQueue(); }
      catch (err) { alert(err.message); }
    });
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
      goto('edit');
      const sourcePath = schedule?.assetPackageSnapshot?.outputAssets?.[0]?.path;
      if (sourcePath) loadEditSources().then(() => { $('#edit-source').value = sourcePath; });
    });
  });
}

const calendarRunNowBtn = $('#calendar-run-now');
if (calendarRunNowBtn) {
  calendarRunNowBtn.addEventListener('click', async () => {
    calendarRunNowBtn.disabled = true; calendarRunNowBtn.textContent = 'VERIFICANDO…';
    try {
      const { processed } = await api('/api/schedule/run-now', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await renderCalendarList();
      alert(`${processed} publicación(es) vencida(s) procesada(s).`);
    } catch (err) {
      alert(err.message);
    } finally {
      calendarRunNowBtn.disabled = false; calendarRunNowBtn.textContent = 'VERIFICAR PUBLICACIONES VENCIDAS AHORA';
    }
  });
}

// ---------------- CONTENT DETAIL (Fase 15, Parte 7) ----------------
// Une, sin recalcular nada: ContentPlan real + ScheduledPublication real
// (si existe) + StrategyDecision/Learning reales (por id) + Performance
// real correlacionado -- exactamente los mismos datos ya reales que
// Content Plans / Review Queue / Publication Detail / Strategy Decisions /
// Learning ya muestran por separado, aquí unidos en una sola pantalla.
async function openContentDetail(planId) {
  const modal = $('#content-detail-modal');
  const body = $('#content-detail-body');
  body.innerHTML = '<p class="placeholder">Cargando…</p>';
  modal.classList.remove('hidden');
  try {
    const plan = await api(`/api/content-plans/${planId}`);
    let schedule = null;
    if (plan.publicationId) { try { schedule = await api(`/api/schedule/${plan.publicationId}`); } catch { /* publicationId real pero registro ya no existe -- se documenta abajo, nunca se inventa */ } }
    let decisions = [];
    if (plan.strategyDecisionIds.length) { try { decisions = (await api('/api/strategy-decisions')).filter((d) => plan.strategyDecisionIds.includes(d.id)); } catch { /* Strategy Decisions API real puede no tener datos */ } }
    let learnings = [];
    const learningIds = plan.strategyContext?.learningIds ?? [];
    if (learningIds.length) { try { learnings = (await api('/api/learning')).filter((l) => learningIds.includes(l.id)); } catch { /* Learning API real puede no tener datos */ } }
    let perf = null;
    if (schedule?.externalPublicationId) { try { perf = (await api('/api/performance')).find((p) => p.external_post_id === schedule.externalPublicationId) ?? null; } catch { /* Performance API real puede no tener datos */ } }

    const audioAsset = schedule?.assetPackageSnapshot?.audioAssets?.[0]?.path;

    let html = '<h4>CREATIVE</h4>';
    html += schedule ? renderAssetPackagePreview(schedule.assetPackageSnapshot) : '<p class="empty-state">Sin preview disponible: este ContentPlan no tiene una publicación real vinculada todavía.</p>';
    html += `<div class="pubdetail-grid">
      <div><strong>Hook</strong>NOT AVAILABLE (no persistido en ContentPlan real)</div>
      <div><strong>Guion</strong>NOT AVAILABLE (no persistido en ContentPlan real)</div>
      <div><strong>CTA</strong>${plan.cta ?? 'NOT AVAILABLE'}</div>
      <div><strong>Audio</strong>${audioAsset ? audioAsset.split(/[\\/]/).pop() : 'NOT AVAILABLE'}</div>
      <div><strong>Caption</strong>${schedule?.caption ?? 'NOT AVAILABLE'}</div>
      <div><strong>Formato</strong>${plan.format ?? 'NOT AVAILABLE'}</div>
      <div><strong>Producto</strong>${plan.product ?? 'NOT AVAILABLE'}</div>
      <div><strong>Plataforma</strong>${plan.platform ?? 'NOT AVAILABLE'}</div>
      <div><strong>Objetivo</strong>${plan.objective ?? 'NOT AVAILABLE'}</div>
      <div><strong>Fecha prevista</strong>${schedule?.scheduledAt ? new Date(schedule.scheduledAt).toLocaleString() : (plan.scheduledAt ? new Date(plan.scheduledAt).toLocaleString() : 'Sin fecha aún')}</div>
    </div>`;

    html += '<h4>STRATEGY</h4>';
    html += renderStrategyContextBadge(plan.strategyContext);
    html += decisions.length ? decisions.map(decisionCard).join('') : '<p class="empty-state">Sin StrategyDecision real vinculada.</p>';
    if (learnings.length) html += '<div style="font-size:12px;font-weight:700;margin-top:8px;">Learning / Evidence</div>' + learnings.map(learningCard).join('');

    html += '<h4>QUALITY</h4>';
    html += plan.qualityGateResult
      ? `<div class="campaign-card"><strong>${plan.qualityGateResult.passed ? 'PASS' : 'FAIL'}</strong>${plan.qualityGateResult.failures?.length ? `<div style="font-size:12px;color:#a04b3a;">${plan.qualityGateResult.failures.join(' · ')}</div>` : ''}</div>`
      : '<p class="empty-state">Sin resultado de Quality Gate real todavía.</p>';

    html += '<h4>PUBLICATION</h4>';
    html += `<div class="pubdetail-grid">
      <div><strong>ContentPlan Status</strong>${plan.status}</div>
      <div><strong>Execution Mode</strong>${plan.executionMode}</div>
      <div><strong>Publication Status</strong>${schedule ? (SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status) : 'Sin ScheduledPublication vinculada'}</div>
      <div><strong>External ID</strong>${schedule?.externalPublicationId ?? 'NOT AVAILABLE'}</div>
    </div>`;
    if (plan.autoPublish) html += `<p style="font-size:12px;">Auto Publish: ${plan.autoPublish.enabled ? 'ON' : 'OFF'} · Eligibility: ${plan.autoPublish.eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE'}${plan.autoPublish.reasons?.length ? ` · ${plan.autoPublish.reasons.join(' · ')}` : ''}</p>`;
    html += '<div class="schedule-actions" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;" id="content-detail-actions"></div>';

    html += '<h4>PERFORMANCE</h4>';
    html += perf
      ? `<div class="campaign-card"><div style="font-size:12px;">engagement ${perf.metrics?.engagement ?? 'NOT AVAILABLE'} · views ${perf.metrics?.views ?? 'NOT AVAILABLE'} · likes ${perf.metrics?.likes ?? 'NOT AVAILABLE'}</div></div>`
      : '<p class="empty-state">NOT AVAILABLE.</p>';

    body.innerHTML = html;
    bindAssetPreviewButtons(body);

    // DECISIÓN (Fase 15, Parte 5) -- reutiliza exactamente las mismas acciones reales ya usadas en Calendario/Revisión. APROBAR nunca implica PUBLICAR.
    const actionsEl = $('#content-detail-actions', body);
    const addAction = (label, cls, onClick) => { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.addEventListener('click', onClick); actionsEl.appendChild(b); };
    addAction('EDITAR', 'btn-secondary', () => {
      $('#whatsapp-conversation-modal')?.classList.add('hidden');
      modal.classList.add('hidden');
      goto('edit');
      const sourcePath = schedule?.assetPackageSnapshot?.outputAssets?.[0]?.path;
      if (sourcePath) loadEditSources().then(() => { $('#edit-source').value = sourcePath; });
    });
    addAction('REGENERAR', 'btn-secondary', () => {
      modal.classList.add('hidden');
      goto('autocreate');
      const intent = plan.generationRequest?.userIntent;
      if (intent) $('#autocreate-form textarea[name="userIntent"]').value = intent;
    });
    if (schedule?.status === 'DRAFT') {
      addAction('APROBAR', 'btn-secondary', async () => {
        const approvedBy = prompt('¿Quién aprueba esta publicación? (nombre real)');
        if (!approvedBy?.trim()) return;
        try { await api(`/api/schedule/${schedule.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvedBy }) }); openContentDetail(planId); }
        catch (err) { alert(err.message); }
      });
    }
    if (['DRAFT', 'APPROVED', 'SCHEDULED'].includes(schedule?.status)) {
      addAction('RECHAZAR', 'btn-secondary', async () => {
        if (!confirm('¿Rechazar (cancelar) esta publicación?')) return;
        try { await api(`/api/schedule/${schedule.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); openContentDetail(planId); }
        catch (err) { alert(err.message); }
      });
    }
    if (schedule && ['DRAFT', 'APPROVED'].includes(schedule.status)) {
      const gateMeta = { executionMode: plan.executionMode, product: plan.product, platform: plan.platform, strategyContext: plan.strategyContext, qualityGateResult: plan.qualityGateResult };
      addAction('PUBLICAR →', 'btn-primary', () => openPublishModal(schedule.assetPackageSnapshot, gateMeta));
      addAction('PROGRAMAR →', 'btn-secondary', () => openScheduleModal(schedule.assetPackageSnapshot, gateMeta));
    }
    if (schedule) addAction('VER PUBLICATION DETAIL', 'btn-secondary', () => openPublicationDetail(schedule.id));
  } catch (err) {
    body.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}
$('#content-detail-close')?.addEventListener('click', () => $('#content-detail-modal').classList.add('hidden'));

// ---------------- WHATSAPP CONSOLE (Fase 15, Partes 8-16) ----------------
// Lee/escribe exclusivamente vía dashboard/server/routes/whatsapp.js, que a
// su vez reutiliza crm/ (Postgres real) y whatsapp-adapter/graphApiSender.js
// (Meta real) -- este archivo nunca llama a Meta ni a Postgres directamente.
async function loadWhatsappStatus() {
  const el = $('#whatsapp-send-status');
  try {
    const { sendEnabled } = await api('/api/whatsapp/status');
    el.textContent = sendEnabled
      ? 'Envío real habilitado (WHATSAPP_ACCESS_TOKEN configurado) -- una respuesta manual real llegará a Meta.'
      : 'Envío real DESHABILITADO en este entorno (falta WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID) -- las respuestas manuales se validarán pero no se enviarán.';
    el.classList.toggle('ok', sendEnabled);
    el.classList.toggle('warn', !sendEnabled);
  } catch (err) {
    el.textContent = `No se pudo verificar el estado real de envío: ${err.message}`;
  }
}

function whatsappConversationCard(c) {
  const last = c.lastMessage;
  return `<div class="asset-card" data-wa-conversation-id="${c.conversationId}">
    <div class="body">
      <div class="filename">${c.contact}</div>
      <span class="tag ${c.estadoActual ? 'GENERATED' : ''}">${c.estadoActual ?? '—'}</span>
      <span class="tag ${c.source === 'REAL' ? 'FINAL' : ''}">${c.source}</span>
      <div class="meta" style="font-size:12px;margin-top:4px;">${last ? `${last.direccion === 'entrante' ? 'ENTRANTE' : 'SALIENTE'}: ${last.texto ?? ''}` : 'Sin mensajes todavía'}</div>
      <div class="meta" style="font-size:11px;color:#6b654f;margin-top:4px;">${c.ultimaInteraccion ? new Date(c.ultimaInteraccion).toLocaleString() : ''}</div>
      <button class="btn-secondary" data-action="open">ABRIR</button>
    </div>
  </div>`;
}
const WHATSAPP_SOURCE_LABELS = { REAL: 'reales', SIMULATED: 'simuladas', TEST: 'de prueba', FIXTURE: 'fixture', UNKNOWN: 'de origen desconocido', ALL: 'en total' };
async function loadWhatsappInbox() {
  const el = $('#whatsapp-inbox-list');
  const summaryEl = $('#whatsapp-source-summary');
  el.innerHTML = '<p class="placeholder">Cargando…</p>';
  const days = $('#whatsapp-days-filter').value;
  const source = $('#whatsapp-source-filter').value;
  try {
    const { conversations, totalInRange, bySource, appliedFilter } = await api(`/api/whatsapp/conversations?days=${days}&source=${source}`);
    const desglose = Object.entries(bySource).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${WHATSAPP_SOURCE_LABELS[k] ?? k}`).join(' · ');
    summaryEl.textContent = `${totalInRange} conversación(es) real(es) en este rango -- ${desglose || 'sin datos'}.`;
    if (conversations.length === 0) {
      el.innerHTML = appliedFilter === 'REAL' && totalInRange > 0
        ? `<p class="empty-state">No hay conversaciones REAL confirmadas todavía en este rango (${totalInRange} existen sin clasificar o de otro origen -- cambia el filtro "Origen" para verlas).</p>`
        : '<p class="empty-state">No hay conversaciones disponibles.</p>';
      return;
    }
    el.innerHTML = conversations.map(whatsappConversationCard).join('');
    $$('[data-wa-conversation-id]', el).forEach((card) => {
      card.querySelector('[data-action="open"]')?.addEventListener('click', () => openWhatsappConversation(card.dataset.waConversationId));
    });
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}
$('#whatsapp-days-filter')?.addEventListener('change', loadWhatsappInbox);
$('#whatsapp-source-filter')?.addEventListener('change', loadWhatsappInbox);

function whatsappMessageBubble(m) {
  const inbound = m.direccion === 'entrante';
  return `<div style="display:flex;justify-content:${inbound ? 'flex-start' : 'flex-end'};margin:6px 0;">
    <div style="max-width:70%;padding:8px 12px;border-radius:10px;background:${inbound ? 'var(--cream-3)' : 'var(--olive)'};color:${inbound ? 'var(--soft-black)' : 'var(--cream)'};">
      <div style="font-size:10px;opacity:0.75;text-transform:uppercase;">${inbound ? 'INBOUND (cliente)' : 'OUTBOUND (Vida Divina)'}</div>
      <div style="font-size:13px;">${m.texto ?? ''}</div>
      <div style="font-size:10px;opacity:0.6;margin-top:2px;">${new Date(m.timestamp).toLocaleString()}</div>
    </div>
  </div>`;
}
let currentWhatsappConversationId = null;
async function openWhatsappConversation(id) {
  currentWhatsappConversationId = id;
  const modal = $('#whatsapp-conversation-modal');
  const body = $('#whatsapp-conversation-body');
  body.innerHTML = '<p class="placeholder">Cargando…</p>';
  modal.classList.remove('hidden');
  try {
    const { conversation, contact, messages, opportunity } = await api(`/api/whatsapp/conversations/${id}`);
    let html = `<div class="pubdetail-grid">
      <div><strong>Contacto</strong>${contact?.nombre ?? conversation.waIdConversacion ?? 'NOT AVAILABLE'}</div>
      <div><strong>wa_id</strong>${conversation.waIdConversacion}</div>
      <div><strong>Estado</strong>${conversation.estadoActual ?? 'NOT AVAILABLE'}</div>
      <div><strong>Origen</strong>${conversation.source}</div>
      <div><strong>Última actividad</strong>${conversation.ultimaInteraccion ? new Date(conversation.ultimaInteraccion).toLocaleString() : 'NOT AVAILABLE'}</div>
      <div><strong>Producto (Opportunity)</strong>${opportunity?.productName ?? 'NOT AVAILABLE'}</div>
      <div><strong>Opportunity estado</strong>${opportunity?.estado ?? 'NOT AVAILABLE'}</div>
    </div>`;
    html += '<h4>Historial real</h4>';
    html += messages.length ? messages.map(whatsappMessageBubble).join('') : '<p class="empty-state">Sin mensajes todavía.</p>';
    html += `
      <h4>Respuesta manual</h4>
      <button class="btn-secondary" disabled title="AI response suggestion not available -- el único motor comercial real (simulator/src/flujoVentaReal.js) persiste estado como efecto secundario de calcular una respuesta; no existe una variante pura y reutilizable que pueda proponer un borrador sin también procesar el mensaje. Investigado en Fase 16 Parte 11 -- no se construyó un agente nuevo.">AI response suggestion not available</button>
      <form id="whatsapp-send-form" class="form-panel" style="margin-top:8px;">
        <label>Escribe una respuesta…
          <textarea name="text" rows="3" required></textarea>
        </label>
        <button type="submit" class="btn-primary">ENVIAR</button>
      </form>
      <div id="whatsapp-send-result"></div>
    `;
    body.innerHTML = html;

    const form = $('#whatsapp-send-form', body);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const resultEl = $('#whatsapp-send-result', body);
      btn.disabled = true; btn.textContent = 'ENVIANDO…';
      try {
        const result = await api(`/api/whatsapp/conversations/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: form.text.value }) });
        if (result.status === 'SENT') {
          resultEl.innerHTML = '<p style="color:#3a7a4e;">Enviado.</p>';
          openWhatsappConversation(id);
        } else if (result.status === 'CONFIGURATION_REQUIRED') {
          resultEl.innerHTML = `<p style="color:#7a5b12;">CONFIGURACIÓN REQUERIDA: ${result.reason}</p>`;
        } else {
          resultEl.innerHTML = `<p style="color:#a04b3a;">${result.error ?? result.status}</p>`;
        }
      } catch (err) {
        resultEl.innerHTML = `<p style="color:#a04b3a;">${err.message}</p>`;
      } finally {
        btn.disabled = false; btn.textContent = 'ENVIAR';
      }
    });
  } catch (err) {
    body.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}
$('#whatsapp-conversation-close')?.addEventListener('click', () => $('#whatsapp-conversation-modal').classList.add('hidden'));

// ---------------- Init ----------------
loadEngineStatus();
loadCommandCenter();
initCreateForm();
