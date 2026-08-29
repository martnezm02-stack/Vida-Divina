// app.js — frontend vanilla, sin build step. Toda la generación real pasa
// por fetch() hacia la API local (server/routes/*.js), que a su vez llama
// al Content Generation Engine real. Este archivo nunca genera contenido
// por sí mismo -- solo arma la solicitud y muestra el resultado real.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Etiquetas en español para valores técnicos que el backend expone en
// inglés/mayúsculas (IDs internos, sin tocar) pero que sí se muestran al
// usuario -- nunca se traduce el valor enviado a la API, solo el texto
// visible. Ver CLAUDE.md/UX cleanup 2026-08-26.
const OBJECTIVE_LABELS = {
  INSTAGRAM_ENGAGEMENT: 'Interacción en Instagram', WHATSAPP_CONVERSATIONS: 'Conversaciones por WhatsApp',
  BRAND_AWARENESS: 'Reconocimiento de marca', LEAD_GENERATION: 'Generación de prospectos', SALES: 'Ventas',
};
const FREQUENCY_LABELS = { DAILY: 'Diaria', EVERY_2_DAYS: 'Cada 2 días', WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal' };
const EXECUTION_MODE_LABELS = { PREPARE_ONLY: 'Solo preparar', HUMAN_REVIEW: 'Revisión humana', AUTO_PUBLISH: 'Publicación automática' };
const label = (dict, value) => dict[value] ?? value;

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({ error: 'Respuesta no válida del servidor.' }));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Error ${res.status}`), data);
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
  // Si se navega directo a una vista "Avanzado" (ej. desde un botón de
  // otra pantalla), la sección avanzada se despliega para que el usuario
  // vea cuál botón quedó activo -- nunca queda una pestaña activa oculta.
  const advancedBtn = $(`#topnav-advanced .navbtn[data-view="${view}"]`);
  if (advancedBtn) $('#topnav-advanced').classList.remove('hidden');
}
$$('.navbtn[data-view]').forEach((b) => b.addEventListener('click', () => goto(b.dataset.view)));
$('#nav-toggle-advanced')?.addEventListener('click', () => $('#topnav-advanced').classList.toggle('hidden'));
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
  // dataQualityStatus (Paso 22 del encargo): sufijo real solo cuando es
  // relevante (CONFLICT/INCOMPLETE/MISSING) -- nunca para VERIFIED, para
  // no saturar el dropdown real con una marca en cada opción.
  const sufijoCalidad = (p) => (p.dataQualityStatus && p.dataQualityStatus !== 'VERIFIED' ? ' (⚠️ requiere revisión)' : '');
  productSel.innerHTML = productsCache.map((p) => `<option value="${p.productSlug}">${p.nombreVisible ?? p.productSlug}${p.factsAvailable ? '' : ' (sin catálogo real)'}${sufijoCalidad(p)}</option>`).join('');
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
  // Corrección de flujo UI: ya NO es "required" a nivel de navegador --
  // con una "Instrucción / intención" real, este campo ni siquiera se usa
  // (Creative Director/Visual Director deciden el visual). Sin
  // instrucción (modo manual/literal), el servidor sigue validando esto
  // igual que antes (handleCreate) y muestra el mismo error real si falta.
}

// Creative Production Orchestrator (2026-08-24): pipeline visible por
// etapa (Paso 18) -- CREATIVE->SCRIPT->SCENES->ASSETS->VOICE->MUSIC->
// COMPOSITION->QA->OUTPUT. No construye una UI enorme -- un resumen real
// por job, con status explícito (FULL_PRODUCTION/DEGRADED_PRODUCTION/
// FAILED, nunca oculto) y enlaces reales a cada formato producido.
// Scope de módulo (Corrección de flujo UI "Crear contenido"): tanto el
// flujo de instrucción directa (runDirectStructureProposal, abajo) como
// las tarjetas de "Sugerir variantes" (más abajo) la reutilizan tal cual
// -- nunca duplicada.
// Etapa narrativa legible (Corrección "Hacer auditable la propuesta antes
// de producir", 2026-08-28) -- scope de módulo, compartida entre el
// resultado post-producción (productionJobStatusHtml) y la vista previa
// pre-producción (visual-plan-preview, más abajo), nunca duplicada.
const SECTION_TYPE_LABELS = { HOOK: 'Hook', STORY: 'Historia', PRODUCT: 'Producto', CTA: 'Llamado a la acción' };

function productionJobStatusHtml(job) {
  if (job.status === 'FAILED' && !job.scenePlan) {
    return `<div class="result-status VALIDATION_FAILED">${job.status}</div><p>${job.error}</p>`;
  }
  const escenas = job.scenePlan?.scenes?.length ?? 0;
  const conceptos = job.assetPlan ? new Set(job.assetPlan.map((a) => a.source)).size : 0;
  // Creative Director (Paso 23 del encargo): tratamiento visual real
  // elegido + fuente visual real usada -- nunca UUID/prompt técnico como
  // información principal.
  const VISUAL_SOURCE_LABELS = {
    EXISTING_PRODUCT_ASSET: 'Asset propio', GENERATED_IMAGE: 'Generado con IA', GENERATED_VIDEO: 'Generado con IA', STOCK_FOOTAGE: 'Stock', TYPOGRAPHIC: 'Tipográfico',
  };
  const fuentesVisuales = job.assetPlan
    ? [...new Set(job.assetPlan.map((a) => VISUAL_SOURCE_LABELS[a.source] ?? a.source))].join(', ')
    : '—';
  // Krea MCP Directo (Paso 18 del encargo Krea MCP Directo): proveedor/
  // modelo reales -- nunca el endpoint MCP, ni el token OAuth, ni ningún
  // UUID interno como información principal.
  const PROVIDER_LABELS = { 'krea-mcp': 'Krea', openai: 'OpenAI' };
  // Mismo vocabulario real ya mostrado antes de producir (ver
  // initModelRecommendation()/imageModelCatalog.js#displayName) -- id
  // real del catálogo -> nombre humano real, nunca el id técnico.
  const MODEL_DISPLAY_NAMES = {
    'krea-2-turbo': 'Krea 2 Turbo', 'krea-2-medium': 'Krea 2 Medium', 'krea-2-large': 'Krea 2 Large',
    'runway-gen4': 'Runway Gen-4', 'openai-gpt-image': 'GPT Image',
  };
  const chosenImageProvider = job.providerRouting?.image?.chosenProvider ?? null;
  const selectedModelId = job.visualStrategy?.selectedModel ?? null;
  const providerHtml = chosenImageProvider
    ? `<div class="variant-field"><strong>Proveedor</strong>${PROVIDER_LABELS[chosenImageProvider] ?? chosenImageProvider}</div>
       <div class="variant-field"><strong>Modelo</strong>${MODEL_DISPLAY_NAMES[selectedModelId] ?? '—'}</div>`
    : '';
  const treatmentHtml = job.visualStrategy?.visualTreatmentLabel
    ? `<div class="variant-field"><strong>Tratamiento visual</strong>${job.visualStrategy.visualTreatmentLabel}</div>
       <div class="variant-field"><strong>Fuente visual</strong>${fuentesVisuales}</div>
       ${providerHtml}`
    : '';
  // Creative Structure Engine (Paso 16 del encargo): "Así se contará la
  // pieza" -- secuencia narrativa real ya producida, para que el usuario
  // entienda la estructura antes/después de gastar el render real.
  const structureStages = job.scenePlan?.creativeStructure?.stages ?? [];
  const structureHtml = structureStages.length
    ? `<div class="variant-field"><strong>Así se contó la pieza</strong>${structureStages.map((s, i) => `${i + 1}. ${s}`).join(' → ')}</div>`
    : '';
  // Visual Continuity Context (Corrección "Crear contenido", Paso 8/9 del
  // encargo): mismo sujeto/entorno real ya usado en TODAS las escenas --
  // se muestra una vez, no por escena (es el MISMO valor real en cada
  // una).
  const vcc = job.visualStrategy?.visualContinuityContext;
  const vccParts = vcc ? [vcc.subjectDescription, vcc.environment].filter(Boolean) : [];
  const continuityHtml = vccParts.length
    ? `<div class="variant-field"><strong>Sujeto/entorno (consistente en todas las escenas)</strong>${vccParts.join(' · ')}</div>`
    : '';
  // Prompt Auditable (Paso 13/14 del encargo): el prompt EXACTO ya
  // enviado al provider real por escena, nunca reconstruido -- "Ver
  // prompt" es un <details> nativo (sin JS extra para abrir/cerrar),
  // "Copiar prompt" usa un listener real adjunto después del render (ver
  // attachPromptCopyHandlers, más abajo).
  // Visual Scene Brief (Corrección "Diversidad Visual", 2026-08-28, Paso
  // 14 del encargo): "Objetivo visual"/"Acción"/"Encuadre" legibles ANTES
  // del prompt técnico (que sigue colapsado por defecto, <details> nativo)
  // -- cruza por sceneId con job.scenePlan.scenes (mismo campo real ya
  // usado por creativeDirector.js, nunca un segundo cálculo). Sin
  // continuidad real (backward compatibility), esos campos no existen en
  // la escena real -- el bloque de brief simplemente no se muestra.
  const sceneById = new Map((job.scenePlan?.scenes ?? []).map((s) => [s.sceneId, s]));
  const promptsHtml = (job.visualGenerationRequests ?? []).filter((r) => r.generatedPrompt).map((r, i) => {
    const escenaReal = sceneById.get(r.sceneId);
    const briefHtml = escenaReal?.action
      ? `<div class="variant-field"><strong>Objetivo visual</strong>${escenaReal.narrativePurpose ?? '—'}</div>
         <div class="variant-field"><strong>Acción</strong>${escenaReal.action}</div>
         <div class="variant-field"><strong>Encuadre</strong>${escenaReal.shotType ?? '—'}${escenaReal.cameraAngle ? `, ángulo ${escenaReal.cameraAngle}` : ''}</div>`
      : '';
    return `
    <details class="scene-prompt-detail">
      <summary>Escena ${i + 1} — ${r.status} — <strong>Ver prompt</strong></summary>
      ${briefHtml}
      <div class="variant-field"><strong>Instrucción visual</strong>${r.promptSpec?.subject ?? '—'}</div>
      <pre class="scene-prompt-text">${r.generatedPrompt}</pre>
      <button type="button" class="btn-link btn-copy-prompt" data-prompt="${r.generatedPrompt.replace(/"/g, '&quot;')}">Copiar prompt</button>
    </details>
  `;
  }).join('');
  // Nombre humano real (Corrección "UI de Variantes Creativas", Paso 17
  // del encargo): o.displayName ya viene del backend (buildDisplayName(),
  // ver /api/create/produce) -- nunca output-<uuid>.mp4 como nombre
  // principal; el nombre técnico (profileName/aspectRatio) queda como meta.
  const outputsHtml = (job.outputs ?? []).map((o) => `
    <div class="variant-field"><strong>${o.displayName ?? o.profileName}</strong><span class="meta">${o.profileName} (${o.aspectRatio})</span> ${o.status}${o.mediaUrl ? ` — <a href="${o.mediaUrl}" target="_blank" rel="noopener">ver video</a>` : ''}</div>
  `).join('');
  // Plan visual por escena (Corrección "UI de Variantes Creativas", Paso 9
  // del encargo): Etapa/Objetivo/Acción/Encuadre reales, ya calculados por
  // Visual Scene Brief (job.scenePlan.scenes) -- nunca reconstruido aquí,
  // solo leído y presentado en un <details> colapsable.
  const scenePlanHtml = (job.scenePlan?.scenes ?? []).length
    ? `<details class="scene-prompt-detail">
        <summary><strong>Ver plan visual</strong> (${job.scenePlan.scenes.length} escena(s) real(es))</summary>
        ${job.scenePlan.scenes.map((s, i) => `
          <div class="variant-field"><strong>Escena ${i + 1} — ${SECTION_TYPE_LABELS[s.sectionType] ?? s.sectionType}</strong></div>
          ${s.narrativePurpose ? `<div class="variant-field"><strong>Objetivo</strong>${s.narrativePurpose}</div>` : ''}
          ${s.action ? `<div class="variant-field"><strong>Acción</strong>${s.action}</div>` : ''}
          ${s.shotType ? `<div class="variant-field"><strong>Encuadre</strong>${s.shotType}${s.cameraAngle ? `, ángulo ${s.cameraAngle}` : ''}</div>` : ''}
        `).join('')}
      </details>`
    : '';
  const qaHtml = (job.qualityReports ?? []).map((q) => `
    <div class="variant-field"><strong>QA ${q.profileName}</strong>${q.status}${q.warnings?.length ? ` (${q.warnings.length} advertencia(s) real(es))` : ''}</div>
  `).join('');
  const editorBtn = job.productionJobId
    ? `<button type="button" class="btn-secondary btn-open-editor" data-production-job-id="${job.productionJobId}">ABRIR EN EDITOR →</button>`
    : '';
  return `
    <div class="result-status ${job.status}">${job.status}</div>
    <div class="variant-field"><strong>Pipeline</strong>Script → ${escenas} escenas reales → ${conceptos} fuente(s) visual(es) → Voz real → ${job.musicSelection?.status === 'SUCCESS' ? 'Música real' : 'Sin música (no disponible)'} → Composición ffmpeg real → QA</div>
    ${structureHtml}
    ${continuityHtml}
    ${treatmentHtml}
    ${outputsHtml}
    ${qaHtml}
    <div class="variant-field"><strong>Costo estimado</strong>$${job.costReport?.estimatedTotal ?? 0} ${job.costReport?.currency ?? 'USD'}</div>
    ${scenePlanHtml}
    ${promptsHtml}
    ${editorBtn}
  `;
}

// FORMAT OUTPUT — HARD LOCK (Corrección "Master Creative Production Flow",
// 2026-08-29, Paso "FORMAT OUTPUT — HARD LOCK" del encargo):
// selectedFormats real ES la ÚNICA fuente de verdad real para qué
// formatos se producen -- lee EXACTAMENTE los checkboxes reales marcados
// en #create-profiles (ya poblados en initCreateForm(), ver arriba),
// NUNCA agrega un formato real que el usuario no marcó explícitamente
// (nunca "selectedFormats || defaultFormats"). Compartida real por TODOS
// los puntos de producción del flujo "Crear contenido" -- nunca un
// segundo cálculo/hardcode por handler.
function getSelectedOutputProfiles(form) {
  return $$('input[name="profile"]:checked', form).map((c) => c.value);
}

