// editor.js — Editable Video Project (2026-08-24). Primer Editor
// funcional (no pulido) del Dashboard: abre un proyecto editable real
// sobre un ProductionJob ya producido y permite editar captions, música,
// asset por-escena, CTA y formatos de salida SIN volver a correr la capa
// estratégica ni regenerar voz por defecto -- Save guarda el draft real,
// Preview renderiza rápido 1 formato, Render produce una versión nueva
// real (v2, v3...) reutilizando lo que no cambió.
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

  function sceneLabel(scene) {
    const dur = scene.durationOverride ?? scene.duration;
    const pendientes = pendingEdits.scenes[scene.sceneId] ? ' ✎' : '';
    return `${scene.sceneId} · ${scene.sceneKind} · ${dur.toFixed(1)}s${pendientes}`;
  }

  function renderSceneList() {
    const list = $('#editor-scene-list');
    list.innerHTML = currentProject.scenes.map((s) => `
      <button type="button" class="editor-scene-btn ${s.sceneId === selectedSceneId ? 'active' : ''}" data-scene-id="${s.sceneId}">${sceneLabel(s)}</button>
    `).join('');
    list.querySelectorAll('.editor-scene-btn').forEach((b) => {
      b.addEventListener('click', () => { selectedSceneId = b.dataset.sceneId; renderSceneList(); renderScenePropsPanel(); });
    });
  }

  function renderVersionsList() {
    const list = $('#editor-versions-list');
    list.innerHTML = [...currentProject.versions].reverse().map((v) => `
      <div class="variant-field">
        <strong>v${v.versionNumber}</strong> ${v.status} — ${v.editsSummary ?? 'Producción original.'}
        ${(v.outputs ?? []).map((o) => (o.mediaUrl ? `<br/><a href="${o.mediaUrl}" target="_blank" rel="noopener">${o.profileName}</a>` : '')).join('')}
      </div>
    `).join('');
  }

  function currentSceneOverrideOrBase(scene) {
    const style = scene.captionStyleOverride ?? {};
    return {
      onScreenText: scene.onScreenTextOverride ?? scene.onScreenText,
      fontSizePx: style.fontSizePx ?? 38,
      textColor: style.textColor ?? '#ffffff',
      position: style.position ?? 'bottom',
      animation: style.animation ?? 'fade',
      highlightWords: (style.highlightWords ?? []).join(', '),
      assetPath: scene.assetOverride?.imageSourcePath ?? '',
      duration: scene.durationOverride ?? scene.duration,
      maxDuration: scene.duration,
      voiceVolume: scene.voiceTrack?.volume ?? 1,
    };
  }

  function renderScenePropsPanel() {
    const panel = $('#editor-scene-props');
    if (!selectedSceneId) { panel.innerHTML = '<p class="placeholder">Selecciona una escena de la lista.</p>'; return; }
    const scene = currentProject.scenes.find((s) => s.sceneId === selectedSceneId);
    const v = currentSceneOverrideOrBase(scene);
    panel.innerHTML = `
      <div class="variant-field"><strong>${scene.sceneId}</strong> ${scene.sceneKind} · narración: "${scene.narration}"</div>
      <label>Texto en pantalla<textarea id="prop-onscreen-text" rows="2">${v.onScreenText}</textarea></label>
      <label>Tamaño de fuente (px)<input type="number" id="prop-font-size" value="${v.fontSizePx}" min="16" max="120" /></label>
      <label>Color de texto<input type="color" id="prop-text-color" value="${v.textColor}" /></label>
      <label>Posición
        <select id="prop-position">
          ${['top', 'center', 'bottom'].map((p) => `<option value="${p}" ${p === v.position ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </label>
      <label>Animación
        <select id="prop-animation">
          ${['fade', 'pop', 'none'].map((a) => `<option value="${a}" ${a === v.animation ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
      </label>
      <label>Palabra(s) resaltada(s) (separadas por coma)<input type="text" id="prop-highlight-words" value="${v.highlightWords}" /></label>
      <label>Reemplazar asset (ruta local real ya existente en este equipo)<input type="text" id="prop-asset-path" value="${v.assetPath}" placeholder="C:\\ruta\\real\\imagen.png" /></label>
      <label>Duración (solo acortar, nunca alargar -- máx ${v.maxDuration.toFixed(2)}s)<input type="number" id="prop-duration" value="${v.duration}" min="0.5" max="${v.maxDuration}" step="0.1" /></label>
      <label>Volumen de voz<input type="range" id="prop-voice-volume" min="0" max="2" step="0.1" value="${v.voiceVolume}" /></label>
      <button type="button" id="prop-apply-btn" class="btn-secondary">APLICAR A ESTA ESCENA (draft)</button>
    `;
    $('#prop-apply-btn').addEventListener('click', () => applySceneProps(scene));
  }

  function applySceneProps(scene) {
    const highlightWords = $('#prop-highlight-words').value.split(',').map((w) => w.trim()).filter(Boolean);
    const duration = Number($('#prop-duration').value);
    const edit = {
      onScreenTextOverride: $('#prop-onscreen-text').value.trim(),
      captionStyleOverride: {
        fontSizePx: Number($('#prop-font-size').value),
        textColor: $('#prop-text-color').value,
        position: $('#prop-position').value,
        animation: $('#prop-animation').value,
        highlightWords,
      },
      voiceTrack: { volume: Number($('#prop-voice-volume').value) },
    };
    if (duration < scene.duration) edit.durationOverride = duration;
    const assetPath = $('#prop-asset-path').value.trim();
    if (assetPath) edit.assetOverride = { source: 'EXISTING_ASSET', imageSourcePath: assetPath };
    pendingEdits.scenes[scene.sceneId] = edit;
    renderSceneList();
    $('#editor-render-status').textContent = 'Cambio(s) en draft, sin guardar todavía -- pulsa GUARDAR.';
  }

  async function loadMusicLibrary() {
    try {
      const { tracks } = await api('/api/music-library');
      musicTracks = tracks;
      const select = $('#editor-music-select');
      select.innerHTML = '<option value="">Sin música</option>' + tracks.map((t) => `<option value="${t.filename}">${t.license.title} (${t.license.mood ?? 'sin mood'})</option>`).join('');
    } catch { /* biblioteca real opcional -- sin música sigue siendo un estado válido. */ }
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
        statusEl.textContent = `v${res.version.versionNumber} real: ${res.version.status} -- ${res.version.editsSummary} (costo real: $${res.version.costReport?.estimatedTotal ?? 0})`;
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
      await Promise.all([loadMusicLibrary(), loadOutputProfiles()]);
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
