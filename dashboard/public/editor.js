// editor.js — Editable Video Project (2026-08-24, extendido 2026-08-25 —
// Fix Editor: Hook/Voiceover/Captions + Caption Styles). Editor funcional
// del Dashboard: abre un proyecto editable real sobre un ProductionJob ya
// producido y permite editar, como TRES CAPAS SEPARADAS por escena --
// Hook/On-Screen Text, Voiceover/Voz y Captions (visibilidad/posición/
// preset/estilo) --, además de música, asset por-escena, CTA y formatos de
// salida. SIN volver a correr la capa estratégica ni regenerar voz por
// defecto -- Save guarda el draft real, "Regenerar voz" es la ÚNICA acción
// que llama a Voice Engine (nunca automática al escribir), Preview
// renderiza rápido 1 formato, Render produce una versión nueva real (v2,
// v3...) reutilizando lo que no cambió.
//
// Carga como script clásico (no module) DESPUÉS de app.js -- reutiliza
// sus helpers globales $()/api() (ver app.js), y expone
// window.VidaDivinaEditor para que app.js pueda abrir un proyecto desde
// el botón "ABRIR EN EDITOR →" de una producción real recién terminada.

(function editorModule() {
  let currentProject = null;
  let selectedSceneId = null;
  let pendingEdits = { scenes: {} };
  let musicTracks = [];
  let captionStyleOptions = null; // /api/caption-style-options -- ÚNICA fuente real de posiciones/alineaciones/animaciones/presets (nunca duplicados aquí).
  let highlightWordsDraft = []; // estado real de la fila de "palabras destacadas" de la escena SELECCIONADA -- se reconstruye al cambiar de escena.
  let styleEditorOpen = false;

  function sceneLabel(scene) {
    const dur = scene.durationOverride ?? scene.voiceTrack?.durationSeconds ?? scene.duration;
    const pendientes = pendingEdits.scenes[scene.sceneId] ? ' ✎' : '';
    return `${scene.sceneId} · ${scene.sceneKind} · ${dur.toFixed(1)}s${pendientes}`;
  }

  function renderSceneList() {
    const list = $('#editor-scene-list');
    list.innerHTML = currentProject.scenes.map((s) => `
      <button type="button" class="editor-scene-btn ${s.sceneId === selectedSceneId ? 'active' : ''}" data-scene-id="${s.sceneId}">${sceneLabel(s)}</button>
    `).join('');
    list.querySelectorAll('.editor-scene-btn').forEach((b) => {
      b.addEventListener('click', () => {
        // Paso 9/16/17 del encargo: captura real el formulario de la
        // escena SALIENTE ANTES de reemplazar el panel -- de lo
        // contrario, cambiar de escena sin haber pulsado "APLICAR"
        // primero descarta en silencio la edición real recién hecha
        // (el panel se reconstruye desde currentProject, no desde el
        // formulario real que se está abandonando).
        captureCurrentSceneFormIfOpen();
        selectedSceneId = b.dataset.sceneId; renderSceneList(); renderScenePropsPanel();
      });
    });
  }

  // Versiones (Corrección "Flujo creativo integral", 2026-08-28, Paso 22
  // del encargo): nombre humano real (o.displayName, ver
  // content-orchestrator/src/displayName.js) como texto del enlace -- el
  // profileName técnico ("INSTAGRAM_REEL") solo queda como fallback real
  // para versiones ya existentes de ANTES de esta corrección (nunca
  // "output-INSTAGRAM_REEL.mp4" ni un UUID como información principal).
  function renderVersionsList() {
    const list = $('#editor-versions-list');
    list.innerHTML = [...currentProject.versions].reverse().map((v) => `
      <div class="variant-field">
        <strong>v${v.versionNumber}</strong> ${v.status} — ${v.editsSummary ?? 'Producción original.'}
        ${(v.outputs ?? []).map((o) => (o.mediaUrl ? `<br/><a href="${o.mediaUrl}" target="_blank" rel="noopener">${o.displayName ?? o.profileName}</a>` : '')).join('')}
      </div>
    `).join('');
  }

  // ---------------------------------------------------------------------
  // Valores reales VIGENTES de la escena seleccionada -- misma regla de
  // fallback que editableVideoProject.js (override ?? original), para que
  // el formulario nunca muestre un valor distinto del que el render
  // realmente va a usar.
  function currentSceneOverrideOrBase(scene) {
    const style = scene.captionStyleOverride ?? {};
    return {
      onScreenText: scene.onScreenTextOverride ?? scene.onScreenText,
      onScreenTextVisible: scene.onScreenTextVisible ?? true,
      voiceoverText: scene.voiceoverTextOverride ?? scene.narration,
      narrationOriginal: scene.narration,
      voiceRegenerated: Boolean(scene.voiceTrack?.isRegenerated),
      voiceRegeneratedAt: scene.voiceTrack?.regeneratedAt ?? null,
      captionsVisibility: scene.captionsVisibility ?? 'AUTO',
      position: style.position ?? 'bottom',
      alignment: style.alignment ?? 'center',
      animation: style.animation ?? 'fade',
      presetId: style.presetId ?? null,
      fontFamily: style.fontFamily ?? '"Segoe UI", Arial, sans-serif',
      fontSizePx: style.fontSizePx ?? 38,
      fontWeight: style.fontWeight ?? 600,
      textColor: style.textColor ?? '#ffffff',
      backgroundColor: style.backgroundColor ?? '#000000',
      backgroundOpacity: style.backgroundOpacity ?? 0.45,
      outlineColor: style.outlineColor ?? '#000000',
      outlineWidthPx: style.outlineWidthPx ?? 0,
      shadow: style.shadow ?? false,
      highlightColor: style.highlightColor ?? '#ffd166',
      highlightWords: (style.highlightWords ?? []).map((w) => (typeof w === 'string' ? { text: w } : { ...w })),
      assetPath: scene.assetOverride?.imageSourcePath ?? '',
      duration: scene.durationOverride ?? scene.voiceTrack?.durationSeconds ?? scene.duration,
      maxDuration: scene.voiceTrack?.isRegenerated && scene.voiceTrack?.durationSeconds ? scene.voiceTrack.durationSeconds : scene.duration,
      voiceVolume: scene.voiceTrack?.volume ?? 1,
    };
  }

  // ---------------------------------------------------------------------
  // Palabras destacadas -- fila editable real (Problema 3: color/peso/
  // tamaño/background/animación por palabra).
  function renderHighlightWordsRows() {
    const container = $('#prop-highlight-words-rows');
    if (!container) return;
    const animOpts = captionStyleOptions?.animations ?? ['fade', 'pop', 'none'];
    container.innerHTML = highlightWordsDraft.map((w, i) => `
      <div class="highlight-word-row" data-index="${i}">
        <input type="text" class="hw-text" placeholder="palabra/frase" value="${w.text ?? ''}" />
        <input type="color" class="hw-color" value="${w.color ?? '#ffd166'}" title="color" />
        <input type="number" class="hw-weight" placeholder="peso" min="100" max="900" step="100" value="${w.fontWeight ?? ''}" title="font-weight" />
        <input type="number" class="hw-size" placeholder="tamaño px" min="1" value="${w.fontSizePx ?? ''}" title="font-size (px)" />
        <input type="color" class="hw-bg" value="${w.backgroundColor ?? '#000000'}" title="background" />
        <select class="hw-anim" title="animación">
          ${animOpts.map((a) => `<option value="${a}" ${a === (w.animation ?? 'none') ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
        <button type="button" class="hw-remove btn-secondary" title="Quitar">✕</button>
      </div>
    `).join('') || '<p class="placeholder">Sin palabras destacadas.</p>';

    container.querySelectorAll('.hw-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.closest('.highlight-word-row').dataset.index);
        highlightWordsDraft.splice(i, 1);
        renderHighlightWordsRows();
      });
    });
  }

  function collectHighlightWordsFromRows() {
    const container = $('#prop-highlight-words-rows');
    if (!container) return [];
    return [...container.querySelectorAll('.highlight-word-row')].map((row) => {
      const text = row.querySelector('.hw-text').value.trim();
      if (!text) return null;
      const entry = { text };
      const color = row.querySelector('.hw-color').value;
      const bg = row.querySelector('.hw-bg').value;
      const weight = row.querySelector('.hw-weight').value;
      const size = row.querySelector('.hw-size').value;
      const anim = row.querySelector('.hw-anim').value;
      if (color) entry.color = color;
      if (bg) entry.backgroundColor = bg;
      if (weight) entry.fontWeight = Number(weight);
      if (size) entry.fontSizePx = Number(size);
      if (anim && anim !== 'none') entry.animation = anim;
      return entry;
    }).filter(Boolean);
  }

  function applyCaptionPreset(presetName) {
    const preset = captionStyleOptions?.presets?.[presetName];
    if (!preset) return;
    $('#prop-position').value = preset.position;
    $('#prop-alignment').value = preset.alignment;
    $('#prop-animation').value = preset.animation;
    $('#prop-font-family').value = preset.fontFamily;
    $('#prop-font-size').value = preset.fontSizePx;
    $('#prop-font-weight').value = preset.fontWeight;
    $('#prop-text-color').value = preset.textColor;
    $('#prop-bg-color').value = preset.backgroundColor;
    $('#prop-bg-opacity').value = preset.backgroundOpacity;
    $('#prop-outline-color').value = preset.outlineColor;
    $('#prop-outline-width').value = preset.outlineWidthPx;
    $('#prop-shadow').checked = preset.shadow;
    $('#prop-highlight-color').value = preset.highlightColor;
  }

  function renderScenePropsPanel() {
    const panel = $('#editor-scene-props');
    if (!selectedSceneId) { panel.innerHTML = '<p class="placeholder">Selecciona una escena de la lista.</p>'; return; }
    const scene = currentProject.scenes.find((s) => s.sceneId === selectedSceneId);
    const v = currentSceneOverrideOrBase(scene);
    highlightWordsDraft = v.highlightWords;
    const fontOpts = captionStyleOptions?.fontFamilies ?? [v.fontFamily];
    const positions = captionStyleOptions?.positions ?? ['top', 'center', 'bottom'];
    const alignments = captionStyleOptions?.alignments ?? ['left', 'center', 'right'];
    const animations = captionStyleOptions?.animations ?? ['fade', 'pop', 'none'];
    const presetNames = captionStyleOptions?.presetNames ?? ['CLASSIC', 'BOLD', 'MINIMAL', 'HIGHLIGHT', 'SOCIAL_DYNAMIC'];

    panel.innerHTML = `
      <div class="variant-field"><strong>${scene.sceneId}</strong> ${scene.sceneKind}</div>

      <div class="editor-layer-section">
        <h4>Texto en pantalla / Hook</h4>
        <textarea id="prop-onscreen-text" rows="2">${v.onScreenText}</textarea>
        <label class="inline-check"><input type="checkbox" id="prop-onscreen-visible" ${v.onScreenTextVisible ? 'checked' : ''}/> Mostrar texto en pantalla</label>
        <p class="editor-note">Esto modifica solamente el texto visual -- nunca regenera voz ni captions.</p>
      </div>

      <div class="editor-layer-section">
        <h4>Voiceover / Voz</h4>
        <textarea id="prop-voiceover-text" rows="3">${v.voiceoverText}</textarea>
        <button type="button" id="prop-regenerate-voice-btn" class="btn-secondary">REGENERAR VOZ DE ESTA ESCENA</button>
        <div id="prop-voice-status" class="meta">${v.voiceRegenerated ? `Voz regenerada el ${new Date(v.voiceRegeneratedAt).toLocaleString()}.` : 'Voz original de producción (sin regenerar).'}</div>
        <p class="editor-note">Modificar este texto y pulsar "Regenerar voz" genera un audio nuevo real y sincroniza los subtítulos. Guardar sin regenerar solo deja el texto en borrador -- el audio NO cambia hasta que regeneras.</p>
      </div>

      <div class="editor-layer-section">
        <h4>Subtítulos (captions)</h4>
        <label>Modo
          <select id="prop-captions-mode"></select>
        </label>
        <label>Posición
          <select id="prop-position">${positions.map((p) => `<option value="${p}" ${p === v.position ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </label>
        <label>Preset
          <select id="prop-caption-preset">
            <option value="">(personalizado)</option>
            ${presetNames.map((p) => `<option value="${p}" ${p === v.presetId ? 'selected' : ''}>${p.replace('_', ' · ')}</option>`).join('')}
          </select>
        </label>
        <button type="button" id="prop-toggle-style-editor" class="btn-secondary">${styleEditorOpen ? 'OCULTAR ESTILO' : 'EDITAR ESTILO'}</button>

        <div id="prop-style-advanced" class="${styleEditorOpen ? '' : 'hidden'}">
          <label>Fuente
            <select id="prop-font-family">${fontOpts.map((f) => `<option value='${f}' ${f === v.fontFamily ? 'selected' : ''}>${f}</option>`).join('')}</select>
          </label>
          <label>Tamaño de fuente (px)<input type="number" id="prop-font-size" value="${v.fontSizePx}" min="10" max="140" /></label>
          <label>Peso de fuente<input type="number" id="prop-font-weight" value="${v.fontWeight}" min="100" max="900" step="100" /></label>
          <label>Color de texto<input type="color" id="prop-text-color" value="${v.textColor}" /></label>
          <label>Color de fondo<input type="color" id="prop-bg-color" value="${v.backgroundColor}" /></label>
          <label>Opacidad de fondo (0-1)<input type="range" id="prop-bg-opacity" min="0" max="1" step="0.05" value="${v.backgroundOpacity}" /></label>
          <label>Color de contorno (outline)<input type="color" id="prop-outline-color" value="${v.outlineColor}" /></label>
          <label>Grosor de contorno (px)<input type="number" id="prop-outline-width" value="${v.outlineWidthPx}" min="0" max="12" /></label>
          <label class="inline-check"><input type="checkbox" id="prop-shadow" ${v.shadow ? 'checked' : ''}/> Sombra de texto</label>
          <label>Alineación
            <select id="prop-alignment">${alignments.map((a) => `<option value="${a}" ${a === v.alignment ? 'selected' : ''}>${a}</option>`).join('')}</select>
          </label>
          <label>Animación
            <select id="prop-animation">${animations.map((a) => `<option value="${a}" ${a === v.animation ? 'selected' : ''}>${a}</option>`).join('')}</select>
          </label>
          <label>Color de palabra resaltada (default)<input type="color" id="prop-highlight-color" value="${v.highlightColor}" /></label>

          <h5>Palabras destacadas</h5>
          <div id="prop-highlight-words-rows"></div>
          <button type="button" id="prop-add-highlight-word" class="btn-secondary">+ AGREGAR PALABRA</button>
        </div>
      </div>

      <div class="editor-layer-section">
        <h4>Otros</h4>
        <label>Reemplazar asset (ruta local real ya existente en este equipo)<input type="text" id="prop-asset-path" value="${v.assetPath}" placeholder="C:\\ruta\\real\\imagen.png" /></label>
        <label>Duración (solo acortar, nunca alargar -- máx ${v.maxDuration.toFixed(2)}s)<input type="number" id="prop-duration" value="${v.duration}" min="0.5" max="${v.maxDuration}" step="0.1" /></label>
        <label>Volumen de voz<input type="range" id="prop-voice-volume" min="0" max="2" step="0.1" value="${v.voiceVolume}" /></label>
      </div>

      <button type="button" id="prop-apply-btn" class="btn-secondary">APLICAR A ESTA ESCENA (draft)</button>
    `;

    // El <select> de modo de captions se arma con innerHTML "crudo" arriba
    // (visibilityModes ya viene de la API real) -- lo reconstruimos con
    // <option> reales para poder marcar el seleccionado correctamente.
    const modeSelect = $('#prop-captions-mode');
    const modes = captionStyleOptions?.visibilityModes ?? ['AUTO', 'SHOW', 'HIDE'];
    modeSelect.innerHTML = modes.map((m) => `<option value="${m}" ${m === v.captionsVisibility ? 'selected' : ''}>${m}</option>`).join('');

    renderHighlightWordsRows();

    $('#prop-apply-btn').addEventListener('click', () => applySceneProps(scene));
    $('#prop-regenerate-voice-btn').addEventListener('click', () => regenerateSceneVoice(scene));
    $('#prop-toggle-style-editor').addEventListener('click', () => { styleEditorOpen = !styleEditorOpen; renderScenePropsPanel(); });
    $('#prop-caption-preset').addEventListener('change', (e) => { if (e.target.value) applyCaptionPreset(e.target.value); });
    $('#prop-add-highlight-word').addEventListener('click', () => { highlightWordsDraft.push({ text: '' }); renderHighlightWordsRows(); });
  }

  // RENDER SOURCE OF TRUTH (Corrección "Consistencia de audio y
  // persistencia de ediciones de captions", 2026-08-29, Paso 9/16/17 del
  // encargo): root cause real del Problema 2 reportado -- ANTES, esta
  // lectura del formulario real SOLO ocurría al pulsar "APLICAR A ESTA
  // ESCENA", un botón real SEPARADO de GUARDAR/RENDER. Si el usuario
  // editaba un campo real (ej. desactivaba captions, cambiaba el CTA) y
  // pulsaba GUARDAR/RENDER directamente -- o cambiaba de escena -- sin
  // pulsar ese botón primero, el cambio real NUNCA llegaba a
  // pendingEdits.scenes y se perdía en silencio (el render usaba el
  // estado real ANTERIOR). Ahora esta lectura es una función real PURA
  // (sin efectos secundarios) para poder invocarse automáticamente desde
  // save()/el cambio de escena, además del botón explícito -- Paso 9:
  // "la fuente de verdad debe ser CURRENT EDITABLE PROJECT STATE", nunca
  // un estado de formulario real que el usuario olvidó confirmar.
  function readSceneEditFromForm() {
    const duration = Number($('#prop-duration').value);
    const edit = {
      onScreenTextOverride: $('#prop-onscreen-text').value.trim(),
      onScreenTextVisible: $('#prop-onscreen-visible').checked,
      voiceoverTextOverride: $('#prop-voiceover-text').value.trim(),
      captionsVisibility: $('#prop-captions-mode').value,
      captionStyleOverride: {
        position: $('#prop-position').value,
        alignment: $('#prop-alignment').value,
        animation: $('#prop-animation').value,
        fontFamily: $('#prop-font-family').value,
        fontSizePx: Number($('#prop-font-size').value),
        fontWeight: Number($('#prop-font-weight').value),
        textColor: $('#prop-text-color').value,
        backgroundColor: $('#prop-bg-color').value,
        backgroundOpacity: Number($('#prop-bg-opacity').value),
        outlineColor: $('#prop-outline-color').value,
        outlineWidthPx: Number($('#prop-outline-width').value),
        shadow: $('#prop-shadow').checked,
        highlightColor: $('#prop-highlight-color').value,
        highlightWords: collectHighlightWordsFromRows(),
        presetId: $('#prop-caption-preset').value || null,
      },
      voiceTrack: { volume: Number($('#prop-voice-volume').value) },
    };
    const maxDuration = Number($('#prop-duration').max);
    if (duration < maxDuration) edit.durationOverride = duration;
    const assetPath = $('#prop-asset-path').value.trim();
    if (assetPath) edit.assetOverride = { source: 'EXISTING_ASSET', imageSourcePath: assetPath };
    return edit;
  }

  // true si el panel de propiedades real está efectivamente en pantalla
  // (una escena real seleccionada Y el DOM real ya renderizado) -- nunca
  // intenta leer un formulario real que no existe todavía.
  function scenePropsFormIsOpen() {
    return Boolean(selectedSceneId) && Boolean($('#prop-onscreen-text'));
  }

  /** Captura automáticamente (Paso 9/16/17 del encargo) el formulario real VIGENTE de la escena seleccionada hacia pendingEdits -- llamada SIEMPRE antes de guardar/renderizar/cambiar de escena, nunca solo al pulsar el botón explícito. */
  function captureCurrentSceneFormIfOpen() {
    if (!scenePropsFormIsOpen()) return;
    pendingEdits.scenes[selectedSceneId] = readSceneEditFromForm();
  }

  function applySceneProps(scene) {
    pendingEdits.scenes[scene.sceneId] = readSceneEditFromForm();
    renderSceneList();
    $('#editor-render-status').textContent = 'Cambio(s) en draft, sin guardar todavía -- pulsa GUARDAR.';
  }

  /** Problema 4 -- ÚNICA acción real que llama a Voice Engine. Guarda cualquier draft pendiente primero (para no perder otros cambios de la escena), luego regenera. */
  async function regenerateSceneVoice(scene) {
    const statusEl = $('#prop-voice-status');
    const voiceoverText = $('#prop-voiceover-text').value.trim();
    if (!voiceoverText) { statusEl.textContent = 'Escribe el texto del voiceover antes de regenerar.'; return; }
    const guardado = await save();
    if (!guardado) return;
    statusEl.textContent = 'Regenerando voz real (Voice Engine)… puede tardar hasta varios minutos.';
    try {
      const res = await fetch(`/api/projects/${currentProject.projectId}/scenes/${scene.sceneId}/regenerate-voice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceoverText }),
      });
      const body = await res.json();
      if (body.status === 'VALIDATION_FAILED') { statusEl.textContent = `Rechazado: ${body.errors.join(' ')}`; return; }
      if (body.status === 'SOURCE_ASSET_REQUIRED') { statusEl.textContent = `Voice Engine no disponible: ${body.error}`; return; }
      if (!res.ok || !body.project) { statusEl.textContent = `Error al regenerar voz: ${body.error ?? res.status}`; return; }
      currentProject = body.project;
      renderSceneList(); renderVersionsList(); renderScenePropsPanel();
      statusEl.textContent = 'Voz regenerada real -- audio y captions sincronizados. Pulsa RENDER para producir el nuevo clip.';
    } catch (err) {
      statusEl.textContent = `Error al regenerar voz: ${err.message}`;
    }
  }

  async function loadMusicLibrary() {
    try {
      const { tracks } = await api('/api/music-library');
      musicTracks = tracks;
      const select = $('#editor-music-select');
      select.innerHTML = '<option value="">Sin música</option>' + tracks.map((t) => `<option value="${t.filename}">${t.license.title} (${t.license.mood ?? 'sin mood'})</option>`).join('');
    } catch { /* biblioteca real opcional -- sin música sigue siendo un estado válido. */ }
  }

  async function loadCaptionStyleOptions() {
    if (captionStyleOptions) return;
    try { captionStyleOptions = await api('/api/caption-style-options'); } catch { captionStyleOptions = null; }
  }

  async function loadOutputProfiles() {
    const profiles = await api('/api/output-profiles');
    const grid = $('#editor-output-profiles');
    grid.innerHTML = profiles.filter((p) => p.kind === 'VIDEO').map((p) => `
      <label><input type="checkbox" class="editor-profile-cb" value="${p.name}" ${currentProject.outputProfileNames.includes(p.name) ? 'checked' : ''}/> ${p.name}</label>
    `).join('');
  }

  function fillProjectPanel() {
    $('#editor-cta-text').value = currentProject.scenes.find((s) => s.sceneKind === 'CTA')?.onScreenTextOverride
      ?? currentProject.scenes.find((s) => s.sceneKind === 'CTA')?.onScreenText ?? '';
    $('#editor-music-select').value = currentProject.musicTrack?.trackFilename ?? '';
    $('#editor-music-volume').value = currentProject.musicTrack?.volume ?? 0.12;
  }

  function collectProjectLevelEdits() {
    const edits = { scenes: pendingEdits.scenes };
    const ctaText = $('#editor-cta-text').value.trim();
    if (ctaText) edits.ctaText = ctaText;
    const musicFilename = $('#editor-music-select').value;
    edits.musicTrack = musicFilename
      ? { trackFilename: musicFilename, volume: Number($('#editor-music-volume').value), startSeconds: 0, fadeInSeconds: 0.5, fadeOutSeconds: 0.5 }
      : null;
    edits.outputProfileNames = [...document.querySelectorAll('.editor-profile-cb:checked')].map((cb) => cb.value);
    return edits;
  }

  async function save() {
    const statusEl = $('#editor-render-status');
    statusEl.textContent = 'Guardando draft…';
    // Paso 9/16/17 del encargo (root cause real del Problema 2): captura
    // real el formulario VIGENTE de la escena seleccionada ANTES de
    // construir el payload real -- garantiza que Guardar/Render SIEMPRE
    // reflejen el estado real que el usuario ve en pantalla, nunca
    // dependan de que haya pulsado "APLICAR A ESTA ESCENA" primero.
    captureCurrentSceneFormIfOpen();
    try {
      const { project } = await api(`/api/projects/${currentProject.projectId}/edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edits: collectProjectLevelEdits() }),
      });
      currentProject = project;
      pendingEdits = { scenes: {} };
      renderSceneList(); renderVersionsList(); renderScenePropsPanel(); fillProjectPanel();
      statusEl.textContent = 'Draft guardado.';
      return true;
    } catch (err) {
      statusEl.textContent = `Error al guardar: ${err.message}`;
      return false;
    }
  }

  async function renderVersion(mode) {
    const guardado = await save();
    if (!guardado) return;
    const statusEl = mode === 'PREVIEW' ? $('#editor-preview-status') : $('#editor-render-status');
    statusEl.textContent = mode === 'PREVIEW'
      ? 'Generando preview real (1 formato)… reutiliza lo que no cambió, puede tardar igual varios minutos si hay escenas nuevas que renderizar.'
      : 'Renderizando versión nueva real… reutiliza lo que no cambió (costo $0 salvo regeneración de IA explícita).';
    try {
      const res = await api(`/api/projects/${currentProject.projectId}/render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
      });
      if (mode === 'PREVIEW') {
        const video = $('#editor-preview-video');
        video.src = res.version.outputs?.[0]?.mediaUrl ?? '';
        statusEl.textContent = `Preview real: ${res.version.status} -- ${res.version.editsSummary}`;
      } else {
        currentProject = res.project;
        renderSceneList(); renderVersionsList();
        // "Versión N generada" (Paso 23 del encargo) -- SOLO aparece aquí,
        // tras un render real ya completado (nunca tras regenerar voz,
        // ver regenerateSceneVoice() arriba). Un status distinto de
        // FULL_PRODUCTION/DEGRADED_PRODUCTION (ej. FAILED) nunca se
        // reporta como "generada".
        const primerOutput = res.version.outputs?.find((o) => o.mediaUrl);
        const verVersionHtml = primerOutput ? ` <a href="${primerOutput.mediaUrl}" target="_blank" rel="noopener">[Ver versión]</a>` : '';
        statusEl.innerHTML = res.version.status === 'FAILED'
          ? `Render de v${res.version.versionNumber} falló: ${res.version.error ?? res.version.status}`
          : `✅ Versión ${res.version.versionNumber} generada -- ${primerOutput?.displayName ?? res.version.editsSummary} (costo real: $${res.version.costReport?.estimatedTotal ?? 0})${verVersionHtml}`;
      }
    } catch (err) {
      statusEl.textContent = `Error al renderizar: ${err.message}`;
    }
  }

  async function openProject(projectId) {
    $('#editor-open-status').textContent = 'Abriendo proyecto real…';
    try {
      currentProject = await api(`/api/projects/${projectId}`);
      pendingEdits = { scenes: {} };
      selectedSceneId = currentProject.scenes[0]?.sceneId ?? null;
      styleEditorOpen = false;
      await Promise.all([loadMusicLibrary(), loadOutputProfiles(), loadCaptionStyleOptions()]);
      fillProjectPanel(); renderSceneList(); renderVersionsList(); renderScenePropsPanel();
      $('#editor-open-status').textContent = `Proyecto real "${projectId}" abierto -- v${currentProject.versions.length} actual.`;
      $('#editor-workspace').classList.remove('hidden');
    } catch (err) {
      $('#editor-open-status').textContent = `Error: ${err.message}`;
    }
  }

  async function openFromProductionJob(productionJobId) {
    if (typeof goto === 'function') goto('editor');
    $('#editor-open-status').textContent = 'Creando proyecto editable real desde la producción…';
    try {
      const project = await api('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productionJobId }),
      });
      $('#editor-open-project-id').value = project.projectId;
      await openProject(project.projectId);
    } catch (err) {
      $('#editor-open-status').textContent = `Error: ${err.message}`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#editor-open-btn')?.addEventListener('click', () => {
      const id = $('#editor-open-project-id').value.trim();
      if (id) openProject(id);
    });
    $('#editor-save-btn')?.addEventListener('click', save);
    $('#editor-render-btn')?.addEventListener('click', () => renderVersion('RENDER'));
    $('#editor-preview-btn')?.addEventListener('click', () => renderVersion('PREVIEW'));
  });

  window.VidaDivinaEditor = { openFromProductionJob, openProject };
}());