// Prompt Auditable (Paso 14 del encargo): adjunta el listener real de
// "Copiar prompt" DESPUÉS de insertar productionJobStatusHtml() vía
// innerHTML (los atributos onclick inline no son necesarios ni deseables
// -- mismo patrón real ya usado en el resto de este archivo). Debe
// llamarse en cada punto donde productionJobStatusHtml() se asigna a un
// contenedor real.
function attachPromptCopyHandlers(container) {
  container.querySelectorAll('.btn-copy-prompt').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.prompt);
        const original = btn.textContent;
        btn.textContent = 'Copiado ✓';
        setTimeout(() => { btn.textContent = original; }, 1500);
      } catch {
        // Portapapeles no disponible en este contexto (ej. sin HTTPS) --
        // el prompt real sigue visible/seleccionable en <pre>, nunca se
        // bloquea la función principal por esto.
      }
    });
  });
}

// Corrección de flujo UI ("Crear contenido"): "Estructura sugerida" real
// ANTES de producir, como panel de confirmación completo (Paso 4/5 del
// encargo) -- mismo dato real que ya devuelve
// /api/create/structure-recommendation (Creative Structure Engine, sin
// tocar), solo renderizado distinto al widget inline compacto que ya usan
// las tarjetas de "Sugerir variantes" (structureBlock, más abajo).
// Creative Angle / Hook Intelligence (Corrección "Evolución integral del
// Creative Director", 2026-08-28, Paso 29 del encargo): "Ángulo
// creativo"/"Hook sugerido" ANTES de Estructura -- mismos campos reales
// ya devueltos por propose-direct (primaryAngle/hookType/creativeVariant.copy.hook,
// ver creativeAngleSelector.js), nunca recalculados aquí.
// Hook Intelligence + Claim Relevance (Corrección "Hook Intelligence +
// Claim Relevance + Auto-QA", 2026-08-28, Paso 30 del encargo): Relevancia
// (score + categoría real -- nunca solo el número crudo) y Claims
// principales (CORE/SUPPORTING reales, nunca la lista completa del
// catálogo) se muestran ANTES de producir.
function hookRelevanceCategoryLabel(status, score) {
  if (status === 'LOW_CONFIDENCE') return `⚠️ Confianza baja (${(score ?? 0).toFixed(2)})`;
  return `✅ Aceptado (${(score ?? 0).toFixed(2)})`;
}

// Auto-QA global (Corrección "Cierre del Creative Director", 2026-08-28,
// Paso 9 del encargo): "✅ Lista para producir" / "⚠️ Confianza baja" --
// NUNCA los cálculos internos completos (Paso 9: "no mostrar todos los
// cálculos"). "Revisión automática aplicada" cuando el hookMode real ya
// es user_edited (el usuario ya intervino sobre lo que el sistema
// propuso).
function creativeQualityLabel(proposal) {
  const base = proposal.creativeQualityStatus === 'ACCEPTED' ? '✅ Lista para producir' : '⚠️ Confianza baja';
  return proposal.hookMode === 'user_edited' ? `${base} <span class="meta">(hook editado por usuario)</span>` : base;
}

function creativeAngleProposalHtml(proposal) {
  const angleHtml = proposal.primaryAngle
    ? `<strong>${proposal.primaryAngle.label}</strong>${proposal.secondaryAngle ? ` <span class="meta">(con matiz de ${proposal.secondaryAngle.label})</span>` : ''}`
    : '<span class="meta">Sin ángulo creativo detectado real en la instrucción.</span>';
  const claims = proposal.relevantClaims;
  const claimsHtml = claims && (claims.core.length || claims.supporting.length)
    ? `<h3>Claims principales</h3><p>${[...claims.core.map((c) => `<strong>${c}</strong>`), ...claims.supporting.map((c) => c)].join(' · ')}</p>`
    : '';
  return `
    <div class="panel creative-angle-proposal">
      <h3>Calidad de la propuesta</h3>
      <p>${creativeQualityLabel(proposal)}</p>
      <h3>Ángulo creativo</h3>
      <p>${angleHtml}</p>
      <h3>Hook sugerido</h3>
      <p><strong id="proposal-hook-text">${proposal.creativeVariant.copy.hook}</strong>${proposal.hookType ? ` <span class="meta">(${proposal.hookType.label})</span>` : ''}
        <button type="button" class="btn-link btn-edit-hook">Editar</button>
        <button type="button" class="btn-link btn-regenerate-hook">Regenerar</button>
      </p>
      <div class="hook-edit-box hidden">
        <input type="text" class="hook-edit-input" />
        <button type="button" class="btn-primary btn-save-hook">Guardar</button>
        <button type="button" class="btn-link btn-cancel-hook-edit">Cancelar</button>
      </div>
      <h3>Relevancia</h3>
      <p>${hookRelevanceCategoryLabel(proposal.hookQualityStatus, proposal.hookRelevanceScore)}</p>
      ${claimsHtml}
    </div>
  `;
}

function structureProposalHtml(rec) {
  const stagesHtml = rec.recommended.stages.map((s, i) => `${i + 1}. ${s}`).join(' → ');
  const optionsHtml = rec.options.map((o) => `<option value="${o.structureId}"${o.structureId === rec.recommended.structureId ? ' selected' : ''}>${o.label} (${o.stages.join(' → ')})</option>`).join('');
  return `
    <div class="panel structure-proposal">
      <h3>Estructura sugerida</h3>
      <p><strong>${rec.recommended.label}</strong></p>
      <p class="meta">Motivo: ${rec.recommended.recommendationReason}</p>
      <div class="variant-field"><strong>Así se contará la pieza</strong>${stagesHtml}</div>
      <select class="direct-structure-select hidden">${optionsHtml}</select>
      <div class="structure-proposal-actions">
        <button type="button" class="btn-primary btn-use-structure">Usar estructura sugerida →</button>
        <button type="button" class="btn-link btn-change-structure-direct">Cambiar estructura</button>
      </div>
    </div>
  `;
}

// Generation Settings (Creative Structure + Generation Settings, Paso
// 9/20 del encargo): vocabulario real exacto pedido para "Calidad
// sugerida" -- mismo texto real que QUALITY_TIER_DESCRIPTIONS
// (content-orchestrator/src/generationSettings.js), duplicado aquí SOLO
// porque el navegador no puede importar ese módulo de servidor (no es
// lógica, es vocabulario fijo del encargo).
const GENERATION_QUALITY_SHORT_LABELS = { FAST: 'Rápida', STANDARD: 'Estándar', HIGH: 'Alta', PREMIUM: 'Premium' };
const GENERATION_QUALITY_LABELS = {
  FAST: 'Rápida · menor consumo',
  STANDARD: 'Equilibrio entre calidad y consumo',
  HIGH: 'Mayor detalle · mayor consumo',
  PREMIUM: 'Máxima calidad disponible · mayor consumo',
};

/**
 * Generation Settings (Paso 6/20 del encargo): "Modelo sugerido" +
 * "Calidad sugerida" -- mismo dato real que ya devuelve
 * /api/create/model-recommendation (Creative Director, sin tocar su
 * lógica), solo renderizado como panel de confirmación completo (mismo
 * patrón visual que structureProposalHtml, arriba).
 */
function generationSettingsProposalHtml(preview) {
  const gs = preview.generationSettings ?? {};
  const models = preview.availableModels ?? [];
  const recommendedModelInfo = models.find((m) => m.id === gs.recommendedModel);
  const modelOptions = models.map((m) => `<option value="${m.id}"${m.id === gs.selectedModel ? ' selected' : ''}>${m.displayName} — ${m.shortComment}</option>`).join('');
  const qualityOptions = (gs.availableQualities ?? []).map((q) => `<option value="${q}"${q === gs.selectedQuality ? ' selected' : ''}>${GENERATION_QUALITY_LABELS[q] ?? q}</option>`).join('');
  const visualIntentHtml = preview.visualIntent
    ? `<div class="variant-field"><strong>Visual Intent</strong>${preview.visualIntent}</div>`
    : '';
  return `
    <div class="panel generation-settings-proposal">
      ${visualIntentHtml}
      <h3>Modelo sugerido</h3>
      <p><strong>${recommendedModelInfo?.displayName ?? (gs.recommendedModel ? gs.recommendedModel : 'Ningún modelo real disponible en este entorno')}</strong></p>
      <p class="meta">Motivo: ${gs.recommendationReason ?? '—'}</p>
      <select class="direct-model-select hidden">${modelOptions}</select>
      <h3>Calidad sugerida</h3>
      <p><strong>${GENERATION_QUALITY_SHORT_LABELS[gs.recommendedQuality] ?? '—'}</strong></p>
      <p class="meta">${gs.qualityRecommendationReason ?? GENERATION_QUALITY_LABELS[gs.recommendedQuality] ?? ''}</p>
      <select class="direct-quality-select hidden">${qualityOptions}</select>
      <div class="generation-settings-actions">
        <button type="button" class="btn-primary btn-use-generation-settings">Usar recomendaciones →</button>
        <button type="button" class="btn-link btn-change-model-direct"${models.length > 1 ? '' : ' disabled'}>Cambiar modelo</button>
        <button type="button" class="btn-link btn-change-quality-direct"${(gs.availableQualities ?? []).length > 1 ? '' : ' disabled'}>Cambiar calidad</button>
      </div>
    </div>
  `;
}

/**
 * Flujo de confirmación (Paso 21 del encargo): Estructura sugerida ->
 * Modelo sugerido -> Calidad sugerida -> usuario acepta o cambia ->
 * Producir. Se llama DESPUÉS de aceptar la estructura (runDirectStructureProposal,
 * abajo) -- reusa /api/create/model-recommendation (Creative Director, sin
 * tocar), ahora extendido con generationSettings. "Cambiar modelo"
 * recalcula la calidad disponible real (Paso 13/22): vuelve a pedir la
 * recomendación con el modelo elegido, nunca asume compatibilidad.
 */
async function renderGenerationSettingsStep({
  form, resultEl, rawText, batchId, selectedStructureId,
}) {
  resultEl.innerHTML = '<p class="placeholder">Consultando Creative Director (modelo + calidad reales)…</p>';

  async function fetchPreview(selectedModelId, selectedQuality) {
    const qs = new URLSearchParams({ batchId, variantIndex: '0', userInstruction: rawText });
    if (selectedModelId) qs.set('selectedModelId', selectedModelId);
    if (selectedQuality) qs.set('selectedQuality', selectedQuality);
    return api(`/api/create/model-recommendation?${qs.toString()}`);
  }

  async function render(selectedModelId, selectedQuality) {
    const preview = await fetchPreview(selectedModelId, selectedQuality);
    resultEl.innerHTML = generationSettingsProposalHtml(preview);

    const modelSelect = $('.direct-model-select', resultEl);
    const qualitySelect = $('.direct-quality-select', resultEl);
    const changeModelBtn = $('.btn-change-model-direct', resultEl);
    const changeQualityBtn = $('.btn-change-quality-direct', resultEl);
    const useBtn = $('.btn-use-generation-settings', resultEl);

    changeModelBtn.addEventListener('click', () => modelSelect.classList.toggle('hidden'));
    changeQualityBtn.addEventListener('click', () => qualitySelect.classList.toggle('hidden'));
    // Cambiar modelo recalcula la calidad disponible real (Paso 13/22) --
    // vuelve a pedir la recomendación completa con el modelo nuevo, nunca
    // reutiliza la calidad vieja a ciegas.
    modelSelect.addEventListener('change', () => render(modelSelect.value, null));

    useBtn.addEventListener('click', async () => {
      const finalModelId = modelSelect.classList.contains('hidden') ? null : modelSelect.value;
      const finalQuality = qualitySelect.classList.contains('hidden') ? null : qualitySelect.value;
      const outputProfileNames = $$('input[name="profile"]:checked', form).map((c) => c.value);
      useBtn.disabled = true; useBtn.textContent = 'PRODUCIENDO…';
      resultEl.insertAdjacentHTML('beforeend', '<p class="placeholder">Produciendo pieza audiovisual real (Scene Planner → Visual Director → Provider Router → Krea)… puede tardar varios minutos.</p>');
      try {
        const job = await api('/api/create/produce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId, variantIndex: 0, userInstruction: rawText, selectedStructureId,
            imageModelId: finalModelId, selectedQuality: finalQuality,
            outputProfileNames: outputProfileNames.length ? outputProfileNames : undefined,
          }),
        });
        resultEl.innerHTML = productionJobStatusHtml(job);
        attachPromptCopyHandlers(resultEl);
      } catch (err) {
        resultEl.insertAdjacentHTML('beforeend', `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`);
      }
    });
  }

  await render(null, null);
}

/**
 * Corrección de flujo UI ("Crear contenido", instrucción directa, Paso
 * "DETENER — CORRECCIÓN DE FLUJO UI" del encargo): separa PROPOSAL de
 * PRODUCTION. Con una instrucción real ("Instrucción / intención"),
 * "Generar" YA NO produce directamente -- primero ejecuta SOLO
 * CampaignIntent -> Creative Strategy -> Creative Director -> Creative
 * Structure Engine (vía el nuevo /api/create/propose-direct + el ya
 * existente /api/create/structure-recommendation, ninguno de los dos
 * reimplementado aquí), luego Modelo/Calidad sugeridos
 * (renderGenerationSettingsStep, arriba), y exige que el usuario acepte o
 * cambie TODO ANTES de continuar a Scene Planner -> Visual Director ->
 * Provider Router -> Krea -> producción (/api/create/produce, ya
 * existente, sin tocar).
 */
async function runDirectStructureProposal({ form, btn, resultEl, rawText }) {
  btn.disabled = true; btn.textContent = 'CALCULANDO PROPUESTA…';
  resultEl.innerHTML = '<p class="placeholder">Consultando Creative Director + Creative Structure Engine real (sin producir todavía)…</p>';
  // Estado del formulario (Corrección "Crear contenido", Paso 6 del
  // encargo): marca de qué Producto+Instrucción real viene ESTA propuesta
  // -- invalidateStaleProposal() (más abajo) la compara contra el valor
  // actual del formulario para nunca mezclar "propuesta A" con un cambio
  // posterior de producto/instrucción.
  resultEl.dataset.proposalFor = JSON.stringify({ productId: form.productId.value, rawText });
  try {
    const proposal = await api('/api/create/propose-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: form.productId.value, rawText,
        hookText: form.hookText.value || null, ctaText: form.ctaText.value || null,
      }),
    });
    if (!proposal.batchId) {
      resultEl.innerHTML = `<div class="result-status ${proposal.status ?? 'VALIDATION_FAILED'}">${proposal.status ?? 'ERROR'}</div><p>${(proposal.errors ?? []).join(' ') || 'No se pudo calcular una propuesta creativa real para esta instrucción.'}</p>`;
      return;
    }

    // Control manual de hook (Corrección "Cierre del Creative Director",
    // 2026-08-28, Paso 19-23 del encargo): "showProposal" real es
    // reutilizable -- la llamada inicial Y cada [Guardar]/[Regenerar] real
    // re-renderizan el MISMO flujo real (Ángulo/Hook/Estructura), nunca
    // uno paralelo.
    async function showProposal(currentProposal) {
      const { batchId } = currentProposal;
      const rec = await api(`/api/create/structure-recommendation?batchId=${batchId}&variantIndex=0&userInstruction=${encodeURIComponent(rawText)}`);
      resultEl.innerHTML = creativeAngleProposalHtml(currentProposal) + structureProposalHtml(rec);

      // Editar/Regenerar hook (Paso 19-23 del encargo): "Editar" revela un
      // input real pre-lleno con el hook real vigente; "Regenerar" pide un
      // candidato real nuevo (excluyendo el hookId real actual, ver
      // /api/create/regenerate-hook) y lo precarga en el mismo input real
      // para que el usuario lo revise antes de "Guardar" -- NUNCA sustituye
      // el hook real en silencio.
      const hookBox = $('.hook-edit-box', resultEl);
      const hookInput = $('.hook-edit-input', resultEl);
      $('.btn-edit-hook', resultEl)?.addEventListener('click', () => {
        hookInput.value = currentProposal.creativeVariant.copy.hook;
        hookBox.classList.remove('hidden');
        hookInput.focus();
      });
      $('.btn-regenerate-hook', resultEl)?.addEventListener('click', async (ev) => {
        const regenBtn = ev.currentTarget;
        regenBtn.disabled = true; regenBtn.textContent = 'REGENERANDO…';
        try {
          const nuevo = await api('/api/create/regenerate-hook', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId, variantIndex: 0, userInstruction: rawText }),
          });
          if (nuevo.hook) {
            hookInput.value = nuevo.hook;
            hookBox.classList.remove('hidden');
            hookInput.focus();
          }
        } catch { /* fallo real de red -- el usuario puede reintentar, nunca rompe la propuesta ya mostrada. */ }
        regenBtn.disabled = false; regenBtn.textContent = 'Regenerar';
      });
      $('.btn-cancel-hook-edit', resultEl)?.addEventListener('click', () => hookBox.classList.add('hidden'));
      $('.btn-save-hook', resultEl)?.addEventListener('click', async () => {
        const hookEditado = hookInput.value.trim();
        if (!hookEditado) return;
        // Re-evaluación real (Paso 23 del encargo): re-llama a
        // propose-direct real con el hook real editado como hookText --
        // MISMO mecanismo real ya existente (nunca uno nuevo), obtiene un
        // creativeQualityScore real que refleja el texto real del
        // usuario, nunca el candidato descartado.
        const nuevaPropuesta = await api('/api/create/propose-direct', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: form.productId.value, rawText, hookText: hookEditado }),
        });
        if (nuevaPropuesta.batchId) await showProposal(nuevaPropuesta);
      });

      const selectEl = $('.direct-structure-select', resultEl);
      const changeBtn = $('.btn-change-structure-direct', resultEl);
      const useBtn = $('.btn-use-structure', resultEl);
      if (rec.options.length > 1) {
        changeBtn.addEventListener('click', () => selectEl.classList.toggle('hidden'));
      } else {
        changeBtn.classList.add('hidden');
      }

      useBtn.addEventListener('click', async () => {
        // selectionMode: si el selector sigue oculto (el usuario nunca lo
        // tocó), se envía selectedStructureId=null -> el servidor lo
        // registra como "automatic" (recomendación aceptada tal cual);
        // visible = el usuario cambió la estructura -> "user_selected"
        // (mismo criterio real que Modelo Sugerido + Selección Manual).
        const selectedStructureId = selectEl.classList.contains('hidden') ? null : selectEl.value;
        // Flujo de confirmación (Paso 21 del encargo): Estructura aceptada ->
        // ahora Modelo/Calidad sugeridos (Generation Settings) -- NUNCA
        // produce todavía.
        await renderGenerationSettingsStep({
          form, resultEl, rawText, batchId, selectedStructureId,
        });
      });
    }

    await showProposal(proposal);
  } catch (err) {
    resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
  } finally {
    btn.disabled = false; btn.textContent = 'GENERAR';
  }
}

// Estado del formulario (Corrección "Crear contenido", Paso 6 del
// encargo): si Producto o Instrucción/intención cambian DESPUÉS de que ya
// se mostró una propuesta/producción real (marcada por
// resultEl.dataset.proposalFor, ver runDirectStructureProposal), esa
// propuesta queda obsoleta -- nunca se deja al usuario aceptar/producir
// "estructura nueva + voiceover viejo" (Paso 6: "no mezclar propuesta A
// con voiceover B con visual plan C"). Los botones [Usar estructura
// sugerida]/[Usar recomendaciones]/[Producir] que ya estaban en el DOM
// quedan huérfanos del panel reemplazado -- inertes, nunca se re-envían.
function invalidateStaleProposal() {
  const form = $('#create-form');
  const resultEl = $('#create-result');
  const stale = resultEl?.dataset?.proposalFor;
  if (!stale) return;
  const current = JSON.stringify({ productId: form.productId.value, rawText: form.rawText.value.trim() });
  if (current !== stale) {
    delete resultEl.dataset.proposalFor;
    resultEl.innerHTML = '<p class="placeholder">Producto o instrucción cambiaron -- pulsa GENERAR de nuevo para una propuesta real coherente con el nuevo valor.</p>';
  }
}
$('#create-product')?.addEventListener('change', invalidateStaleProposal);
$('#create-form textarea[name="rawText"]')?.addEventListener('input', invalidateStaleProposal);

$('#create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const resultEl = $('#create-result');
  const rawText = form.rawText.value.trim();
  delete resultEl.dataset.proposalFor;

  // Corrección de flujo UI: con una instrucción real, el flujo pasa por
  // el gate de Creative Structure Engine (arriba) en vez de producir
  // directamente. Sin instrucción, el formulario sigue siendo 100%
  // manual/literal -- comportamiento preexistente intacto (compatibilidad
  // hacia atrás, ningún proyecto existente se rompe).
  if (rawText) {
    await runDirectStructureProposal({ form, btn, resultEl, rawText });
    return;
  }

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

// Creative Factory (2026-08-23): "Sugerir variantes (hipótesis)" en Crear
// Contenido -- mismo hypothesisCreativeEngine que Crear Autónomo (nunca un
// segundo motor, ver dashboard/server/routes/generation.js#
// handleSuggestHypothesisVariants). Cada clic pide un Batch NUEVO real
// (backend: nextBatchNumber/blueprintOffset/usedFingerprints reales vía
// hypothesisBatchStore.js) -- el batch anterior NUNCA se reemplaza, se
// añade un panel más al contenedor. "GENERAR MÁS VARIANTES" reemplaza el
// texto del botón después del primer batch, para dejar claro que no es
// "repetir", es "otro lote nuevo".
const createSuggestBtn = $('#create-suggest-hypothesis-btn');
if (createSuggestBtn) {
  let lastCampaignKey = null;

  function readCampaignBrief() {
    const targetAudience = $('#campaign-target-audience')?.value.trim() || undefined;
    const problemOrNeed = $('#campaign-problem')?.value.trim() || undefined;
    if (!targetAudience && !problemOrNeed) return {};
    return {
      targetAudience,
      problemOrNeed,
      campaignTerritory: $('#campaign-territory')?.value.trim() || undefined,
      desiredOutcome: $('#campaign-desired-outcome')?.value.trim() || undefined,
      campaignObjective: $('#campaign-objective')?.value || undefined,
      awarenessStage: $('#campaign-awareness-stage')?.value || undefined,
    };
  }

  function relevanceBadgeHtml(rel) {
    if (!rel?.applicable) return '';
    const cls = rel.score >= 50 ? 'relevance-high' : rel.score >= 15 ? 'relevance-mid' : 'relevance-low';
    return `<span class="relevance-badge ${cls}" title="Solapamiento léxico real entre el copy y el territorio/problema/audiencia de la campaña">Relevancia campaña: ${rel.score}/100</span>`;
  }

  // Creative Strategy Engine (2026-08-24): inserta, en la tarjeta BASE
  // compartida (variantCardHtml, misma que usa Crear Autónomo -- nunca
  // duplicada), el concepto/ángulo/hook real y el score de relevancia
  // real -- para que se entienda POR QUÉ esta variante pertenece a ESTA
  // campaña, no a cualquier otra del mismo producto (Paso 10 del
  // encargo). Se inserta justo antes del botón real (marcador de texto
  // estable, nunca depende del índice/whitespace exacto de la plantilla).
  function variantCardWithRelevanceHtml(v, index) {
    const extra = `
      <div class="variant-field"><strong>Concepto / Ángulo</strong>${v.conceptId ?? '—'} <span class="meta">(hook: ${v.hookId ?? '—'})</span></div>
      ${relevanceBadgeHtml(v.campaignRelevance)}
    `;
    const marcador = '<button type="button" class="btn-secondary btn-use-variant"';
    const conBoton = variantCardHtml(v, index).replace(marcador, `${extra}${marcador}`);
    // Creative Production Orchestrator (2026-08-24): botón real "PRODUCIR
    // VIDEO REAL" -- llama a /api/create/produce (guion+escenas+voz
    // real+captions+música si hay+composición ffmpeg real+QA+formatos),
    // NUNCA regenera la campaña/copy (usa esta MISMA variante ya
    // persistida). Estado del pipeline visible por etapa (Paso 18).
    // Modelo Sugerido + Selección Manual (2026-08-27): "el sistema
    // recomienda, el usuario decide" -- carga real vía GET
    // /api/create/model-recommendation (initModelRecommendation()), NUNCA
    // nombres técnicos de endpoint/UUID como texto principal.
    const modelBlock = `
      <div class="model-recommendation" data-variant-index="${index}">
        <span class="model-suggestion-label" data-variant-index="${index}">Calculando modelo sugerido…</span>
        <button type="button" class="btn-link btn-change-model hidden" data-variant-index="${index}">Cambiar modelo</button>
        <select class="model-select hidden" data-variant-index="${index}"></select>
        <div class="variant-field" data-variant-index="${index}"><strong>Referencia visual del producto</strong><span class="product-reference-status" data-variant-index="${index}">Calculando…</span></div>
      </div>`;
    // Creative Structure Engine (Paso 9/16 del encargo): "Estructura
    // sugerida" real + "Cambiar estructura" -- mismo patrón real que
    // modelBlock (el sistema recomienda, el usuario decide), ANTES de
    // producir (voiceover real es costoso).
    const structureBlock = `
      <div class="model-recommendation structure-recommendation" data-variant-index="${index}">
        <span class="structure-suggestion-label" data-variant-index="${index}">Calculando estructura sugerida…</span>
        <button type="button" class="btn-link btn-change-structure hidden" data-variant-index="${index}">Cambiar estructura</button>
        <select class="structure-select hidden" data-variant-index="${index}"></select>
      </div>`;
    const produceBlock = `
      ${structureBlock}
      ${modelBlock}
      <button type="button" class="btn-secondary btn-produce-creative" data-variant-index="${index}">PRODUCIR VIDEO REAL →</button>
      <div class="production-status hidden" data-variant-index="${index}"></div>`;
    const marcadorUsar = 'USAR ESTA VARIANTE →</button>';
    return conBoton.replace(marcadorUsar, `${marcadorUsar}${produceBlock}`);
  }

  function batchSectionHtml(batch) {
    const cards = batch.variantsDetail.map((v, i) => variantCardWithRelevanceHtml(v, i)).join('');
    const ci = batch.campaignIntent;
    const campaignHeader = ci
      ? `<div class="meta">Campaña: <strong>${ci.targetAudience}</strong> — ${ci.campaignTerritory} (${ci.campaignObjective}, ${ci.awarenessStage})</div>`
      : '<div class="meta">Sin brief de campaña -- hipótesis genéricas de producto.</div>';
    return `
      <div class="panel hypothesis-batch" data-batch-number="${batch.batchNumber}">
        <div class="result-status HYPOTHESIS_EXPERIMENT_READY">BATCH #${batch.batchNumber} — ${batch.variantsDetail.length} VARIANTES</div>
        ${campaignHeader}
        <div class="hypothesis-banner">
          No encontramos una dirección creativa validada (Evidence-Based) para este objetivo.
          Como todavía estamos construyendo historial de clientes, creamos un experimento basado
          en hipótesis usando únicamente información documentada del producto. ${batch.disclaimer ?? ''}
        </div>
        <div class="variant-grid">${cards}</div>
      </div>
    `;
  }

  function attachUseVariantHandlers(sectionEl, batch, form, container) {
    sectionEl.querySelectorAll('.btn-use-variant').forEach((b) => {
      b.addEventListener('click', () => {
        const variant = batch.variantsDetail[Number(b.dataset.variantIndex)];
        form.hookText.value = variant.copy.hook ?? '';
        form.ctaText.value = variant.copy.cta ?? '';
        if (form.productBody) form.productBody.value = variant.copy.primaryText ?? '';
        applyVideoScriptToCreateForm(form, variant);
        container.classList.add('hidden');
      });
    });
  }

  // Modelo Sugerido + Selección Manual (2026-08-27): "el sistema
  // recomienda, el usuario decide" -- carga real vía GET
  // /api/create/model-recommendation ANTES de producir (voiceover real es
  // costoso, esto es solo lectura). Nunca muestra UUID/prompt técnico
  // como texto principal (Paso "IMPORTANTE" del encargo).
  async function initModelRecommendation(sectionEl, batch) {
    const widgets = [...sectionEl.querySelectorAll('.model-recommendation')];
    await Promise.all(widgets.map(async (widget) => {
      const idx = widget.dataset.variantIndex;
      const labelEl = widget.querySelector('.model-suggestion-label');
      const changeBtn = widget.querySelector('.btn-change-model');
      const selectEl = widget.querySelector('.model-select');
      try {
        const rec = await api(`/api/create/model-recommendation?batchId=${batch.batchId}&variantIndex=${idx}`);
        if (!rec.recommendedModel) {
          labelEl.textContent = 'Sin modelo de imagen disponible en este entorno.';
          return;
        }
        labelEl.innerHTML = `Modelo sugerido: <strong>${rec.recommendedModel.displayName} ✓</strong><br><span class="meta">${rec.recommendedModel.shortComment} — ${rec.recommendationReason}</span>`;
        selectEl.innerHTML = rec.availableModels.map((m) => `<option value="${m.id}"${m.id === rec.recommendedModel.id ? ' selected' : ''}>${m.displayName} — ${m.costTierLabel}</option>`).join('');
        if (rec.availableModels.length > 1) {
          changeBtn.classList.remove('hidden');
          changeBtn.addEventListener('click', () => selectEl.classList.toggle('hidden'));
        }
        // Referencia visual del producto (Corrección "Flujo creativo
        // integral", 2026-08-28, Paso 27 del encargo): aviso ANTES de
        // producir -- nunca "produce silenciosamente" sin fotografía real
        // cuando el producto podría necesitar mostrarse físicamente.
        const refEl = widget.querySelector('.product-reference-status');
        if (refEl && rec.assetRequirements) {
          refEl.innerHTML = rec.assetRequirements.productAssetAvailable
            ? '✅ Fotografía seleccionada'
            : '⚠️ Sin fotografía del producto -- para mostrar el producto físicamente necesitas seleccionar una fotografía real del producto.';
        }
      } catch {
        labelEl.textContent = 'No se pudo calcular el modelo sugerido (se producirá con el fallback real disponible).';
      }
    }));
  }

  // Creative Structure Engine (Paso 9/16 del encargo): "el sistema
  // recomienda, el usuario decide" -- carga real vía GET
  // /api/create/structure-recommendation ANTES de producir. Mismo patrón
  // real que initModelRecommendation(), sin duplicar su lógica de red
  // (llamada independiente, misma forma).
  async function initStructureRecommendation(sectionEl, batch) {
    const widgets = [...sectionEl.querySelectorAll('.structure-recommendation')];
    await Promise.all(widgets.map(async (widget) => {
      const idx = widget.dataset.variantIndex;
      const labelEl = widget.querySelector('.structure-suggestion-label');
      const changeBtn = widget.querySelector('.btn-change-structure');
      const selectEl = widget.querySelector('.structure-select');
      try {
        const rec = await api(`/api/create/structure-recommendation?batchId=${batch.batchId}&variantIndex=${idx}`);
        labelEl.innerHTML = `Estructura sugerida: <strong>${rec.recommended.label} ✓</strong><br><span class="meta">${rec.recommended.recommendationReason}</span>`;
        selectEl.innerHTML = rec.options.map((o) => `<option value="${o.structureId}"${o.structureId === rec.recommended.structureId ? ' selected' : ''}>${o.label}</option>`).join('');
        if (rec.options.length > 1) {
          changeBtn.classList.remove('hidden');
          changeBtn.addEventListener('click', () => selectEl.classList.toggle('hidden'));
        }
      } catch {
        labelEl.textContent = 'No se pudo calcular la estructura sugerida (se producirá con el enfoque real por defecto).';
      }
    }));
  }

  function attachProduceHandlers(sectionEl, batch) {
    initModelRecommendation(sectionEl, batch);
    initStructureRecommendation(sectionEl, batch);
    sectionEl.querySelectorAll('.btn-produce-creative').forEach((b) => {
      b.addEventListener('click', async () => {
        const idx = Number(b.dataset.variantIndex);
        const statusEl = sectionEl.querySelector(`.production-status[data-variant-index="${idx}"]`);
        // Modelo Sugerido + Selección Manual: si el usuario nunca tocó el
        // selector, su valor real ya es el modelo recomendado (option
        // "selected" en initModelRecommendation) -- enviarlo tal cual
        // sigue resultando en selectionMode "automatic" del lado real del
        // servidor (buildModelSelection compara contra la recomendación).
        const selectEl = sectionEl.querySelector(`.model-select[data-variant-index="${idx}"]`);
        const imageModelId = selectEl?.value || null;
        // Creative Structure Engine: mismo criterio real -- valor tal cual
        // del selector (recomendado si el usuario no lo tocó).
        const structureSelectEl = sectionEl.querySelector(`.structure-select[data-variant-index="${idx}"]`);
        const selectedStructureId = structureSelectEl?.value || null;
        // FORMAT OUTPUT — HARD LOCK: selectedFormats real (checkboxes de
        // #create-profiles) es la ÚNICA fuente real -- nunca un default
        // hardcodeado de 2 formatos reales.
        const outputProfileNames = getSelectedOutputProfiles($('#create-form'));
        if (outputProfileNames.length === 0) {
          statusEl.classList.remove('hidden');
          statusEl.innerHTML = '<div class="result-status VALIDATION_FAILED">SELECCIONA UN FORMATO</div><p>Marca al menos un formato de salida real ("Formatos de salida") antes de producir.</p>';
          return;
        }
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = '<p class="placeholder">Produciendo pieza audiovisual real (guion, escenas, voz real, composición)… puede tardar varios minutos.</p>';
        b.disabled = true;
        try {
          const job = await api('/api/create/produce', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchId: batch.batchId, variantIndex: idx, outputProfileNames, imageModelId, selectedStructureId,
            }),
          });
          statusEl.innerHTML = productionJobStatusHtml(job);
          attachPromptCopyHandlers(statusEl);
          const openBtn = statusEl.querySelector('.btn-open-editor');
          if (openBtn && window.VidaDivinaEditor) {
            openBtn.addEventListener('click', () => window.VidaDivinaEditor.openFromProductionJob(openBtn.dataset.productionJobId));
          }
        } catch (err) {
          statusEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
        } finally {
          b.disabled = false;
        }
      });
    });
  }

  async function loadExistingBatches(productId, brief, form, container) {
    // URLSearchParams convierte valores undefined en la cadena literal
    // "undefined" -- a diferencia de JSON.stringify (que sí los omite),
    // así que aquí se filtran explícitamente antes de construir la query.
    const entradasReales = Object.entries({ productId, ...brief }).filter(([, v]) => v !== undefined && v !== '');
    const params = new URLSearchParams(entradasReales);
    const { batches } = await api(`/api/create/hypothesis-batches?${params.toString()}`);
    container.innerHTML = '';
    batches.forEach((batch) => {
      container.insertAdjacentHTML('beforeend', batchSectionHtml(batch));
      const sectionEl = container.querySelector(`[data-batch-number="${batch.batchNumber}"]`);
      attachUseVariantHandlers(sectionEl, batch, form, container);
      attachProduceHandlers(sectionEl, batch);
    });
    if (batches.length > 0) createSuggestBtn.textContent = 'GENERAR MÁS VARIANTES';
  }

  createSuggestBtn.addEventListener('click', async () => {
    const form = $('#create-form');
    const container = $('#create-hypothesis-batches');
    const productId = form.productId.value;
    const batchSizeInput = $('#create-hypothesis-batch-size');
    const variantCount = Math.max(1, Math.min(50, Number(batchSizeInput?.value) || 10));
    const brief = readCampaignBrief();
    if (!productId) {
      container.innerHTML = '<p class="placeholder">Selecciona un producto real primero.</p>';
      return;
    }
    const campaignKey = JSON.stringify({ productId, ...brief });
    if (campaignKey !== lastCampaignKey) {
      // Producto o brief de campaña distinto del último batch generado en
      // esta sesión de la página -- recarga su historial real desde el
      // servidor (nunca inventa uno vacío si ya existían batches previos
      // para ESTA misma campaña).
      lastCampaignKey = campaignKey;
      createSuggestBtn.textContent = 'SUGERIR VARIANTES (HIPÓTESIS)';
      try { await loadExistingBatches(productId, brief, form, container); } catch { /* sin historial real todavía -- se continúa igual */ }
    }
    createSuggestBtn.disabled = true; const previousLabel = createSuggestBtn.textContent;
    createSuggestBtn.textContent = 'GENERANDO LOTE…';
    const loadingEl = document.createElement('p');
    loadingEl.className = 'placeholder'; loadingEl.textContent = 'Consultando Product Facts reales y construyendo un lote nuevo de hipótesis…';
    container.appendChild(loadingEl);
    try {
      const result = await api('/api/create/suggest-hypothesis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, variantCount, ...brief }) });
      loadingEl.remove();
      if (result.status !== 'HYPOTHESIS_EXPERIMENT_READY') {
        container.insertAdjacentHTML('beforeend', `<div class="result-status MISSING_CREATIVE_MATCH">${result.status}</div><p>${(result.errors ?? [result.reason]).join(' ')}</p>`);
        return;
      }
      container.insertAdjacentHTML('beforeend', batchSectionHtml(result));
      { const sectionEl = container.querySelector(`[data-batch-number="${result.batchNumber}"]`);
        attachUseVariantHandlers(sectionEl, result, form, container);
        attachProduceHandlers(sectionEl, result); }
      createSuggestBtn.textContent = 'GENERAR MÁS VARIANTES';
    } catch (err) {
      loadingEl.remove();
      container.insertAdjacentHTML('beforeend', `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`);
      createSuggestBtn.textContent = previousLabel;
    } finally {
      createSuggestBtn.disabled = false;
    }
  });
}

// ============================================================
// UI DE VARIANTES CREATIVAS — Comparar + Seleccionar + Producir
// (Corrección "UI de Variantes Creativas", 2026-08-28). Consume
// POST /api/create/propose-direct-variants (Cierre del Creative
// Director, ya validado a nivel backend: Auto-QA/Diversity/Hook
// Intelligence/Claim Relevance/Creative Structure Engine/Creative
// Director) -- esta UI SOLO presenta, compara, selecciona y dispara
// la producción real de UNA variante ya generada; nunca recalcula
// angle/hook/quality/diversity en el frontend (Paso 5/6/22 del
// encargo). Cada variante ya es su propio Batch real persistido
// (batchId, variantIndex siempre 0) -- por eso reutiliza tal cual
// /api/create/model-recommendation y /api/create/produce (mismo
// mecanismo real ya validado por "Sugerir variantes", arriba), nunca
// un segundo pipeline de producción.
const generateVariantsBtn = $('#create-generate-variants-btn');
if (generateVariantsBtn) {
  const workspace = $('#create-variants-workspace');
  let currentVariants = [];
  let currentDiversity = null;
  let selectedIndex = null;
  let currentUserInstruction = null;
  // Editable Fields (Corrección "Corrección integral del flujo de Crear
  // contenido", 2026-08-29, Paso 18-31 del encargo): "ESTO DEBE
  // RECUPERARSE" -- edición manual por escena del prompt real
  // ({[sceneId]: promptEditado}), se reinicia real al cambiar de variante
  // (Paso 25: nunca mezclar la edición de una variante con otra).
  let scenePromptOverrides = {};

  // Detecta real si el usuario ya editó a mano hook/CTA/voiceover desde
  // que se pobló el formulario con la variante actual (Paso 20 del
  // encargo) -- compara contra la foto real tomada en
  // populateCreateFormFromVariant() de abajo, nunca contra un valor
  // recalculado.
  function formEditedFromBaseline(form) {
    if (form.dataset.baselineHook === undefined) return false;
    if (form.hookText.value !== form.dataset.baselineHook) return true;
    if (form.ctaText.value !== form.dataset.baselineCta) return true;
    if (form.dataset.generatedVoiceoverText !== undefined && form.voiceoverText.value !== form.dataset.generatedVoiceoverText) return true;
    return false;
  }

  function qualityBadgeHtml(status) {
    return status === 'ACCEPTED'
      ? '<span class="quality-badge quality-ok">✅ Lista para producir</span>'
      : '<span class="quality-badge quality-low">⚠️ Confianza baja</span>';
  }

  function productBadgeHtml(available) {
    if (available === null || available === undefined) return '';
    return available
      ? '<div class="variant-field"><strong>Producto</strong>✅ Fotografía real del producto</div>'
      : '<div class="variant-field"><strong>Producto</strong>⚠️ Sin fotografía del producto -- para mostrarlo físicamente selecciona una fotografía real antes de producir.</div>';
  }

  function diversityLabel(score) {
    if (score >= 0.7) return 'Alta diversidad';
    if (score >= 0.4) return 'Diversidad media';
    return 'Diversidad baja';
  }

  // Ver detalle (Paso 8 del encargo): SOLO campos ya devueltos por
  // propose-direct-variants -- nunca reconstruye script/voiceover/visual
  // intent, ya vienen calculados por Creative Director/Hook Intelligence.
  function variantDetailHtml(v) {
    const claims = v.relevantClaims;
    const claimsHtml = claims
      ? `<div class="variant-field"><strong>Claims principales</strong>${[...(claims.core ?? []), ...(claims.supporting ?? [])].join(' · ') || '—'}</div>`
      : '';
    const script = (v.creativeVariant?.copy?.script ?? []).join(' ');
    const voiceover = (v.creativeVariant?.copy?.voiceover ?? []).join(' ');
    return `
      <div class="variant-field"><strong>Ángulo creativo</strong>${v.primaryAngle?.label ?? '—'}${v.secondaryAngle?.label ? ` <span class="meta">(secundario: ${v.secondaryAngle.label})</span>` : ''}</div>
      <div class="variant-field"><strong>Hook</strong>${v.hook}</div>
      <div class="variant-field"><strong>Tipo de hook</strong>${v.hookType?.label ?? '—'}</div>
      <div class="variant-field"><strong>Estructura</strong>${v.structureLabel ?? '—'}</div>
      ${claimsHtml}
      ${script ? `<div class="variant-field"><strong>Script</strong>${script}</div>` : ''}
      ${voiceover ? `<div class="variant-field"><strong>Voiceover</strong>${voiceover}</div>` : ''}
      ${(v.visualBrief ?? v.visualIntent) ? `<div class="variant-field"><strong>Qué queremos ver (Visual Brief)</strong>${v.visualBrief ?? v.visualIntent}</div>` : ''}
      <div class="variant-field"><strong>Tratamiento visual</strong>${v.visualTreatmentLabel ?? v.visualTreatment ?? '—'}</div>
      <div class="variant-field"><strong>Modelo sugerido</strong>${v.recommendedModel?.displayName ?? '—'}</div>
      <div class="variant-field"><strong>Calidad</strong>${qualityBadgeHtml(v.creativeQualityStatus)}</div>
      ${productBadgeHtml(v.productAssetAvailable)}
    `;
  }

  // Tarjeta compacta (Paso 3/4 del encargo): idea + apertura + narrativa +
  // visual + calidad, de un vistazo -- nunca el script completo ni UUIDs.
  function variantCompareCardHtml(v, index) {
    const isSelected = index === selectedIndex;
    return `
      <div class="variant-card compare-card${isSelected ? ' selected' : ''}" data-variant-index="${index}">
        <h4>Variante ${index + 1}</h4>
        <div class="variant-field"><strong>Ángulo</strong>${v.primaryAngle?.label ?? '—'}</div>
        <div class="variant-field"><strong>Hook</strong>"${v.hook}"</div>
        <div class="variant-field"><strong>Estructura</strong>${v.structureLabel ?? '—'}</div>
        <div class="variant-field"><strong>Tratamiento</strong>${v.visualTreatmentLabel ?? v.visualTreatment ?? '—'}</div>
        <div class="variant-field"><strong>Calidad</strong>${qualityBadgeHtml(v.creativeQualityStatus)}</div>
        <div class="variant-field"><strong>Modelo sugerido</strong>${v.recommendedModel?.displayName ?? '—'}</div>
        <button type="button" class="btn-secondary btn-select-variant" data-variant-index="${index}">${isSelected ? '✓ Seleccionada' : 'Seleccionar'}</button>
        <details class="scene-prompt-detail">
          <summary>Ver detalle</summary>
          ${variantDetailHtml(v)}
        </details>
      </div>
    `;
  }

  // Creative Review completa (Paso 10/22 del encargo "Hacer auditable la
  // propuesta antes de producir"): ángulo/hook/estructura/claims/visual
  // intent/modelo/calidad/producto -- todo YA calculado por
  // propose-direct-variants (nunca recalculado aquí) -- para que el
  // usuario pueda responder "¿qué va a producir Vida Divina?" antes de
  // gastar recursos reales.
  function productionPreviewHtml(v, index) {
    const claims = v.relevantClaims;
    const claimsText = claims ? [...(claims.core ?? []), ...(claims.supporting ?? [])].join(' · ') || '—' : '—';
    return `
      <div class="panel" id="variant-production-preview">
        <h4>Revisar antes de producir — Variante ${index + 1}</h4>
        <p class="meta">Los campos Hook / Voiceover / CTA / Foto / Texto de producto de "Crear contenido" (arriba) ya se completaron con esta variante y son editables -- la producción real usa el valor vigente de esos campos, no el original de la variante.</p>
        <div class="variant-field"><strong>Ángulo</strong>${v.primaryAngle?.label ?? '—'}</div>
        <div class="variant-field"><strong>Hook</strong>"${v.hook}"</div>
        <div class="variant-field"><strong>Estructura</strong>${v.structureLabel ?? '—'}</div>
        <div class="variant-field"><strong>Claims principales</strong>${claimsText}</div>
        <div class="variant-field"><strong>Qué queremos ver (Visual Brief)</strong>${v.visualBrief ?? v.visualIntent ?? '—'}</div>
        <div class="variant-field"><strong>Formatos seleccionados</strong><span id="selected-formats-preview">—</span></div>
        ${productBadgeHtml(v.productAssetAvailable)}
        <div class="model-recommendation" data-variant-index="0">
          <span class="model-suggestion-label" data-variant-index="0">Calculando modelo sugerido…</span>
          <button type="button" class="btn-link btn-change-model hidden" data-variant-index="0">Cambiar modelo</button>
          <select class="model-select hidden" data-variant-index="0"></select>
        </div>
        <details class="scene-prompt-detail">
          <summary><strong>Ver plan visual</strong></summary>
          <div class="visual-plan-scenes"><p class="placeholder">Calculando plan visual…</p></div>
        </details>
        <details class="scene-prompt-detail">
          <summary><strong>Ver prompts</strong></summary>
          <div class="visual-plan-prompts"><p class="placeholder">Calculando prompts…</p></div>
        </details>
        <button type="button" class="btn-primary btn-produce-variant">PRODUCIR →</button>
        <div class="production-status hidden"></div>
      </div>
    `;
  }

  // Plan visual + Prompts (Paso 2/3/4/5/11/12 del encargo): SOLO lectura
  // real de /api/create/visual-plan-preview -- GET, nunca llama a Krea
  // (esa vista previa reusa la MISMA secuencia real de produceCreative()
  // hasta Creative Director, deteniéndose ANTES de Asset Resolver). Nunca
  // reconstruye generatedPrompt en frontend: es el mismo string real que
  // luego usará assetResolver.js.
  async function renderVisualPlanPreview(previewEl, v) {
    const scenesEl = previewEl.querySelector('.visual-plan-scenes');
    const promptsEl = previewEl.querySelector('.visual-plan-prompts');
    try {
      const uiq = currentUserInstruction ? `&userInstruction=${encodeURIComponent(currentUserInstruction)}` : '';
      const plan = await api(`/api/create/visual-plan-preview?batchId=${v.batchId}&variantIndex=0${uiq}`);
      if (plan.status !== 'READY' || !plan.scenes?.length) {
        scenesEl.innerHTML = `<p class="placeholder">${plan.reason ?? 'Plan visual no disponible todavía.'}</p>`;
        promptsEl.innerHTML = '<p class="placeholder">Sin prompts todavía.</p>';
        return;
      }
      scenesEl.innerHTML = plan.scenes.map((s, i) => `
        <div class="variant-field"><strong>Escena ${i + 1} — ${SECTION_TYPE_LABELS[s.sectionType] ?? s.sectionType}</strong></div>
        ${s.narrativePurpose ? `<div class="variant-field"><strong>Objetivo</strong>${s.narrativePurpose}</div>` : ''}
        ${s.action ? `<div class="variant-field"><strong>Acción</strong>${s.action}</div>` : ''}
        ${s.emotionalState ? `<div class="variant-field"><strong>Estado emocional</strong>${s.emotionalState}</div>` : ''}
        ${s.shotType ? `<div class="variant-field"><strong>Encuadre</strong>${s.shotType}${s.cameraAngle ? `, ángulo ${s.cameraAngle}` : ''}</div>` : ''}
        <div class="variant-field"><strong>Producto</strong>${s.requiresProduct ? 'Sí' : 'No'}</div>
      `).join('<hr>');
      // Prompt por escena (Paso 18/19 del encargo "Refinamiento
      // creativo"): "Instrucción exacta para el generador" -- EXACTAMENTE
      // s.generatedPrompt real (nunca resumido/limpiado/reconstruido) +
      // narrativeStage/action/model/quality/product reference reales, ver
      // renderVisualPlanPreview arriba (Paso 21: parity de código con
      // assetResolver.js).
      const PRODUCT_REF_LABELS = {
        COMPATIBLE: '✅ Fotografía real utilizada como referencia — modelo compatible',
        ASSET_USED_DIRECTLY: '✅ Fotografía real utilizada directamente (sin generación IA)',
        NO_REFERENCE_AVAILABLE: '⚠️ Sin fotografía real disponible -- se genera con IA, sin referencia real del producto',
      };
      // Instruction Coverage (Paso 14/15/16 del encargo "Corrección
      // integral"): mismo Prompt Gate real ya calculado por
      // buildVisualStrategy() -- si el sujeto/entorno reales detectados en
      // userInstruction NO llegaron al conjunto real de prompts, se avisa
      // ANTES de producir (nunca se bloquea aquí -- el usuario puede
      // editar el prompt real por escena más abajo, Paso 15: "reparar
      // antes de producir").
      const coverageHtml = plan.instructionCoverageScore !== null && plan.instructionCoverageScore !== undefined && plan.instructionCoverageScore < 0.70
        ? `<div class="variant-field quality-low"><strong>⚠️ Cobertura de instrucción</strong>${Math.round(plan.instructionCoverageScore * 100)}% -- falta reflejar: ${(plan.instructionCoverageMissing ?? []).join(', ') || '—'} en el prompt real. Puedes editar el prompt de la escena afectada abajo.</div>`
        : '';
      promptsEl.dataset.batchId = v.batchId;
      promptsEl.innerHTML = coverageHtml + plan.scenes.map((s, i) => {
        const overridden = scenePromptOverrides[s.sceneId];
        return `
        <div class="variant-field"><strong>Escena ${i + 1} — ${SECTION_TYPE_LABELS[s.sectionType] ?? s.sectionType}</strong></div>
        ${s.action ? `<div class="variant-field"><strong>Acción</strong>${s.action}</div>` : ''}
        <div class="variant-field"><strong>Modelo</strong>${s.model ?? '—'}</div>
        <div class="variant-field"><strong>Calidad</strong>${s.quality ?? '—'}</div>
        ${s.productReferenceCompatibility ? `<div class="variant-field"><strong>Producto</strong>${PRODUCT_REF_LABELS[s.productReferenceCompatibility] ?? s.productReferenceCompatibility}</div>` : ''}
        ${s.generatedPrompt ? `
          <div class="variant-field"><strong>PROMPT PREPARADO</strong></div>
          <pre class="scene-prompt-text">${s.generatedPrompt}</pre>
          <button type="button" class="btn-link btn-copy-prompt" data-prompt="${s.generatedPrompt.replace(/"/g, '&quot;')}">Copiar prompt</button>
          <button type="button" class="btn-link btn-edit-prompt" data-scene-id="${s.sceneId}">Editar instrucción visual</button>
          <div class="scene-prompt-editor hidden" data-scene-id="${s.sceneId}">
            <textarea class="scene-prompt-textarea" data-scene-id="${s.sceneId}" rows="4">${(overridden ?? s.generatedPrompt).replace(/</g, '&lt;')}</textarea>
            <button type="button" class="btn-secondary btn-save-prompt-edit" data-scene-id="${s.sceneId}" data-original-prompt="${s.generatedPrompt.replace(/"/g, '&quot;')}">Guardar edición</button>
            ${overridden ? `<button type="button" class="btn-link btn-restore-prompt" data-scene-id="${s.sceneId}">Restaurar original</button>` : ''}
          </div>
          ${overridden ? `
            <div class="variant-field"><strong>PROMPT FINAL A PRODUCIR (editado)</strong></div>
            <pre class="scene-prompt-text scene-prompt-edited">${overridden}</pre>
          ` : ''}
        ` : `<p class="placeholder">Prompt todavía no generado.${s.promptPendingReason ? ` ${s.promptPendingReason}` : ''}</p>`}
      `;
      }).join('<hr>');
      attachPromptCopyHandlers(promptsEl);
      attachPromptEditHandlers(promptsEl, previewEl, v);
    } catch {
      scenesEl.innerHTML = '<p class="placeholder">No se pudo calcular el plan visual todavía.</p>';
      promptsEl.innerHTML = '<p class="placeholder">No se pudieron calcular los prompts todavía.</p>';
    }
  }

  // Edición por escena del prompt real (Paso 28-31 del encargo
  // "Corrección integral del flujo de Crear contenido", 2026-08-29):
  // promptOriginal/promptEdited reales viven en scenePromptOverrides
  // (cierre de generateVariantsBtn) -- NUNCA se sobreescribe en silencio
  // con un generatedPrompt más nuevo (Paso 30: "nunca resustituir"). Un
  // aviso NO destructivo real (Paso 31) si el sujeto real ya definido
  // (mujer/hombre) desaparece del prompt editado -- nunca bloquea ni
  // revierte la edición real del usuario.
  function checkPromptSubjectRegression(originalPrompt, editedPrompt) {
    const GENDER_WORDS = [/(^|[^a-záéíóúñü])mujer([^a-záéíóúñü]|$)/i, /(^|[^a-záéíóúñü])hombre([^a-záéíóúñü]|$)/i];
    return GENDER_WORDS.some((re) => re.test(originalPrompt) && !re.test(editedPrompt));
  }

  // NO TEXT BAKING (Paso 29/30/33/39 del encargo "Master Creative
  // Production Flow"): mismo criterio real ya validado en
  // applyPromptGate() (content-orchestrator/src/visualContinuityContext.js)
  // -- un prompt real editado a mano que le pide al proveedor "escribir"
  // CTA/caption/subtítulo/hook dentro de la imagen es una violación real
  // (esos textos pertenecen a postproducción, nunca al prompt visual).
  // Aviso NO destructivo (Paso 45): nunca bloquea/revierte la edición
  // real del usuario, solo advierte antes de guardar.
  function checkPromptTextBaking(editedPrompt) {
    const PATTERNS = [/\bcta\b/i, /\bcaption(s)?\b/i, /\bsubt[ií]tulo(s)?\b/i, /\bsubtitle(s)?\b/i, /texto en pantalla/i, /\btext overlay\b/i];
    return PATTERNS.some((re) => re.test(editedPrompt));
  }

  function attachPromptEditHandlers(promptsEl, previewEl, v) {
    promptsEl.querySelectorAll('.btn-edit-prompt').forEach((b) => {
      b.addEventListener('click', () => {
        promptsEl.querySelector(`.scene-prompt-editor[data-scene-id="${b.dataset.sceneId}"]`)?.classList.toggle('hidden');
      });
    });
    promptsEl.querySelectorAll('.btn-save-prompt-edit').forEach((b) => {
      b.addEventListener('click', () => {
        const sceneId = b.dataset.sceneId;
        const textarea = promptsEl.querySelector(`.scene-prompt-textarea[data-scene-id="${sceneId}"]`);
        const edited = textarea.value.trim();
        const original = b.dataset.originalPrompt ?? '';
        if (!edited) return;
        // promptMode=user_edited (Paso 29 del encargo): persiste tal cual
        // -- se reinicia SOLO al cambiar de variante (ver
        // renderProductionPreview arriba), nunca al re-renderizar esta
        // misma vista previa.
        if (checkPromptSubjectRegression(original, edited)) {
          if (!confirm('El prompt editado ya no coincide con el sujeto definido (se eliminó una referencia de género presente en el prompt original). ¿Guardar de todas formas?')) return;
        }
        if (checkPromptTextBaking(edited)) {
          if (!confirm('El prompt editado parece pedirle al generador que escriba texto (CTA/caption/subtítulo) dentro de la imagen -- esos textos van en postproducción, nunca en el prompt visual. ¿Guardar de todas formas?')) return;
        }
        scenePromptOverrides = { ...scenePromptOverrides, [sceneId]: edited };
        renderVisualPlanPreview(previewEl, v);
      });
    });
    promptsEl.querySelectorAll('.btn-restore-prompt').forEach((b) => {
      b.addEventListener('click', () => {
        const { [b.dataset.sceneId]: _omit, ...rest } = scenePromptOverrides;
        scenePromptOverrides = rest;
        renderVisualPlanPreview(previewEl, v);
      });
    });
  }

  // Editable Fields (Paso 18-21 del encargo "Corrección integral del
  // flujo de Crear contenido"): recupera el comportamiento real
  // preexistente (versión anterior de la UI) -- al confirmar una
  // variante, el formulario "Crear contenido" de arriba se puebla real
  // con Hook/CTA/Foto/Texto de producto/Voiceover de ESA variante y
  // queda editable (fuente de verdad real después de esto: los campos
  // del formulario, NUNCA la variante original -- Paso 19). Reutiliza
  // applyVideoScriptToCreateForm() para el voiceover -- MISMO mecanismo
  // real GENERATED/USER_EDITED ya validado (Video Workspace,
  // 2026-08-23), nunca un segundo tracking paralelo.
  async function populateCreateFormFromVariant(v, form) {
    form.hookText.value = v.hook ?? v.creativeVariant?.copy?.hook ?? '';
    form.ctaText.value = v.creativeVariant?.copy?.cta ?? '';
    if (form.productBody) form.productBody.value = v.creativeVariant?.copy?.primaryText ?? '';
    if (form.imageAssetPath && v.productAssetAvailable) {
      // Mismo producto real ya asociado a este batch -- deja la
      // selección real tal cual (updateCreateImages() ya la habrá
      // poblado al elegir el producto arriba); nunca inventa una ruta.
    }
    if (v.creativeVariant) await applyVideoScriptToCreateForm(form, v.creativeVariant);
    // Foto real (Paso 18/19 del encargo): "Instrucción" real sigue siendo
    // rawText -- ya es la MISMA fuente real que generó estas variantes,
    // editable desde siempre (Paso 21: recalcular estructura/plan visual
    // si el usuario la cambia -- ver invalidateStaleProposal/GENERAR MÁS
    // VARIANTES, sin duplicar ese mecanismo aquí).
    form.dataset.baselineHook = form.hookText.value;
    form.dataset.baselineCta = form.ctaText.value;
  }

  // Modelo Sugerido + Selección Manual (Paso 14 del encargo): mismo
  // mecanismo real ya validado en initModelRecommendation() (arriba) --
  // batchId real de LA variante seleccionada (cada variante ya es su
  // propio batch real). Un cambio manual del <select> hace que
  // selectionMode="user_selected" del lado real del servidor
  // (buildModelSelection ya existente, nunca tocado aquí).
  async function renderProductionPreview() {
    if (selectedIndex === null) return;
    const v = currentVariants[selectedIndex];
    const existing = workspace.querySelector('#variant-production-preview');
    if (existing) existing.remove();
    workspace.insertAdjacentHTML('beforeend', productionPreviewHtml(v, selectedIndex));
    const previewEl = workspace.querySelector('#variant-production-preview');
    scenePromptOverrides = {};
    const createForm = $('#create-form');
    await populateCreateFormFromVariant(v, createForm);

    // FORMAT PREVIEW (Paso "FORMAT PREVIEW" del encargo): muestra
    // EXACTAMENTE los formatos reales marcados ahora mismo en
    // #create-profiles -- nunca "Reel + Feed" fijo. Se mantiene en vivo
    // real si el usuario cambia los checkboxes mientras este panel está
    // abierto (listener real, se adjunta UNA sola vez -- guard real
    // `dataset.formatPreviewBound`, nunca duplicado entre renders).
    const formatPreviewEl = previewEl.querySelector('#selected-formats-preview');
    function refreshFormatPreview() {
      const selected = getSelectedOutputProfiles(createForm);
      formatPreviewEl.textContent = selected.length > 0 ? selected.join(' + ') : '(ninguno seleccionado)';
    }
    refreshFormatPreview();
    const profilesContainer = $('#create-profiles');
    if (profilesContainer && !profilesContainer.dataset.formatPreviewBound) {
      profilesContainer.addEventListener('change', () => {
        const live = workspace.querySelector('#selected-formats-preview');
        if (live) {
          const selected = getSelectedOutputProfiles(createForm);
          live.textContent = selected.length > 0 ? selected.join(' + ') : '(ninguno seleccionado)';
        }
      });
      profilesContainer.dataset.formatPreviewBound = '1';
    }

    // Plan visual + Prompts (Paso 1/6/7 del encargo): se calculan de una
    // vez al mostrar la revisión de ESTA variante seleccionada -- lectura
    // real, nunca llama a Krea (ver renderVisualPlanPreview arriba). Si el
    // usuario cambia de variante, renderProductionPreview() se vuelve a
    // llamar desde cero (el panel anterior se elimina primero, arriba) --
    // nunca mezcla el plan visual/prompts de una variante con otra.
    renderVisualPlanPreview(previewEl, v);

    const widget = previewEl.querySelector('.model-recommendation');
    const labelEl = widget.querySelector('.model-suggestion-label');
    const changeBtn = widget.querySelector('.btn-change-model');
    const selectEl = widget.querySelector('.model-select');
    try {
      const uiq = currentUserInstruction ? `&userInstruction=${encodeURIComponent(currentUserInstruction)}` : '';
      const rec = await api(`/api/create/model-recommendation?batchId=${v.batchId}&variantIndex=0${uiq}`);
      if (rec.recommendedModel) {
        labelEl.innerHTML = `Modelo sugerido: <strong>${rec.recommendedModel.displayName} ✓</strong><br><span class="meta">${rec.recommendedModel.shortComment ?? ''} — ${rec.recommendationReason ?? ''}</span>`;
        selectEl.innerHTML = rec.availableModels.map((m) => `<option value="${m.id}"${m.id === rec.recommendedModel.id ? ' selected' : ''}>${m.displayName} — ${m.costTierLabel}</option>`).join('');
        if (rec.availableModels.length > 1) {
          changeBtn.classList.remove('hidden');
          changeBtn.addEventListener('click', () => selectEl.classList.toggle('hidden'));
        }
      } else {
        labelEl.textContent = 'Sin modelo de imagen disponible en este entorno.';
      }
    } catch {
      labelEl.textContent = 'No se pudo calcular el modelo sugerido (se producirá con el fallback real disponible).';
    }

    // Producción (Paso 15/26 del encargo): SOLO la variante seleccionada
    // -- un único job real por clic, nunca las otras cuatro.
    const produceBtn = previewEl.querySelector('.btn-produce-variant');
    produceBtn.addEventListener('click', async () => {
      const statusEl = previewEl.querySelector('.production-status');
      const imageModelId = selectEl?.value || null;
      const createForm = $('#create-form');
      // FORMAT OUTPUT — HARD LOCK (Paso "FORMAT OUTPUT — HARD LOCK" del
      // encargo): selectedFormats real (checkboxes reales de
      // #create-profiles) es la ÚNICA fuente real -- nunca un default
      // hardcodeado de 2 formatos reales, nunca "selectedFormats ||
      // defaultFormats".
      const outputProfileNames = getSelectedOutputProfiles(createForm);
      if (outputProfileNames.length === 0) {
        statusEl.classList.remove('hidden');
        statusEl.innerHTML = '<div class="result-status VALIDATION_FAILED">SELECCIONA UN FORMATO</div><p>Marca al menos un formato de salida real ("Formatos de salida") antes de producir.</p>';
        return;
      }
      statusEl.classList.remove('hidden');
      statusEl.innerHTML = '<p class="placeholder">Produciendo pieza audiovisual real (guion, escenas, voz real, composición)… puede tardar varios minutos.</p>';
      produceBtn.disabled = true;
      // Editable Fields (Paso 19/26 del encargo): la producción real usa
      // los campos VIGENTES del formulario -- si el usuario los editó,
      // esos valores reales (nunca los de la variante original) llegan a
      // handleProduceCreative() como overrides explícitos. userInstruction
      // (Paso 4/16 del encargo "Corrección integral"): la MISMA
      // instrucción real ya usada en la vista previa -- sin esto, Subject
      // Lock/Narrative Grounding se pierden en la producción real aunque
      // la vista previa los muestre correctos (Prompt Parity).
      const hookOverride = createForm.hookText.value.trim() && createForm.hookText.value.trim() !== (createForm.dataset.baselineHook ?? '').trim()
        ? createForm.hookText.value.trim() : null;
      const ctaOverride = createForm.ctaText.value.trim() !== (createForm.dataset.baselineCta ?? '').trim()
        ? createForm.ctaText.value.trim() : null;
      const voiceoverOverride = createForm.dataset.generatedVoiceoverText !== undefined
        && createForm.voiceoverText.value.trim() && createForm.voiceoverText.value !== createForm.dataset.generatedVoiceoverText
        ? createForm.voiceoverText.value : null;
      try {
        const job = await api('/api/create/produce', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId: v.batchId, variantIndex: 0, outputProfileNames, imageModelId,
            userInstruction: currentUserInstruction,
            hookOverride, ctaOverride, voiceoverOverride,
            scenePromptOverrides: Object.keys(scenePromptOverrides).length ? scenePromptOverrides : null,
          }),
        });
        statusEl.innerHTML = productionJobStatusHtml(job);
        attachPromptCopyHandlers(statusEl);
        const openBtn = statusEl.querySelector('.btn-open-editor');
        if (openBtn && window.VidaDivinaEditor) {
          openBtn.addEventListener('click', () => window.VidaDivinaEditor.openFromProductionJob(openBtn.dataset.productionJobId));
        }
      } catch (err) {
        statusEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
      } finally {
        produceBtn.disabled = false;
      }
    });
  }

  // Paso 16 del encargo: seleccionar (o cambiar de selección) SIEMPRE
  // re-renderiza la lista completa de variantes (nunca la destruye) --
  // cualquier vista previa de producción anterior queda invalidada y debe
  // pedirse de nuevo con "Continuar a producción" (Paso 25/26: cambiar de
  // variante nunca deja un job real a medias de la variante anterior).
  function renderVariantsWorkspace() {
    const diversityHtml = currentDiversity
      ? `<div class="meta">Diversidad de variantes: <strong>${currentDiversity.diversityScore.toFixed(2)}</strong> (${diversityLabel(currentDiversity.diversityScore)})</div>`
      : '';
    const cards = currentVariants.map((v, i) => variantCompareCardHtml(v, i)).join('');
    workspace.innerHTML = `
      <div class="panel">
        <div class="result-status HYPOTHESIS_EXPERIMENT_READY">${currentVariants.length} VARIANTE(S) DISPONIBLE(S)</div>
        ${diversityHtml}
        <div class="variant-grid">${cards}</div>
        ${selectedIndex === null ? '<p class="placeholder">Selecciona una variante para continuar a producción.</p>' : '<button type="button" class="btn-primary" id="btn-continue-to-production">Continuar a producción →</button>'}
      </div>
    `;
    workspace.querySelectorAll('.btn-select-variant').forEach((b) => {
      b.addEventListener('click', () => {
        const nextIndex = Number(b.dataset.variantIndex);
        if (nextIndex === selectedIndex) return;
        // Editable Fields (Paso 20 del encargo): advertencia real ANTES
        // de perder una edición manual real ya hecha para la variante
        // anterior -- confirmación EXPLÍCITAMENTE justificada aquí (a
        // diferencia del resto del flujo, que nunca pide confirmación),
        // porque hay riesgo real de perder trabajo real del usuario.
        const createForm = $('#create-form');
        if (selectedIndex !== null && formEditedFromBaseline(createForm)) {
          if (!confirm('Los cambios actuales pertenecen a la variante anterior. ¿Continuar y perderlos?')) return;
        }
        selectedIndex = nextIndex;
        renderVariantsWorkspace();
      });
    });
    const continueBtn = workspace.querySelector('#btn-continue-to-production');
    if (continueBtn) continueBtn.addEventListener('click', () => renderProductionPreview());
  }

  // GENERAR MÁS VARIANTES (Paso 49/52-54 del encargo "Master Creative
  // Production Flow"): "GENERAR VARIANTES" (campaña nueva) vs "GENERAR
  // MÁS VARIANTES" (extiende la MISMA campaña real, nunca la reemplaza)
  // -- mismo criterio real ya validado por "SUGERIR VARIANTES
  // (HIPÓTESIS)"/lastCampaignKey (arriba), aplicado aquí sin duplicar esa
  // lógica (variable propia, mismo patrón). El tracking real de
  // diversidad entre llamadas (previousAngles/Hooks/...) vive en el
  // servidor real (multiVariantTrackingByCampaign, ver generation.js) --
  // el frontend solo decide si ACUMULA o REEMPLAZA la lista visible real.
  let lastVariantsCampaignKey = null;

  generateVariantsBtn.addEventListener('click', async () => {
    const form = $('#create-form');
    const productId = form.productId.value;
    const rawText = form.rawText.value.trim();
    if (!productId || !rawText) {
      workspace.innerHTML = '<p class="placeholder">Selecciona un producto real y escribe una instrucción/intención real primero.</p>';
      return;
    }
    // VARIANT COUNT (Paso 50/51 del encargo): NO limitar artificialmente
    // a 5 -- el usuario real decide cuántas pedir (hasta el techo técnico
    // real que valida el servidor, MAX_MULTI_VARIANT_COUNT).
    const countInput = $('#create-variants-count');
    const variantCount = Math.max(1, Math.min(50, Number(countInput?.value) || 5));
    const campaignKey = JSON.stringify({ productId, rawText });
    const esMasVariantes = campaignKey === lastVariantsCampaignKey && currentVariants.length > 0;

    generateVariantsBtn.disabled = true;
    const previousLabel = generateVariantsBtn.textContent;
    generateVariantsBtn.textContent = esMasVariantes ? 'GENERANDO MÁS VARIANTES…' : 'GENERANDO VARIANTES…';
    if (!esMasVariantes) workspace.innerHTML = '<p class="placeholder">Generando variantes…</p>';
    try {
      const result = await api('/api/create/propose-direct-variants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, rawText, variantCount }),
      });
      if (!Array.isArray(result.variants) || result.variants.length === 0) {
        workspace.innerHTML = `<div class="result-status MISSING_CREATIVE_MATCH">${result.status ?? 'SIN VARIANTES'}</div><p>${(result.errors ?? ['No se generaron variantes reales para este producto/instrucción.']).join(' ')}</p>`;
        return;
      }
      // Acumula real (nunca reemplaza) cuando es "GENERAR MÁS VARIANTES"
      // de la MISMA campaña real -- selectedIndex se conserva (no se
      // pierde la selección real ya hecha por seguir viendo más
      // opciones).
      currentVariants = esMasVariantes ? [...currentVariants, ...result.variants] : result.variants;
      currentDiversity = { diversityScore: result.diversityScore, ...result.diversityDetail };
      if (!esMasVariantes) selectedIndex = null;
      currentUserInstruction = rawText;
      lastVariantsCampaignKey = campaignKey;
      renderVariantsWorkspace();
      generateVariantsBtn.textContent = 'GENERAR MÁS VARIANTES';
    } catch (err) {
      workspace.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
      generateVariantsBtn.textContent = previousLabel;
    } finally {
      generateVariantsBtn.disabled = false;
    }
  });
}

// ---------------- EDIT ----------------
// Traducción + explicación corta de cada operación real de postproducción
// (UX cleanup 2026-08-26) -- IDs técnicos (SIMPLE_OPERATIONS/
// COMPLEX_OPERATIONS de content-orchestrator/src/postProduction.js) nunca
// se muestran al usuario. Las operaciones no implementadas
// (UNSUPPORTED_LOCAL_OPERATIONS) simplemente no se renderizan.
const OPERATION_LABELS = {
  LOUDNESS_NORMALIZATION: { label: 'Normalización de volumen', description: 'Equilibra el volumen del audio para que se escuche de forma uniforme.' },
  TRIM: { label: 'Recortar video', description: 'Elimina una parte del inicio o final del video.' },
  AUDIO_CLEANUP: { label: 'Limpieza de audio', description: 'Reduce ruido o elementos no deseados del audio.' },
  LOGO_OVERLAY: { label: 'Agregar logotipo', description: 'Coloca el logotipo de la marca sobre el video.' },
  INTRO_OUTRO: { label: 'Agregar intro y cierre', description: 'Agrega un clip de introducción y/o cierre al video.' },
  RESIZE_TO_PROFILE: { label: 'Cambiar formato', description: 'Adapta el video a otro formato de publicación.' },
  SILENCE_TRIM: { label: 'Recortar silencios', description: 'Elimina silencios innecesarios del audio.' },
  TEXT_OVERLAY: { label: 'Texto en pantalla', description: 'Agrega o modifica texto que aparece sobre el video.' },
  MUSIC_REPLACEMENT: { label: 'Cambiar música', description: 'Sustituye la música de fondo.' },
  MULTI_SCENE_CONCAT: { label: 'Unir escenas', description: 'Combina varias escenas en un solo video.' },
};

async function loadEditSources() {
  const { rawAssets, finalOutputs } = await api('/api/assets');
  const videos = finalOutputs;
  $('#edit-source').innerHTML = videos.map((v) => `<option value="${v.sourcePath}">${v.filename}</option>`).join('') || '<option value="">Sin videos disponibles todavía — usa Crear primero</option>';

  const ops = await api('/api/operations');
  const opsEl = $('#edit-operations');
  // Rule 19: solo se renderizan las operaciones realmente soportadas --
  // las de ops.unsupported nunca aparecen en la UI (ni siquiera deshabilitadas).
  opsEl.innerHTML = ops.supported.map((op) => {
    const info = OPERATION_LABELS[op] ?? { label: op, description: '' };
    return `<label title="${info.description}"><input type="checkbox" name="op" value="${op}"/> ${info.label}</label>`;
  }).join('');

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

// ---------------- ADAPTAR — Video de referencia (2026-08-26) ----------------
// Flujo: referencia -> análisis real (ffprobe/ffmpeg, ver
// referenceVideoAnalyzer.js) -> propuestas reales (mismo Creative Strategy
// Engine que "Sugerir variantes", ver referenceAdaptationProposals.js) ->
// selección -> producción real vía el MISMO /api/create/produce ya
// existente (nunca un segundo pipeline). El análisis y las propuestas
// NUNCA lanzan una producción por sí solos -- solo "PRODUCIR VIDEO" real
// hace eso, y siempre después de que el usuario elige una propuesta.
let currentReferenceId = null;

const RHYTHM_LABELS = { MUY_RAPIDO: 'Muy rápido', RAPIDO: 'Rápido', MODERADO: 'Moderado', PAUSADO: 'Pausado' };
const NOT_AVAILABLE_LABEL = 'No disponible';
const HOOK_TYPE_LABELS = { question: 'Pregunta', curiosity: 'Curiosidad', statement: 'Afirmación', problem: 'Problema', promise: 'Promesa', shock: 'Impacto', story: 'Historia' };
const CTA_TYPE_LABELS = { learn_more: 'Conocer más', buy_now: 'Comprar ahora', follow: 'Seguir', comment: 'Comentar', visit_link: 'Visitar enlace', contact: 'Contactar', whatsapp: 'WhatsApp' };

// Estados reales (regla 18) -- nunca "NOT_AVAILABLE"/"UNAVAILABLE"/"ERROR_STATE"
// como texto visible. Un campo con available:true muestra su detección real
// (via formatter); available:false distingue "No detectado" (la capacidad
// real corrió pero no encontró evidencia -- el motivo empieza con "No se
// detectó") de "No disponible" (la capacidad no existe/no está configurada
// en este entorno).
function fieldStateHtml(field, formatter) {
  if (field?.available) return formatter(field);
  const label = field?.reason?.startsWith('No se detectó') ? 'No detectado' : NOT_AVAILABLE_LABEL;
  return `<span style="color:#9c9683;font-style:italic;" title="${field?.reason ?? ''}">${label}</span>`;
}

function referenceAnalysisPreviewHtml(intelligence) {
  const ta = intelligence.technicalAnalysis;
  const escenasHtml = ta.scenes.map((s) => `<div class="variant-field"><strong>Escena ${s.sceneIndex + 1}</strong>${s.position} · ${s.durationSeconds}s</div>`).join('');
  const keyframesHtml = ta.keyframes.map((k) => `<img src="${k.mediaUrl}" alt="Escena ${k.sceneIndex + 1}" style="width:100px;height:auto;border-radius:6px;margin:4px;" />`).join('');
  return `
    <h4>Inteligencia de referencia</h4>
    <div class="pubdetail-grid">
      <div><strong>Duración</strong>${ta.duration ? `${ta.duration.toFixed(1)}s` : NOT_AVAILABLE_LABEL}</div>
      <div><strong>Formato</strong>${ta.aspectRatio ?? NOT_AVAILABLE_LABEL}</div>
      <div><strong>Ritmo</strong>${RHYTHM_LABELS[ta.pacing?.rhythm] ?? NOT_AVAILABLE_LABEL}</div>
      <div><strong>Hook</strong>${fieldStateHtml(intelligence.hook, (f) => `${HOOK_TYPE_LABELS[f.type] ?? f.type}: "${f.text}"`)}</div>
      <div><strong>Estructura</strong>${fieldStateHtml(intelligence.narrativeStructure, (f) => f.sequence.join(' → '))}</div>
      <div><strong>CTA</strong>${fieldStateHtml(intelligence.cta, (f) => `${CTA_TYPE_LABELS[f.type] ?? f.type}`)}</div>
      <div><strong>Estilo visual</strong>${fieldStateHtml(intelligence.visualStyle, () => '')}</div>
      <div><strong>Texto en pantalla</strong>${fieldStateHtml(intelligence.onScreenText, () => '')}</div>
      <div><strong>Personas</strong>${fieldStateHtml(intelligence.people, () => '')}</div>
      <div><strong>Producto</strong>${fieldStateHtml(intelligence.productPresence, () => '')}</div>
    </div>
    ${escenasHtml}
    ${keyframesHtml ? `<div style="margin-top:8px;">${keyframesHtml}</div>` : ''}
  `;
}

function adaptationProposalCardHtml(p, index) {
  return `<div class="variant-card" data-proposal-index="${index}">
    <h4>${p.label}</h4>
    <div class="variant-field"><strong>Mantiene</strong>${p.keeps}</div>
    <div class="variant-field"><strong>Cambia</strong>${p.changes}</div>
    <div class="variant-field"><strong>Duración objetivo</strong>${p.targetDurationSeconds ? `${p.targetDurationSeconds.toFixed(1)}s` : NOT_AVAILABLE_LABEL}</div>
    <div class="variant-field"><strong>Escenas objetivo</strong>${p.targetSceneCount ?? NOT_AVAILABLE_LABEL}</div>
    <div class="variant-field"><strong>Producto</strong>${p.productNombreVisible}</div>
    <div class="variant-field"><strong>Hook</strong>${p.hook}</div>
    <div class="variant-field"><strong>CTA</strong>${p.cta}</div>
    <button type="button" class="btn-secondary btn-use-proposal" data-proposal-index="${index}">USAR ESTA PROPUESTA →</button>
    <div class="production-status hidden" data-proposal-index="${index}"></div>
  </div>`;
}

async function analyzeReferenceVideo() {
  const sourcePath = $('#reference-source-path').value.trim();
  const statusEl = $('#reference-analysis-status');
  const resultEl = $('#reference-analysis-result');
  if (!sourcePath) { statusEl.textContent = 'Escribe la ruta real local del video de referencia.'; return; }

  const btn = $('#reference-analyze-btn');
  btn.disabled = true; btn.textContent = 'ANALIZANDO REFERENCIA…';
  statusEl.textContent = 'Analizando referencia (duración, formato, escenas, ritmo, silencios)…';
  resultEl.innerHTML = '';
  try {
    const { analysis, reused } = await api('/api/adapt/reference/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourcePath }) });
    currentReferenceId = analysis.referenceId;
    statusEl.textContent = reused ? 'Este video ya había sido analizado -- se reutiliza el análisis existente.' : 'Análisis creativo completo.';

    if (!productsCache.length) productsCache = await api('/api/products');
    const productOptions = productsCache.filter((p) => p.factsAvailable).map((p) => `<option value="${p.productSlug}">${p.nombreVisible ?? p.productSlug}</option>`).join('');

    resultEl.innerHTML = `
      ${referenceAnalysisPreviewHtml(analysis)}
      <h4 style="margin-top:16px;">¿Cómo quieres adaptarlo?</h4>
      <label>Producto de Vida Divina
        <select id="reference-product-select">${productOptions}</select>
      </label>
      <button type="button" class="btn-primary" id="reference-propose-btn">GENERAR PROPUESTAS DE ADAPTACIÓN</button>
      <div id="reference-proposals-status" class="meta"></div>
      <div id="reference-proposals-list" class="variant-grid"></div>
    `;
    $('#reference-propose-btn').addEventListener('click', proposeReferenceAdaptation);
  } catch (err) {
    statusEl.textContent = `Error al analizar la referencia: ${err.message}`;
  } finally {
    btn.disabled = false; btn.textContent = 'ANALIZAR REFERENCIA';
  }
}
$('#reference-analyze-btn')?.addEventListener('click', analyzeReferenceVideo);

async function proposeReferenceAdaptation() {
  const productId = $('#reference-product-select').value;
  const statusEl = $('#reference-proposals-status');
  const listEl = $('#reference-proposals-list');
  const btn = $('#reference-propose-btn');
  btn.disabled = true; btn.textContent = 'GENERANDO PROPUESTAS…';
  statusEl.textContent = 'Consultando Creative Strategy Engine real…';
  listEl.innerHTML = '';
  try {
    const result = await api('/api/adapt/reference/propose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referenceId: currentReferenceId, productId }) });
    if (result.status !== 'PROPOSALS_READY') {
      statusEl.textContent = '';
      listEl.innerHTML = `<div class="result-status ${result.status}">${result.status}</div><p>${(result.errors ?? []).join(' ')}</p>`;
      return;
    }
    statusEl.textContent = 'Propuestas de adaptación reales, listas para producir.';
    listEl.innerHTML = result.proposals.map((p, i) => adaptationProposalCardHtml(p, i)).join('');
    listEl.querySelectorAll('.btn-use-proposal').forEach((useBtn) => {
      useBtn.addEventListener('click', () => {
        const idx = Number(useBtn.dataset.proposalIndex);
        const proposal = result.proposals[idx];
        const statusDiv = listEl.querySelector(`.production-status[data-proposal-index="${idx}"]`);
        statusDiv.classList.remove('hidden');
        statusDiv.innerHTML = '<button type="button" class="btn-primary btn-produce-reference">PRODUCIR VIDEO →</button>';
        statusDiv.querySelector('.btn-produce-reference').addEventListener('click', () => produceReferenceAdaptation(proposal, statusDiv));
      });
    });
  } catch (err) {
    statusEl.textContent = `Error al generar propuestas: ${err.message}`;
  } finally {
    btn.disabled = false; btn.textContent = 'GENERAR PROPUESTAS DE ADAPTACIÓN';
  }
}

// La producción real solo ocurre aquí, después de que el usuario elige una
// propuesta y confirma explícitamente -- llama al MISMO endpoint real que
// ya usa "Sugerir variantes -> PRODUCIR VIDEO REAL" (nunca un segundo pipeline).
async function produceReferenceAdaptation(proposal, statusEl) {
  statusEl.innerHTML = '<p class="placeholder">Produciendo pieza audiovisual real (guion, escenas, voz real, composición)… puede tardar varios minutos.</p>';
  try {
    const job = await api('/api/create/produce', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: proposal.batchId, variantIndex: proposal.variantIndex, outputProfileNames: ['INSTAGRAM_REEL', 'INSTAGRAM_FEED'] }),
    });
    const outputsHtml = (job.outputs ?? []).map((o) => `<div class="variant-field"><strong>${o.profileName}</strong>${o.status}${o.mediaUrl ? ` — <a href="${o.mediaUrl}" target="_blank" rel="noopener">ver video</a>` : ''}</div>`).join('');
    const editorBtn = job.productionJobId ? `<button type="button" class="btn-secondary btn-open-editor-ref" data-production-job-id="${job.productionJobId}">ABRIR EN EDITOR →</button>` : '';
    statusEl.innerHTML = `<div class="result-status ${job.status}">${job.status}</div>${outputsHtml}${job.error ? `<p>${job.error}</p>` : ''}${editorBtn}`;
    const openBtn = statusEl.querySelector('.btn-open-editor-ref');
    if (openBtn && window.VidaDivinaEditor) openBtn.addEventListener('click', () => window.VidaDivinaEditor.openFromProductionJob(openBtn.dataset.productionJobId));
  } catch (err) {
    statusEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
  }
}

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
function closePreview() {
  $('#preview-modal').classList.add('hidden');
  $('#preview-video').pause();
  $('#preview-video').src = '';
}
$('#preview-close').addEventListener('click', closePreview);
$('#preview-close-label').addEventListener('click', closePreview);

// Preview siempre cerrable: al terminar el video, NO se cierra solo -- el
// usuario siempre tiene "Cerrar vista previa" visible y ESC disponible.
// ESC cierra cualquier modal visible de la app (mismo componente reutilizado
// en Crear/Editar/Adaptar/Assets/Revisión/etc.), no solo el preview.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const modalAbierto = $$('.modal:not(.hidden)')[0];
  if (!modalAbierto) return;
  if (modalAbierto.id === 'preview-modal') { closePreview(); return; }
  modalAbierto.classList.add('hidden');
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
const ASSET_CATEGORY_LABELS = { FINAL: 'Final aprobado', EDITED: 'En edición', GENERATED: 'Generado', RAW: 'RAW' };

function outputAssetCard(o) {
  const category = o.lineage ? (o.lineage.operation?.startsWith('ADAPT') ? 'FINAL' : o.lineage.operation?.startsWith('EDIT') ? 'EDITED' : 'GENERATED') : 'FINAL';
  return `<div class="asset-card" data-status="${category}" data-format="${o.lineage?.outputProfileName ?? ''}" data-modified="${o.modifiedAt}" data-source-path="${o.sourcePath}">
    <div class="body">
      <div class="filename">${o.filename}</div>
      <span class="tag ${category}">${ASSET_CATEGORY_LABELS[category] ?? category}</span>
      ${o.lineage?.outputProfileName ? `<span class="tag" style="background:var(--cream-3);color:var(--soft-black);">${o.lineage.outputProfileName}</span>` : ''}
      <div class="meta" style="font-size:11px;color:#6b654f;margin-top:4px;">${(o.fileSizeBytes / 1024 / 1024).toFixed(1)} MB · ${new Date(o.modifiedAt).toLocaleString()}</div>
      <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
        ${o.mediaUrl ? `<button class="btn-secondary" data-preview="${o.mediaUrl}" data-preview-source="${o.sourcePath}">VER</button>` : ''}
        <button class="btn-secondary" data-action="delete-asset" data-final="${category === 'FINAL'}">Eliminar</button>
      </div>
    </div>
  </div>`;
}

async function deleteAssetWithConfirmation(sourcePath, isFinal) {
  const advertenciaFinal = isFinal ? '\n\nEste contenido está marcado como final/aprobado.' : '';
  if (!confirm(`¿Eliminar este asset?${advertenciaFinal}\n\nEl archivo se eliminará permanentemente del almacenamiento local.`)) return;
  try {
    const result = await api('/api/assets/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourcePath }) });
    if (result.deleted) {
      alert('Asset eliminado correctamente.');
    } else {
      alert(`No se pudo eliminar el asset: ${result.reason ?? 'motivo desconocido'}`);
    }
  } catch (err) {
    if (err.usedBy) {
      alert(`No se puede eliminar este asset porque todavía está siendo utilizado.\n\nUtilizado por: ${err.usedBy}`);
    } else {
      alert(`No se pudo eliminar el asset: ${err.message}`);
    }
  } finally {
    loadAssets();
  }
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
  $$('[data-action="delete-asset"]', el).forEach((b) => {
    const card = b.closest('[data-source-path]');
    b.addEventListener('click', () => deleteAssetWithConfirmation(card.dataset.sourcePath, b.dataset.final === 'true'));
  });
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
  const NOT_AVAILABLE = '<span style="font-style:italic;color:var(--burgundy);">No especificado</span>';
  const campo = (label, valor) => `<div style="font-size:12px;margin-top:4px;"><strong>${label}:</strong> ${valor ?? NOT_AVAILABLE}</div>`;
  // dataQualityStatus (Corrección "Limpieza y normalización del Product
  // Knowledge", 2026-08-28, Paso 22 del encargo): solo se muestra cuando es
  // relevante (nunca para VERIFIED -- "mostrar solo si es relevante").
  const DATA_QUALITY_BADGES = {
    INCOMPLETE: '⚠️ Información incompleta', CONFLICT: '⚠️ Requiere revisión', MISSING: '⚠️ Sin datos reales',
  };

  el.innerHTML = products.map((p) => {
    // Fotografía principal real (Paso 3/12/22 del encargo): el asset real
    // marcado PRODUCT_PRIMARY -- NUNCA el primero por orden alfabético del
    // arreglo real (root cause real ya corregido en productCatalog.js;
    // esta vista todavía usaba rawAssets[0] directo).
    const fotoPrincipal = p.rawAssets.find((a) => a.role === 'PRODUCT_PRIMARY') ?? p.rawAssets[0];
    return `
    <div class="product-card">
      ${fotoPrincipal ? `<img src="/media/assets-products/${encodeURIComponent(p.productSlug)}/raw/${encodeURIComponent(fotoPrincipal.originalFilename)}" alt="${p.productSlug}" />` : ''}
      <div class="body">
        <div class="product-name">${p.factsAvailable ? p.nombreVisible : `${p.productSlug} <span style="font-weight:400;font-style:italic;color:var(--burgundy);">(sin nombre comercial real)</span>`}</div>
        ${p.factsAvailable ? `
          ${p.estadoComercial && p.estadoComercial !== 'ACTIVO' ? `<div class="tag" style="background:#f2c94c;color:#3a2e00;display:inline-block;margin:4px 0;">${p.estadoComercial}</div>` : ''}
          ${DATA_QUALITY_BADGES[p.dataQualityStatus] ? `<div class="tag" style="background:#f2c94c;color:#3a2e00;display:inline-block;margin:4px 0;" title="${p.dataQualityDetail ?? ''}">${DATA_QUALITY_BADGES[p.dataQualityStatus]}</div>` : ''}
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
    </div>`;
  }).join('') || '<p class="empty-state">Sin productos con assets reales todavía.</p>';
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
  sel.innerHTML = products.map((p) => `<option value="${p.productSlug}">${p.nombreVisible ?? p.productSlug}</option>`).join('');
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
    <div style="font-size:12px;">${label(OBJECTIVE_LABELS, c.objective)} · ${c.platform} · ${label(FREQUENCY_LABELS, c.frequency)} · Modo de ejecución: ${label(EXECUTION_MODE_LABELS, c.executionMode)}</div>
    <div style="font-size:12px;color:#6b654f;">${c.startDate} → ${c.endDate} · objetivo: ${c.targetContentCount} contenidos</div>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn-secondary" data-action="overview">VER RESUMEN DE CAMPAÑA</button>
      <button class="btn-secondary" data-action="delete">Eliminar campaña</button>
    </div>
  </div>`;
}
async function deleteMarketingCampaignWithConfirmation(id) {
  if (!confirm('¿Eliminar esta campaña?')) return;
  try {
    await api(`/api/marketing-campaigns/${id}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    loadMarketingCampaigns();
  } catch (err) {
    if (err.contentPlanCount) {
      alert(`No se puede eliminar esta campaña porque tiene ${err.contentPlanCount} contenido(s) asociado(s).`);
    } else {
      alert(`No se pudo eliminar la campaña: ${err.message}`);
    }
  }
}
async function loadMarketingCampaigns() {
  const el = $('#marketing-campaigns-list');
  el.innerHTML = '<p class="placeholder">Cargando…</p>';
  const campaigns = await api('/api/marketing-campaigns');
  el.innerHTML = campaigns.length ? campaigns.map(marketingCampaignCard).join('') : '<p class="empty-state">Sin campañas creadas todavía.</p>';
  $$('[data-mkt-campaign-id]', el).forEach((card) => {
    card.querySelector('[data-action="overview"]')?.addEventListener('click', () => openCampaignOverview(card.dataset.mktCampaignId));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteMarketingCampaignWithConfirmation(card.dataset.mktCampaignId));
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
        <div><strong>Objetivo</strong>${label(OBJECTIVE_LABELS, overview.objective)}</div>
        <div><strong>Producto</strong>${overview.productName ?? campaign.productId}</div>
        <div><strong>Plataforma</strong>${overview.platforms.join(', ')}</div>
        <div><strong>Periodo</strong>${campaign.startDate} → ${campaign.endDate}</div>
        <div><strong>Modo de ejecución</strong>${label(EXECUTION_MODE_LABELS, campaign.executionMode)}</div>
      </div>
      <div class="pubdetail-grid">
        <div><strong>Planificados</strong>${overview.planned}</div>
        <div><strong>Publicados</strong>${overview.published}</div>
        <div><strong>Pendientes</strong>${overview.pending}</div>
        <div><strong>Fallidos</strong>${overview.failed}</div>
      </div>
      ${overview.planned === 0 ? '<p class="empty-state">Sin contenido asociado todavía para este producto/plataforma/rango de fechas.</p>' : ''}
      <h4 style="margin:16px 0 4px;">Contenidos de esta campaña</h4>
      <div id="campaign-overview-plans">${overview.contentPlans.map((p) => contentPlanCard({ ...p, status: p.effectiveStatus })).join('') || ''}</div>
      <details style="margin-top:12px;"><summary style="cursor:pointer;font-size:11px;color:#9c9683;">Detalles técnicos</summary><p style="font-size:11px;color:#9c9683;">${overview.correlationMethod}</p></details>
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
    <strong>${p.status} · Modo de ejecución: ${label(EXECUTION_MODE_LABELS, p.executionMode)}</strong>
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
      <div><strong>Producto</strong><br/>${proposal.product.nombreVisible ?? proposal.product.nombreComercial}</div>
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
    + products.map((p) => `<option value="${p.productSlug}">${p.nombreVisible ?? p.productSlug}${p.factsAvailable ? '' : ' (sin catálogo real todavía)'}</option>`).join('');
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
  async function requestCarouselProposal(selectedStructureId = null) {
    const resultEl = $('#carousel-propose-result');
    resultEl.innerHTML = '<p class="placeholder">Consultando Creative Intelligence real…</p>';
    try {
      const proposal = await api('/api/carousel/propose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIntent: carouselProposeForm.userIntent.value, slideCount: Number(carouselProposeForm.slideCount.value), selectedStructureId,
        }),
      });
      lastCarouselProposal = proposal;
      if (proposal.status !== 'PROPOSAL_READY') {
        resultEl.innerHTML = renderCreativeProposal(proposal);
        return;
      }
      // Creative Structure Engine (Paso 16/18 del encargo): "Así se
      // contará la pieza" real -- función narrativa real de cada slide,
      // ya alineada al número real de slides.
      const slidesHtml = proposal.carousel.slides.map((s, i) => `
        <div class="output-card">
          <h4>Slide ${i + 1}/${proposal.carousel.actualSlideCount} — ${s.stage}</h4>
          <div>${s.headline ?? ''}</div>
          ${s.body ? `<div style="font-size:12px;color:#6b654f;">${s.body}</div>` : ''}
          ${s.cta ? `<div style="font-weight:700;">${s.cta}</div>` : ''}
        </div>`).join('');
      const cs = proposal.carousel.creativeStructure;
      const structureOptionsHtml = (proposal.structureOptions ?? [])
        .map((o) => `<option value="${o.structureId}"${o.structureId === cs.structureId ? ' selected' : ''}>${o.label}</option>`).join('');
      resultEl.innerHTML = `
        <div class="result-status COMPLETED">PROPUESTA LISTA — ${proposal.carousel.actualSlideCount} slides</div>
        <div class="model-recommendation structure-recommendation">
          <span class="structure-suggestion-label">Estructura sugerida: <strong>${cs.recommendedStructure?.label ?? cs.structureId} ✓</strong><br><span class="meta">${cs.recommendationReason}</span></span>
          <button type="button" class="btn-link btn-change-structure">Cambiar estructura</button>
          <select class="structure-select hidden" id="carousel-structure-select">${structureOptionsHtml}</select>
        </div>
        ${proposal.carousel.warnings.length ? `<p style="font-size:12px;color:#6b654f;">${proposal.carousel.warnings.join(' · ')}</p>` : ''}
        ${slidesHtml}
        <button class="btn-primary" id="carousel-produce-btn">PRODUCIR CARRUSEL REAL</button>
      `;
      $('.btn-change-structure', resultEl).addEventListener('click', () => $('#carousel-structure-select', resultEl).classList.toggle('hidden'));
      $('#carousel-structure-select', resultEl).addEventListener('change', (ev) => requestCarouselProposal(ev.target.value));
      $('#carousel-produce-btn', resultEl).addEventListener('click', () => produceCarousel(lastCarouselProposal));
    } catch (err) {
      resultEl.innerHTML = `<div class="result-status VALIDATION_FAILED">ERROR</div><p>${err.message}</p>`;
    }
  }

  carouselProposeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = carouselProposeForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'GENERANDO PROPUESTA…';
    try {
      await requestCarouselProposal(null);
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
  if (meta.executionMode) rows.push(`<div><strong>Modo de ejecución</strong>${label(EXECUTION_MODE_LABELS, meta.executionMode)}</div>`);
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
      ? 'Calendario de publicaciones — la publicación automática está lista.'
      : 'La publicación automática todavía no está configurada. Contacta al administrador para completar la configuración.';
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
// asociado" / "No disponible", nunca 0 ni un dato simulado.
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
      <div><strong>External ID</strong>${record.externalPublicationId ?? 'No disponible'}</div>
      <div><strong>Fecha</strong>${record.publishedAt ? new Date(record.publishedAt).toLocaleString() : (record.scheduledAt ? new Date(record.scheduledAt).toLocaleString() : 'Sin fecha aún')}</div>
      <div><strong>Estado</strong>${record.status}</div>
      <div><strong>Permalink</strong>No disponible</div>
    </div>`;
    if (record.caption) html += `<p><strong>Caption:</strong> ${record.caption}</p>`;
    if (record.error) html += `<p style="color:#a04b3a;"><strong>Error real:</strong> ${record.error}</p>`;

    html += '<h4 style="margin-bottom:4px;">Strategy Decision / ContentPlan</h4>';
    html += plan
      ? contentPlanCard(plan)
      : '<p class="empty-state">Sin ContentPlan real asociado a esta publicación (creada directamente desde Crear/Editar/Adaptar).</p>';

    html += '<h4 style="margin-bottom:4px;">Performance</h4>';
    html += perf
      ? `<div class="campaign-card"><div style="font-size:12px;">engagement ${perf.metrics?.engagement ?? 'No disponible'} · views ${perf.metrics?.views ?? 'No disponible'} · likes ${perf.metrics?.likes ?? 'No disponible'} · comments ${perf.metrics?.comments ?? 'No disponible'} · shares ${perf.metrics?.shares ?? 'No disponible'} · saves ${perf.metrics?.saves ?? 'No disponible'}</div></div>`
      : '<p class="empty-state">No disponible -- sin datos de Performance todavía para este publicationId externo.</p>';

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
    html += schedule ? renderAssetPackagePreview(schedule.assetPackageSnapshot) : '<p class="empty-state">Este contenido todavía no ha sido producido.</p>';
    html += `<div class="pubdetail-grid">
      <div><strong>Hook</strong>No disponible (no persistido en ContentPlan real)</div>
      <div><strong>Guion</strong>No disponible (no persistido en ContentPlan real)</div>
      <div><strong>CTA</strong>${plan.cta ?? 'No disponible'}</div>
      <div><strong>Audio</strong>${audioAsset ? audioAsset.split(/[\\/]/).pop() : 'No disponible'}</div>
      <div><strong>Caption</strong>${schedule?.caption ?? 'No disponible'}</div>
      <div><strong>Formato</strong>${plan.format ?? 'No disponible'}</div>
      <div><strong>Producto</strong>${plan.product ?? 'No disponible'}</div>
      <div><strong>Plataforma</strong>${plan.platform ?? 'No disponible'}</div>
      <div><strong>Objetivo</strong>${plan.objective ?? 'No disponible'}</div>
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
      <div><strong>Modo de ejecución</strong>${label(EXECUTION_MODE_LABELS, plan.executionMode)}</div>
      <div><strong>Publication Status</strong>${schedule ? (SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status) : 'Sin ScheduledPublication vinculada'}</div>
      <div><strong>External ID</strong>${schedule?.externalPublicationId ?? 'No disponible'}</div>
    </div>`;
    if (plan.autoPublish) html += `<p style="font-size:12px;">Auto Publish: ${plan.autoPublish.enabled ? 'ON' : 'OFF'} · Eligibility: ${plan.autoPublish.eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE'}${plan.autoPublish.reasons?.length ? ` · ${plan.autoPublish.reasons.join(' · ')}` : ''}</p>`;
    html += '<div class="schedule-actions" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;" id="content-detail-actions"></div>';

    html += '<h4>PERFORMANCE</h4>';
    html += perf
      ? `<div class="campaign-card"><div style="font-size:12px;">engagement ${perf.metrics?.engagement ?? 'No disponible'} · views ${perf.metrics?.views ?? 'No disponible'} · likes ${perf.metrics?.likes ?? 'No disponible'}</div></div>`
      : '<p class="empty-state">No disponible.</p>';

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
      <div><strong>Contacto</strong>${contact?.nombre ?? conversation.waIdConversacion ?? 'No disponible'}</div>
      <div><strong>wa_id</strong>${conversation.waIdConversacion}</div>
      <div><strong>Estado</strong>${conversation.estadoActual ?? 'No disponible'}</div>
      <div><strong>Origen</strong>${conversation.source}</div>
      <div><strong>Última actividad</strong>${conversation.ultimaInteraccion ? new Date(conversation.ultimaInteraccion).toLocaleString() : 'No disponible'}</div>
      <div><strong>Producto (Opportunity)</strong>${opportunity?.productName ?? 'No disponible'}</div>
      <div><strong>Opportunity estado</strong>${opportunity?.estado ?? 'No disponible'}</div>
    </div>`;
    html += '<h4>Historial real</h4>';
    html += messages.length ? messages.map(whatsappMessageBubble).join('') : '<p class="empty-state">Sin mensajes todavía.</p>';
    html += `
      <h4>Respuesta manual</h4>
      <button class="btn-secondary" disabled title="Sugerencia de respuesta con IA no disponible todavía en esta pantalla.">Sugerencia de IA no disponible</button>
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
