// hyperframesRenderer.js — motor de render real: ProductionBrief (derivado
// de un VisualProductionPackage real, o de DIRECT_INSTRUCTION_MODE) + Audio
// Asset real + (opcional) asset visual real -> composición HyperFrames ->
// MP4 real, validado con ffprobe.
//
// REGLA CENTRAL: este módulo NUNCA escribe copy nuevo. Todo texto que
// termina en pantalla (hook, product body, CTA, subtítulos) viene
// literalmente de los campos que ya trae el ProductionBrief — nunca se
// genera, mejora ni parafrasea aquí. Tampoco duplica VisualProductionPackage,
// Audio Asset ni ninguna lógica de Creative Intelligence: solo las consume
// como datos de entrada ya construidos en otros módulos.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mergeCaptionStyle, construirCssCaption, resaltarPalabrasHtml, assertValidTextOverlay, OVERLAY_POSICION_CSS } from './captionStyle.js';

export const RENDER_STATUS = Object.freeze(['COMPLETADO', 'ERROR_RENDER', 'ERROR_VALIDACION']);
export const RENDER_FORMAT = 'mp4';
export const RENDER_FPS = 30;

// Lista explícita de esta fase (Parte 8) — claims médicos/de resultado que
// nunca pueden aparecer en pantalla, vengan de donde vengan (afiliado,
// instrucción humana, o cualquier texto de un ProductionBrief). Distinta y
// más amplia que los 4 claims de riesgo de affiliatePipeline.js (esos son
// específicos del snapshot observado; esta lista es la prohibición general
// de contenido médico/de resultado para cualquier render).
export const FORBIDDEN_PRODUCT_CLAIMS = Object.freeze([
  'desintoxica', 'elimina de 1 a 3 kg', 'elimina 1 a 3 kg', 'cura', 'trata',
  'garantiza', 'resultado garantizado', 'tadalafil', 'testosterona', 'pastilla azul',
]);

/**
 * Escanea cualquier texto que vaya a pantalla contra la lista de claims
 * prohibidos de esta fase. Nunca los reformula — los rechaza.
 *
 * Match por LÍMITE DE PALABRA (\b...\b), nunca substring desnudo — un
 * substring desnudo bloquearía falsos positivos reales: "desintoxica" (forma
 * imperativa prohibida) es distinto de "desintoxicación" (sustantivo, forma
 * real y aprobada en el catálogo de TéDivina: "promueve la desintoxicación
 * natural"); "trata" (verbo prohibido) es distinto de "tratamiento"
 * (sustantivo, usado legítimamente en disclaimers como "esto no es un
 * tratamiento"). Bloquear por substring habría rechazado texto real y
 * aprobado.
 */
export function assertNoForbiddenProductClaims(text, fieldName = 'texto') {
  if (typeof text !== 'string') return true;
  for (const claim of FORBIDDEN_PRODUCT_CLAIMS) {
    const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(text)) {
      throw new Error(`assertNoForbiddenProductClaims: "${fieldName}" contiene un claim prohibido ("${claim}") — el renderer nunca hace copywriting, solo produce lo ya autorizado, y esto no está autorizado.`);
    }
  }
  return true;
}

function assertNonEmptyString(value, fieldName) {
  if (!value?.trim()) throw new Error(`hyperframesRenderer: "${fieldName}" es obligatorio.`);
}

/**
 * Reparte proporcionalmente (por número de palabras) las líneas reales de
 * voiceover sobre la duración REAL medida del audio. Aproximación honesta
 * de sincronía -- no es alineación palabra-por-palabra (requeriría
 * whisper-cpp, no instalado / opcional). Nunca reordena ni reescribe una
 * línea.
 */
export function distribuirSubtitulos(lineasVoiceover, duracionTotalSegundos) {
  if (!Array.isArray(lineasVoiceover) || lineasVoiceover.length === 0) {
    throw new Error('distribuirSubtitulos: se requiere un arreglo no vacío de líneas.');
  }
  if (!(duracionTotalSegundos > 0)) {
    throw new Error('distribuirSubtitulos: "duracionTotalSegundos" debe ser > 0 (medido del audio real, nunca asumido).');
  }
  const pesos = lineasVoiceover.map((l) => l.split(/\s+/).filter(Boolean).length);
  const totalPalabras = pesos.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return lineasVoiceover.map((texto, i) => {
    const dur = (pesos[i] / totalPalabras) * duracionTotalSegundos;
    const seg = { texto, start: +cursor.toFixed(3), duration: +dur.toFixed(3) };
    cursor += dur;
    return seg;
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsStringLiteral(s) {
  return JSON.stringify(String(s));
}

// Paleta por defecto = los valores ad-hoc que este renderer ya usaba antes
// de que existiera un Brand Visual System formal (ver
// content-orchestrator/src/brandVisualSystem.js, fase "Content Request +
// Production Orchestrator"). Se conserva aquí como default para que NINGÚN
// llamador existente (ni los tests de este archivo) cambie de
// comportamiento si no pasa `brandColors` explícito -- quien sí quiera la
// paleta oficial de marca debe pasarla, normalmente vía
// brandVisualSystem.js#deriveBrandSceneColors().
export const DEFAULT_BRAND_COLORS = Object.freeze({
  hookBackgroundGradientFrom: '#4a2c1a',
  hookBackgroundGradientTo: '#1b0f0a',
  ctaBackgroundGradientFrom: '#25c26e',
  ctaBackgroundGradientTo: '#1b0f0a',
  hookTextColor: '#fff3e6',
  productLockupColor: '#f5c26b',
  productSubColor: '#f3e6d8',
  ctaTextColor: '#ffffff',
  whatsappPillBackground: '#25d366',
  whatsappPillText: '#08210f',
});

/**
 * Construye el HTML de una composición de 3 escenas (hook / producto / CTA),
 * la misma estructura ya validada manualmente para CC-A1-A (ver reporte de
 * fase). Si se provee `imageRelPath`, la escena 2 muestra la fotografía real
 * (Ken Burns); si no, usa un tratamiento tipográfico (nunca fabrica un
 * packaging).
 *
 * @param {{
 *   hookText: string, productTitle: string, productBody: string,
 *   ctaText: string, whatsappLabel: string, audioRelPath: string,
 *   imageRelPath: string|null, durationSeconds: number, subtitulos: Array<{texto:string, start:number, duration:number}>,
 * }} args
 */
export function construirComposicionHtml({ hookText, productTitle, productBody, ctaText, whatsappLabel, audioRelPath, imageRelPath, durationSeconds, subtitulos, brandColors = DEFAULT_BRAND_COLORS }) {
  const c = { ...DEFAULT_BRAND_COLORS, ...brandColors };
  const camposBase = { hookText, productTitle, ctaText, whatsappLabel, audioRelPath };
  // productBody solo se muestra en el tratamiento tipográfico (sin foto real) -- con imageRelPath, la escena 2 es la fotografía y productBody no se renderiza, así que no se exige.
  if (!imageRelPath) camposBase.productBody = productBody;
  for (const [k, v] of Object.entries(camposBase)) {
    assertNonEmptyString(v, k);
  }
  if (!(durationSeconds > 0)) throw new Error('construirComposicionHtml: "durationSeconds" debe ser > 0 (medido del Audio Asset real).');

  for (const [k, v] of Object.entries({ hookText, productTitle, productBody, ctaText, whatsappLabel })) {
    assertNoForbiddenProductClaims(v, k);
  }
  for (const s of subtitulos ?? []) assertNoForbiddenProductClaims(s.texto, 'subtitulo');

  const t1 = +(durationSeconds * 0.22).toFixed(2); // límite escena1/escena2, proporcional a la duración real
  const t2 = +(durationSeconds * 0.72).toFixed(2); // límite escena2/escena3
  const d1 = t1;
  const d2 = +(t2 - t1).toFixed(2);
  const d3 = +(durationSeconds - t2).toFixed(2);

  const escenaProducto = imageRelPath
    ? `<img class="product-photo" src="${escapeHtml(imageRelPath)}" alt="" />`
    : `<div class="product-lockup">${escapeHtml(productTitle)}</div><div class="product-sub">${escapeHtml(productBody)}</div>`;

  const captionsJs = subtitulos
    .map((s) => `tl.set(text, { innerText: ${jsStringLiteral(s.texto)} }, ${s.start});\n              tl.to(text, { opacity: 1, duration: 0.25 }, ${s.start});\n              tl.to(text, { opacity: 0, duration: 0.25 }, ${Math.max(s.start, s.start + s.duration - 0.25).toFixed(3)});`)
    .join('\n              ');

  return `<!doctype html>
<html lang="es" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>HyperFrames render — auto-generado por hyperframesRenderer.js</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #12100e; font-family: "Segoe UI", Arial, sans-serif; }
      .scene { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 90px; text-align: center; overflow: hidden; }
      .bg { position: absolute; inset: 0; z-index: 0; opacity: 0; }
      #bg-1 { background: radial-gradient(circle at 50% 35%, ${c.hookBackgroundGradientFrom} 0%, ${c.hookBackgroundGradientTo} 70%); }
      #bg-3 { background: radial-gradient(circle at 50% 50%, ${c.ctaBackgroundGradientFrom} 0%, ${c.ctaBackgroundGradientTo} 100%); }
      .content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 36px; }
      .hook-text { font-size: 68px; line-height: 1.15; color: ${c.hookTextColor}; font-weight: 700; max-width: 900px; }
      .product-lockup { font-size: 56px; font-weight: 800; color: ${c.productLockupColor}; letter-spacing: 1px; }
      .product-sub { font-size: 38px; color: ${c.productSubColor}; font-weight: 400; max-width: 820px; line-height: 1.35; }
      .product-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; opacity: 0; }
      .cta-text { font-size: 52px; color: ${c.ctaTextColor}; font-weight: 700; max-width: 860px; line-height: 1.3; }
      .whatsapp-pill { margin-top: 20px; padding: 26px 56px; background: ${c.whatsappPillBackground}; border-radius: 60px; color: ${c.whatsappPillText}; font-size: 44px; font-weight: 800; }
      .caption-wrap { position: absolute; bottom: 130px; left: 0; right: 0; display: flex; justify-content: center; z-index: 2; }
      .caption-line { color: #fff; font-size: 38px; font-weight: 600; text-align: center; max-width: 920px; background: rgba(0,0,0,0.45); padding: 14px 32px; border-radius: 16px; opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${durationSeconds}" data-width="1080" data-height="1920">

      <div id="scene-1" class="scene clip" data-start="0" data-duration="${d1}" data-track-index="1">
        <div class="bg" id="bg-1"></div>
        <div class="content"><div class="hook-text">${escapeHtml(hookText)}</div></div>
      </div>

      <div id="scene-2" class="scene clip" data-start="${t1}" data-duration="${d2}" data-track-index="1">
        ${escenaProducto}
        <div class="content" style="${imageRelPath ? 'display:none' : ''}"></div>
      </div>

      <div id="scene-3" class="scene clip" data-start="${t2}" data-duration="${d3}" data-track-index="1">
        <div class="bg" id="bg-3"></div>
        <div class="content">
          <div class="cta-text">${escapeHtml(ctaText)}</div>
          <div class="whatsapp-pill">${escapeHtml(whatsappLabel)} →</div>
        </div>
      </div>

      <div id="captions-comp" data-composition-id="captions" data-start="0" data-duration="${durationSeconds}" data-track-index="2">
        <div class="caption-wrap"><div id="caption-text" class="caption-line"></div></div>
        <script>
          (function () {
            const tl = gsap.timeline({ paused: true });
            const text = document.querySelector('#caption-text');
            ${captionsJs}
            window.__timelines = window.__timelines || {};
            window.__timelines['captions'] = tl;
          })();
        </script>
      </div>

      <audio id="voiceover" class="clip" data-start="0" data-duration="${durationSeconds}" data-track-index="0" data-volume="1" src="${escapeHtml(audioRelPath)}"></audio>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const mainTl = gsap.timeline({ paused: true });

      mainTl.fromTo('#scene-1 .content, #scene-1 .bg', { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0);
      mainTl.fromTo('#scene-1 .content', { y: 40 }, { y: 0, duration: 0.6, ease: 'power2.out' }, 0.1);
      mainTl.to('#scene-1 .content, #scene-1 .bg', { opacity: 0, duration: 0.3 }, ${Math.max(0, t1 - 0.3).toFixed(3)});
      mainTl.set('#scene-1 .content, #scene-1 .bg', { opacity: 0 }, ${t1});

      ${imageRelPath
        ? `mainTl.fromTo('#scene-2 .product-photo', { opacity: 0, scale: 1 }, { opacity: 1, duration: 0.4 }, ${t1});
      mainTl.to('#scene-2 .product-photo', { scale: 1.12, duration: ${d2}, ease: 'none' }, ${t1});
      mainTl.to('#scene-2 .product-photo', { opacity: 0, duration: 0.3 }, ${Math.max(t1, t2 - 0.3).toFixed(3)});
      mainTl.set('#scene-2 .product-photo', { opacity: 0, scale: 1 }, ${t2});`
        : `mainTl.fromTo('#scene-2 .content, #scene-2 .bg', { opacity: 0 }, { opacity: 1, duration: 0.4 }, ${t1});
      mainTl.fromTo('#scene-2 .content', { scale: 0.92 }, { scale: 1, duration: 0.7, ease: 'power2.out' }, ${t1});
      mainTl.to('#scene-2 .content', { scale: 1.05, duration: ${Math.max(0.1, d2 - 0.7).toFixed(2)}, ease: 'none' }, ${(t1 + 0.7).toFixed(2)});
      mainTl.to('#scene-2 .content, #scene-2 .bg', { opacity: 0, duration: 0.3 }, ${Math.max(t1, t2 - 0.3).toFixed(3)});
      mainTl.set('#scene-2 .content, #scene-2 .bg', { opacity: 0, scale: 1 }, ${t2});`}

      mainTl.fromTo('#scene-3 .bg', { opacity: 0 }, { opacity: 1, duration: 0.4 }, ${t2});
      mainTl.fromTo('#scene-3 .cta-text', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, ${(t2 + 0.2).toFixed(2)});
      mainTl.fromTo('#scene-3 .whatsapp-pill', { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)' }, ${(t2 + 0.9).toFixed(2)});

      window.__timelines['main'] = mainTl;
    </script>
  </body>
</html>
`;
}

// windowsHide (Fix HyperFrames -- eliminar consolas/ventanas visibles de
// render, 2026-08-26): TODO proceso real que Vida Divina lanza (hyperframes
// CLI vía process.execPath, ffmpeg, ffprobe, powershell.exe/taskkill.exe
// del cleanup de huérfanos) pasa por este ÚNICO punto real -- windowsHide
// aquí cubre los 8 sitios de llamada reales (ver hyperframesRenderer.js/
// projectRenderer.js/postProduction.js) sin tocar cada uno por separado.
// windowsHide:true traduce directamente a CREATE_NO_WINDOW en la llamada
// real de Windows a CreateProcess -- solo afecta si Windows asigna una
// consola nueva y visible al proceso hijo real, NUNCA afecta stdout/stderr
// (siguen capturados por pipe real vía `encoding: 'utf8'`, sin cambios) ni
// el resultado real del proceso (status/output). No tiene efecto en
// plataformas que no sean win32 (Node lo ignora ahí). No es Chrome mismo
// (ver limpiarProcesosHuerfanosChrome más abajo -- Chrome real ya corre
// headless con windowsHide:true propio, vía Puppeteer, confirmado en la
// investigación previa) -- esto cubre el PADRE real (node.exe ejecutando
// la CLI de HyperFrames) y los procesos auxiliares reales (ffmpeg/ffprobe/
// powershell/taskkill) que si abren consola nueva, tampoco deben ser
// visibles.
export function correr(cmd, args, opts) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', shell: false, windowsHide: true, ...opts,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', pid: r.pid ?? null };
}

// ---------------------------------------------------------------------
// Limpieza de procesos huérfanos de Chrome (Editable Video Project,
// 2026-08-24) -- bug real reportado: renders repetidos dejaban ventanas de
// Chrome visibles/huérfanas y, ocasionalmente, fallos 0x800700E8
// (Windows: recursos/handles del sistema agotados). Root cause real
// confirmado leyendo node_modules/hyperframes/dist/cli.js
// (src/utils/orphanCleanup.ts#killOrphanedProcesses): esa limpieza YA
// existe en HyperFrames, pero hace `if (process.platform === 'win32')
// return 0` -- es un no-op explícito en Windows, que es exactamente este
// entorno. Esta función NO reemplaza HyperFrames (Paso 15: "no reemplaces
// la tecnología") -- es una red de seguridad adicional, solo para
// Windows, solo mejor-esfuerzo (nunca lanza, nunca bloquea un render).
export function limpiarProcesosHuerfanosChrome({ padrePids = [] } = {}) {
  if (process.platform !== 'win32') {
    return { killed: 0, checked: 0, skipped: 'no aplica fuera de win32 -- HyperFrames ya limpia huérfanos por su cuenta en Linux/macOS.' };
  }
  const padresReales = padrePids.filter((pid) => Number.isInteger(pid) && pid > 0);
  if (padresReales.length === 0) return { killed: 0, checked: 0 };
  try {
    const ps = correr('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='chrome-headless-shell.exe' OR Name='chrome.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
    ]);
    if (ps.status !== 0 || !ps.stdout?.trim()) return { killed: 0, checked: 0 };
    let procesos = JSON.parse(ps.stdout);
    if (!Array.isArray(procesos)) procesos = procesos ? [procesos] : [];
    let killed = 0;
    for (const p of procesos) {
      // REGLA ESTRICTA (corregida tras un bug real detectado en esta misma
      // fase durante pruebas concurrentes reales): solo se mata un proceso
      // Chrome cuyo ParentProcessId sea EXACTAMENTE uno de los PIDs reales
      // que NOSOTROS acabamos de lanzar y que ya terminó (padrePids). Un
      // intento previo de esta función también mataba "huérfanos" cuyo
      // padre no aparecía en la lista de procesos Chrome vivos -- pero el
      // padre real de un chrome-headless-shell.exe es el proceso node.exe
      // de HyperFrames, que NUNCA aparece en esa lista (solo se listan
      // procesos Chrome) -- esa condición era efectivamente SIEMPRE
      // verdadera y mataba renders de Chrome de OTRAS producciones
      // concurrentes todavía en curso (causó fallos reales "Target closed"
      // en pruebas paralelas). Solo el chequeo por padrePids reales es
      // seguro.
      const esNuestroRenderYaTerminado = padresReales.includes(p.ParentProcessId);
      if (!esNuestroRenderYaTerminado) continue;
      const esHeadless = /chrome-headless-shell|--headless/i.test(`${p.CommandLine ?? ''}`);
      if (!esHeadless) continue;
      const r = correr('taskkill.exe', ['/PID', String(p.ProcessId), '/F', '/T']);
      if (r.status === 0) killed += 1;
    }
    return { killed, checked: procesos.length };
  } catch (err) {
    // Mejor-esfuerzo real: un fallo de limpieza nunca debe tumbar un render
    // que sí completó correctamente.
    return { killed: 0, checked: 0, error: err.message };
  }
}

// ---------------------------------------------------------------------
// Concurrencia de workers de HyperFrames (2026-08-25) -- investigación
// real confirmó (ver docs/PROJECT_STATE.md) que HyperFrames decide
// `workerCount` automáticamente a partir de los cores de la máquina
// (hasta 5-6 en este entorno de 16 cores), lanzando un browser Chrome
// COMPLETO por worker en paralelo -- root cause real de la exposición al
// error 0x800700E8 (ERROR_NO_DATA/pipe, carrera de teardown de Mojo bajo
// cierre concurrente de varios browsers). HyperFrames YA soporta un punto
// de control real y nativo para esto -- la variable de entorno
// `PRODUCER_MAX_WORKERS` (ver node_modules/hyperframes/dist/cli.js,
// `fromEnv.concurrency = env("PRODUCER_MAX_WORKERS")`, que alimenta
// directamente `resolveRenderWorkerCount()`). Nunca se toca node_modules
// ni se reimplementa un límite propio -- solo se traduce nuestra propia
// variable, real y documentada para Vida Divina, a la variable nativa que
// HyperFrames ya sabe leer.
export const DEFAULT_HYPERFRAMES_MAX_WORKERS = 2;

/**
 * Resuelve el límite real de workers/browsers concurrentes por render.
 * Nunca lanza sobre un valor inválido -- cae al default conservador real
 * (2), documentado: 1 = máxima estabilidad/menor paralelismo, 2 = default
 * recomendado, 4 = mayor velocidad/mayor consumo de Chrome concurrente.
 *
 * Límite real descubierto en el código de HyperFrames (parallelCoordinator.ts
 * #computeWorkerSizing, `minWorkersForJob = totalFrames >= effectiveMinParallelFrames
 * ? 2 : MIN_WORKERS`): para cualquier composición con suficientes frames
 * (el caso real de toda escena de Vida Divina), HyperFrames aplica un piso
 * DURO de 2 workers sin importar qué se pida -- pedir 1 real se comporta
 * igual que pedir 2. Documentado aquí para que no sea una sorpresa futura;
 * el valor real y alcanzable que reduce la concurrencia "auto" (5-6 en
 * este entorno) es 2, no 1.
 */
export function resolveHyperframesMaxWorkers(rawValue = process.env.HYPERFRAMES_MAX_WORKERS) {
  if (rawValue === undefined || rawValue === null || `${rawValue}`.trim() === '') return DEFAULT_HYPERFRAMES_MAX_WORKERS;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_HYPERFRAMES_MAX_WORKERS;
  return parsed;
}

// Patrones reales de interés para observabilidad mínima (2026-08-25) --
// nunca se captura/loguea todo el stderr indiscriminadamente (ruido real
// en producción); solo estas líneas, si aparecen, tanto en éxito como en
// fallo (antes de esta fase, un render exitoso descartaba su stdout/
// stderr por completo -- si 0x800700E8 aparecía en un render que igual
// terminaba bien, era invisible).
const PATRONES_OBSERVABILIDAD_RENDER = Object.freeze([
  /0x800700E8/i, /ERROR_[A-Z_]+/, /NetworkService/, /Target closed/i, /\bpipe\b/i,
]);

/** Extrae señales reales filtradas (nunca el log completo) de un render ya terminado -- workerCount real usado, cuántos browsers reales se lanzaron, y cualquier línea real que matchee los patrones de interés. */
export function extraerObservabilidadRenderReal({ stdout = '', stderr = '', durationMs = null } = {}) {
  const combinado = `${stdout}\n${stderr}`;
  const workerCountMatch = combinado.match(/"workerCount":\s*(\d+)/);
  const browsersLaunchedMatch = combinado.match(/\[BrowserManager\] Browser launched/g);
  const warnings = [];
  for (const linea of combinado.split('\n')) {
    if (PATRONES_OBSERVABILIDAD_RENDER.some((re) => re.test(linea))) warnings.push(linea.trim());
  }
  return Object.freeze({
    workerCountUsed: workerCountMatch ? Number(workerCountMatch[1]) : null,
    browsersLaunched: browsersLaunchedMatch ? browsersLaunchedMatch.length : 0,
    durationMs,
    warnings: Object.freeze(warnings),
  });
}

/** Loguea (consola real, nunca un archivo nuevo -- esta fase es observabilidad mínima) la observabilidad real de un render, solo si hay algo real que reportar (workerCount conocido o al menos 1 warning real). */
function logObservabilidadRenderReal(etiqueta, obs) {
  if (obs.workerCountUsed === null && obs.warnings.length === 0) return;
  console.log(`[hyperframes-observability] ${etiqueta}`, JSON.stringify(obs));
}

/**
 * Resuelve el entry point real de la CLI de hyperframes instalada como
 * dependencia local (node_modules/hyperframes/bin/hyperframes.mjs) e invoca
 * con `node <entry> ...args` vía spawnSync SIN shell — evita por completo el
 * problema conocido de Windows con "npx" (resuelve a .cmd, y con shell:true
 * los argumentos con espacios se corrompen: Node.js no los escapa
 * automáticamente en modo shell).
 */
export function resolverHyperframesCli() {
  // Resuelto relativo a ESTE archivo (video-production/src/), no al
  // projectDir de la composición -- ahí es donde `npm install` puso
  // node_modules/hyperframes, sin importar dónde se escriba la composición.
  const require = createRequire(import.meta.url);
  return require.resolve('hyperframes/bin/hyperframes.mjs');
}

// Fix ventanas de consola visibles durante el render (2026-08-27, ver
// hideChildProcessConsoleWindows.cjs para el root cause real y por qué
// este es el punto de control correcto -- nunca node_modules). `node
// --require <preload> <hyperframesCli> render ...` precarga el parche
// ANTES de que el bundle de HyperFrames importe child_process, en el
// mismo proceso node.exe real que ya lanzamos con windowsHide:true --
// nunca un proceso ni una consola adicional.
export const HIDE_CONSOLE_PRELOAD = fileURLToPath(new URL('./hideChildProcessConsoleWindows.cjs', import.meta.url));

/** Argumentos reales para invocar la CLI de HyperFrames con las ventanas de consola de sus procesos hijos (ffmpeg/ffprobe) ocultas -- ver HIDE_CONSOLE_PRELOAD. */
export function argsRenderOculto(hyperframesCli, outputPath) {
  return ['--require', HIDE_CONSOLE_PRELOAD, hyperframesCli, 'render', '-f', String(RENDER_FPS), '-o', outputPath];
}

/**
 * Valida un MP4 real con ffprobe -- nunca declara éxito solo porque
 * HyperFrames terminó sin error.
 */
export function validarMp4ConFfprobe(mp4Path, { ffprobeBin = 'ffprobe' } = {}) {
  if (!existsSync(mp4Path)) {
    return { ok: false, error: `el archivo no existe: ${mp4Path}` };
  }
  const r = correr(ffprobeBin, [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-show_entries', 'stream=index,codec_type,codec_name,width,height,r_frame_rate,duration,sample_rate,channels',
    '-of', 'json', mp4Path,
  ]);
  if (r.status !== 0) {
    return { ok: false, error: `ffprobe falló (exit ${r.status}): ${r.stderr}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    return { ok: false, error: `no se pudo parsear la salida de ffprobe: ${e.message}` };
  }
  const video = parsed.streams?.find((s) => s.codec_type === 'video');
  const audio = parsed.streams?.find((s) => s.codec_type === 'audio');
  if (!video) return { ok: false, error: 'ffprobe no encontró ningún stream de video en el MP4.' };
  return {
    ok: true,
    hasVideo: true,
    hasAudio: Boolean(audio),
    width: video.width,
    height: video.height,
    fps: video.r_frame_rate,
    videoDurationSeconds: Number(video.duration ?? parsed.format?.duration),
    audioDurationSeconds: audio ? Number(audio.duration) : null,
    audioCodec: audio?.codec_name ?? null,
    videoCodec: video.codec_name,
    fileSizeBytes: Number(parsed.format?.size),
  };
}

/**
 * Orquesta: escribe la composición, copia los assets reales, invoca
 * `hyperframes render` real (nunca mockeado), valida el resultado con
 * ffprobe real, y devuelve el objeto estructurado del video asset.
 *
 * @param {{
 *   projectDir: string, videoAssetId?: string,
 *   visualProductionPackageId: string|null, productionArtifactId?: string|null,
 *   audioAssetId: string, audioSourcePath: string, audioDurationSeconds: number,
 *   imageAsset: {assetId:string, sourcePath:string}|null,
 *   hookText: string, productTitle: string, productBody: string, ctaText: string, whatsappLabel: string,
 *   voiceoverLines: string[], ffmpegBinDir?: string,
 * }} args
 */
export function renderVisualProductionPackage({
  projectDir, videoAssetId = null, visualProductionPackageId, productionArtifactId = null,
  audioAssetId, audioSourcePath, audioDurationSeconds, imageAsset = null,
  hookText, productTitle, productBody, ctaText, whatsappLabel, voiceoverLines,
  ffmpegBinDir = null, brandColors = DEFAULT_BRAND_COLORS,
}) {
  assertNonEmptyString(audioSourcePath, 'audioSourcePath');
  if (!existsSync(audioSourcePath)) throw new Error(`renderVisualProductionPackage: no existe el Audio Asset real en ${audioSourcePath}.`);

  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, 'assets'), { recursive: true });

  const audioExt = extname(audioSourcePath) || '.wav';
  const audioRelPath = `assets/voiceover${audioExt}`;
  copyFileSync(audioSourcePath, join(projectDir, 'assets', basename(audioRelPath)));

  let imageRelPath = null;
  if (imageAsset) {
    const imgExt = extname(imageAsset.sourcePath) || '.jpg';
    imageRelPath = `assets/product${imgExt}`;
    copyFileSync(imageAsset.sourcePath, join(projectDir, 'assets', basename(imageRelPath)));
  }

  const subtitulos = distribuirSubtitulos(voiceoverLines, audioDurationSeconds);
  const html = construirComposicionHtml({
    hookText, productTitle, productBody, ctaText, whatsappLabel,
    audioRelPath, imageRelPath, durationSeconds: audioDurationSeconds, subtitulos, brandColors,
  });
  writeFileSync(join(projectDir, 'index.html'), html, 'utf8');
  writeFileSync(join(projectDir, 'hyperframes.json'), JSON.stringify({
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
    paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
    media: { autoProxy: true },
  }, null, 2));
  writeFileSync(join(projectDir, 'meta.json'), JSON.stringify({ id: basename(projectDir), name: basename(projectDir), createdAt: new Date().toISOString() }, null, 2));

  const outputPath = join(projectDir, '..', `${basename(projectDir)}.mp4`);
  const env = { ...process.env };
  if (ffmpegBinDir) env.PATH = `${ffmpegBinDir}${process.platform === 'win32' ? ';' : ':'}${env.PATH}`;
  env.PRODUCER_MAX_WORKERS = String(resolveHyperframesMaxWorkers());

  const hyperframesCli = resolverHyperframesCli();
  const inicioRenderMs = Date.now();
  const renderResult = correr(process.execPath, argsRenderOculto(hyperframesCli, outputPath), { cwd: projectDir, env });
  limpiarProcesosHuerfanosChrome({ padrePids: [renderResult.pid] });
  logObservabilidadRenderReal('renderVisualProductionPackage', extraerObservabilidadRenderReal({ stdout: renderResult.stdout, stderr: renderResult.stderr, durationMs: Date.now() - inicioRenderMs }));
  if (renderResult.status !== 0) {
    return {
      videoAssetId, visualProductionPackageId, productionArtifactId, audioAssetId,
      sourceAssetIds: imageAsset ? [imageAsset.assetId] : [],
      outputPath: null, format: RENDER_FORMAT, width: null, height: null, fps: RENDER_FPS,
      duration: null, status: 'ERROR_RENDER', error: renderResult.stderr || renderResult.stdout,
    };
  }

  const probe = validarMp4ConFfprobe(outputPath, ffmpegBinDir ? { ffprobeBin: join(ffmpegBinDir, 'ffprobe.exe') } : {});
  if (!probe.ok || !probe.hasVideo || !probe.hasAudio) {
    return {
      videoAssetId, visualProductionPackageId, productionArtifactId, audioAssetId,
      sourceAssetIds: imageAsset ? [imageAsset.assetId] : [],
      outputPath, format: RENDER_FORMAT, width: null, height: null, fps: RENDER_FPS,
      duration: null, status: 'ERROR_VALIDACION', error: probe.error ?? 'MP4 sin audio o sin video real.',
    };
  }

  const computedId = videoAssetId ?? createHash('sha256').update(JSON.stringify({ visualProductionPackageId, audioAssetId, sourceAssetIds: imageAsset ? [imageAsset.assetId] : [] })).digest('hex');

  return Object.freeze({
    videoAssetId: computedId,
    visualProductionPackageId,
    productionArtifactId,
    audioAssetId,
    sourceAssetIds: Object.freeze(imageAsset ? [imageAsset.assetId] : []),
    outputPath,
    format: RENDER_FORMAT,
    width: probe.width,
    height: probe.height,
    fps: RENDER_FPS,
    duration: probe.videoDurationSeconds,
    status: 'COMPLETADO',
  });
}

// ---------------------------------------------------------------------
// Creative Production Orchestrator (2026-08-24) — render de UNA escena
// real de un Scene Plan (content-orchestrator/src/scenePlanner.js).
// EXTIENDE este archivo (nunca reemplaza construirComposicionHtml()/
// renderVisualProductionPackage(), que siguen intactas y siguen siendo lo
// que usa /api/create hoy) -- una composición de UN solo acto que dura el
// 100% de la duración de la escena, en vez del acto fijo hook/producto/
// cta de 22%/50%/28% de la composición original. Reutiliza el MISMO
// lenguaje visual real (DEFAULT_BRAND_COLORS, escapeHtml,
// assertNoForbiddenProductClaims, distribuirSubtitulos) y el MISMO
// pipeline de render (resolverHyperframesCli/correr/validarMp4ConFfprobe)
// -- ningún concepto nuevo de infraestructura, solo una composición HTML
// más simple, de un acto.

export const SCENE_KINDS = Object.freeze(['CONCEPT', 'PRODUCT', 'CTA']);

/**
 * @param {{sceneKind:string, text:string, ctaWhatsappLabel:?string, imageRelPath:?string, audioRelPath:string, durationSeconds:number, subtitulos:object[], brandColors?:object, captionStyle?:?object, textOverlays?:object[]}} args
 *
 * `captionStyle`/`textOverlays` (Editable Video Project, 2026-08-24):
 * EXTENSIÓN aditiva -- si se omiten (null/[]), el CSS/HTML generado es
 * BYTE-IDÉNTICO al de antes de esta fase (ningún llamador existente
 * cambia de comportamiento). `captionStyle` real (ver captionStyle.js)
 * reemplaza el CSS hardcodeado de `.caption-line`/`.caption-wrap` y
 * habilita resaltado de palabras; `textOverlays` agrega texto en pantalla
 * INDEPENDIENTE de los subtítulos de narración (ej. un dato/badge que no
 * viene de la voz).
 *
 * `onScreenTextVisible` (Fix Editor Hook/Voiceover/Captions, 2026-08-25):
 * EXTENSIÓN aditiva, default `true` (byte-idéntico si se omite) -- oculta
 * SOLO la capa visual del Hook/CTA-headline (`.hook-text`/`.cta-text`),
 * nunca borra `text` (sigue validado/disponible) ni el pill de WhatsApp
 * real en escenas CTA (esa es la acción, no el copy decorativo).
 */
export function construirComposicionEscenaHtml({
  sceneKind, text, ctaWhatsappLabel = null, imageRelPath = null, audioRelPath, durationSeconds, subtitulos,
  brandColors = DEFAULT_BRAND_COLORS, captionStyle = null, textOverlays = [], onScreenTextVisible = true,
}) {
  if (!SCENE_KINDS.includes(sceneKind)) throw new Error(`construirComposicionEscenaHtml: "sceneKind" inválido "${sceneKind}" (válidos: ${SCENE_KINDS.join(', ')}).`);
  assertNonEmptyString(text, 'text');
  assertNonEmptyString(audioRelPath, 'audioRelPath');
  if (!(durationSeconds > 0)) throw new Error('construirComposicionEscenaHtml: "durationSeconds" debe ser > 0.');
  if (sceneKind === 'CTA') assertNonEmptyString(ctaWhatsappLabel, 'ctaWhatsappLabel');
  assertNoForbiddenProductClaims(text, 'text');
  for (const s of subtitulos ?? []) assertNoForbiddenProductClaims(s.texto, 'subtitulo');
  textOverlays.forEach((o, i) => { assertValidTextOverlay(o, i); assertNoForbiddenProductClaims(o.text, `textOverlay[${i}]`); });

  const c = { ...DEFAULT_BRAND_COLORS, ...brandColors };
  const styleReal = captionStyle ? mergeCaptionStyle(captionStyle) : null;
  const captionsJs = (subtitulos ?? [])
    .map((s) => {
      const contenido = styleReal?.highlightWords?.length
        ? `tl.set(text, { innerHTML: ${jsStringLiteral(resaltarPalabrasHtml(s.texto, styleReal.highlightWords, escapeHtml))} }, ${s.start});`
        : `tl.set(text, { innerText: ${jsStringLiteral(s.texto)} }, ${s.start});`;
      return `${contenido}\n            tl.to(text, { opacity: 1, duration: 0.25 }, ${s.start});\n            tl.to(text, { opacity: 0, duration: 0.25 }, ${Math.max(s.start, s.start + s.duration - 0.25).toFixed(3)});`;
    })
    .join('\n            ');

  const overlaysHtml = textOverlays.map((o, i) => `<div id="overlay-${i}" class="text-overlay" style="${OVERLAY_POSICION_CSS[o.position]} font-size:${o.fontSizePx ?? 44}px; color:${o.color ?? '#ffffff'};">${escapeHtml(o.text)}</div>`).join('\n        ');
  const overlaysJs = textOverlays.map((o, i) => {
    const animIn = o.animation === 'pop'
      ? `tl.fromTo('#overlay-${i}', { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.7)' }, ${o.startSeconds});`
      : `tl.fromTo('#overlay-${i}', { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${o.startSeconds});`;
    const animOut = `tl.to('#overlay-${i}', { opacity: 0, duration: 0.25 }, ${Math.max(o.startSeconds, o.startSeconds + o.durationSeconds - 0.25).toFixed(3)});`;
    return `${animIn}\n            ${animOut}`;
  }).join('\n            ');

  const bgGradient = sceneKind === 'CTA'
    ? `radial-gradient(circle at 50% 50%, ${c.ctaBackgroundGradientFrom} 0%, ${c.ctaBackgroundGradientTo} 100%)`
    : `radial-gradient(circle at 50% 35%, ${c.hookBackgroundGradientFrom} 0%, ${c.hookBackgroundGradientTo} 70%)`;

  const cuerpoEscena = sceneKind === 'PRODUCT' && imageRelPath
    ? `<img class="product-photo" src="${escapeHtml(imageRelPath)}" alt="" />`
    : sceneKind === 'CTA'
      ? `<div class="content">${onScreenTextVisible ? `<div class="cta-text">${escapeHtml(text)}</div>` : ''}<div class="whatsapp-pill">${escapeHtml(ctaWhatsappLabel)} →</div></div>`
      : onScreenTextVisible
        ? `<div class="content"><div class="hook-text">${escapeHtml(text)}</div></div>`
        : `<div class="content"></div>`;

  const animacionCuerpo = sceneKind === 'PRODUCT' && imageRelPath
    ? `mainTl.fromTo('.product-photo', { opacity: 0, scale: 1 }, { opacity: 1, duration: 0.4 }, 0);
      mainTl.to('.product-photo', { scale: 1.12, duration: ${durationSeconds}, ease: 'none' }, 0);`
    : `mainTl.fromTo('.content', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0);`;

  return `<!doctype html>
<html lang="es" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>HyperFrames escena — auto-generado por hyperframesRenderer.js</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #12100e; font-family: "Segoe UI", Arial, sans-serif; }
      .scene { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 90px; text-align: center; overflow: hidden; }
      .bg { position: absolute; inset: 0; z-index: 0; background: ${bgGradient}; }
      .content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 36px; }
      .hook-text { font-size: 68px; line-height: 1.15; color: ${c.hookTextColor}; font-weight: 700; max-width: 900px; }
      .product-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
      .cta-text { font-size: 52px; color: ${c.ctaTextColor}; font-weight: 700; max-width: 860px; line-height: 1.3; }
      .whatsapp-pill { margin-top: 20px; padding: 26px 56px; background: ${c.whatsappPillBackground}; border-radius: 60px; color: ${c.whatsappPillText}; font-size: 44px; font-weight: 800; }
      ${styleReal ? construirCssCaption(styleReal) : `.caption-wrap { position: absolute; bottom: 130px; left: 0; right: 0; display: flex; justify-content: center; z-index: 2; }
      .caption-line { color: #fff; font-size: 38px; font-weight: 600; text-align: center; max-width: 920px; background: rgba(0,0,0,0.45); padding: 14px 32px; border-radius: 16px; opacity: 0; }`}
      .text-overlay { position: absolute; z-index: 3; font-weight: 700; text-align: center; max-width: 860px; opacity: 0; text-shadow: 0 2px 8px rgba(0,0,0,0.6); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${durationSeconds}" data-width="1080" data-height="1920">
      <div id="scene-1" class="scene clip" data-start="0" data-duration="${durationSeconds}" data-track-index="1">
        ${sceneKind !== 'PRODUCT' || !imageRelPath ? '<div class="bg"></div>' : ''}
        ${cuerpoEscena}
      </div>

      <div id="captions-comp" data-composition-id="captions" data-start="0" data-duration="${durationSeconds}" data-track-index="2">
        <div class="caption-wrap"><div id="caption-text" class="caption-line"></div></div>
        ${overlaysHtml}
        <script>
          (function () {
            const tl = gsap.timeline({ paused: true });
            const text = document.querySelector('#caption-text');
            ${captionsJs}
            ${overlaysJs}
            window.__timelines = window.__timelines || {};
            window.__timelines['captions'] = tl;
          })();
        </script>
      </div>

      <audio id="voiceover" class="clip" data-start="0" data-duration="${durationSeconds}" data-track-index="0" data-volume="1" src="${escapeHtml(audioRelPath)}"></audio>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const mainTl = gsap.timeline({ paused: true });
      ${animacionCuerpo}
      window.__timelines['main'] = mainTl;
    </script>
  </body>
</html>
`;
}

/**
 * Render real de UNA escena -- misma validación real (ffprobe) que
 * renderVisualProductionPackage(), nunca declara éxito sin video+audio
 * reales en el MP4 resultante.
 *
 * @param {{projectDir:string, sceneKind:string, text:string, ctaWhatsappLabel?:string, imageSourcePath?:string, audioSourcePath:string, durationSeconds:number, subtitulos:object[], ffmpegBinDir?:string, brandColors?:object, captionStyle?:?object, textOverlays?:object[]}} args
 */
export function renderScene({
  projectDir, sceneKind, text, ctaWhatsappLabel = null, imageSourcePath = null, audioSourcePath, durationSeconds,
  subtitulos, ffmpegBinDir = null, brandColors = DEFAULT_BRAND_COLORS, captionStyle = null, textOverlays = [], onScreenTextVisible = true,
}) {
  assertNonEmptyString(audioSourcePath, 'audioSourcePath');
  if (!existsSync(audioSourcePath)) throw new Error(`renderScene: no existe el Audio Asset real en ${audioSourcePath}.`);

  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, 'assets'), { recursive: true });

  const audioExt = extname(audioSourcePath) || '.wav';
  const audioRelPath = `assets/voiceover${audioExt}`;
  copyFileSync(audioSourcePath, join(projectDir, 'assets', basename(audioRelPath)));

  let imageRelPath = null;
  if (imageSourcePath) {
    const imgExt = extname(imageSourcePath) || '.jpg';
    imageRelPath = `assets/scene${imgExt}`;
    copyFileSync(imageSourcePath, join(projectDir, 'assets', basename(imageRelPath)));
  }

  const html = construirComposicionEscenaHtml({
    sceneKind, text, ctaWhatsappLabel, imageRelPath, audioRelPath, durationSeconds, subtitulos, brandColors, captionStyle, textOverlays, onScreenTextVisible,
  });
  writeFileSync(join(projectDir, 'index.html'), html, 'utf8');
  writeFileSync(join(projectDir, 'hyperframes.json'), JSON.stringify({
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
    paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
    media: { autoProxy: true },
  }, null, 2));
  writeFileSync(join(projectDir, 'meta.json'), JSON.stringify({ id: basename(projectDir), name: basename(projectDir), createdAt: new Date().toISOString() }, null, 2));

  const outputPath = join(projectDir, '..', `${basename(projectDir)}.mp4`);
  const env = { ...process.env };
  if (ffmpegBinDir) env.PATH = `${ffmpegBinDir}${process.platform === 'win32' ? ';' : ':'}${env.PATH}`;
  env.PRODUCER_MAX_WORKERS = String(resolveHyperframesMaxWorkers());

  const hyperframesCli = resolverHyperframesCli();
  const inicioRenderMs = Date.now();
  const renderResult = correr(process.execPath, argsRenderOculto(hyperframesCli, outputPath), { cwd: projectDir, env });
  limpiarProcesosHuerfanosChrome({ padrePids: [renderResult.pid] });
  logObservabilidadRenderReal('renderScene', extraerObservabilidadRenderReal({ stdout: renderResult.stdout, stderr: renderResult.stderr, durationMs: Date.now() - inicioRenderMs }));
  if (renderResult.status !== 0) {
    return { outputPath: null, status: 'ERROR_RENDER', error: renderResult.stderr || renderResult.stdout };
  }
  const probe = validarMp4ConFfprobe(outputPath, ffmpegBinDir ? { ffprobeBin: join(ffmpegBinDir, 'ffprobe.exe') } : {});
  if (!probe.ok || !probe.hasVideo || !probe.hasAudio) {
    return { outputPath, status: 'ERROR_VALIDACION', error: probe.error ?? 'MP4 de escena sin audio o sin video real.' };
  }
  return { outputPath, status: 'COMPLETADO', width: probe.width, height: probe.height, duration: probe.videoDurationSeconds };
}

// Margen real de tolerancia entre la duración pedida y la duración real
// medida del WAV recortado -- no exigimos exactitud al sample (el
// re-encode PCM puede rendir una fracción de frame de más), pero SÍ
// exigimos que nunca exceda esta tolerancia (Editable Video Project,
// 2026-08-24: bug real reportado de ruido/voz residual audible después de
// que la escena visual ya terminó).
export const AUDIO_TRIM_TOLERANCE_SECONDS = 0.05;

/** Duración real de un audio (WAV/MP4), medida con ffprobe -- nunca asumida. */
export function medirDuracionAudioReal(audioPath, ffprobeBin = 'ffprobe') {
  const r = correr(ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath]);
  if (r.status !== 0) throw new Error(`medirDuracionAudioReal: ffprobe falló sobre "${audioPath}": ${r.stderr || r.stdout}`);
  const parsed = JSON.parse(r.stdout);
  const dur = Number(parsed.format?.duration);
  if (!Number.isFinite(dur)) throw new Error(`medirDuracionAudioReal: ffprobe no reportó una duración real numérica para "${audioPath}".`);
  return dur;
}

/**
 * Recorta un segmento real de un WAV real (ffmpeg -ss/-t, re-encode PCM
 * simple) -- para el voiceover real de UNA escena, cortado del WAV
 * completo real ya generado por Voice Engine. Nunca inventa audio: si el
 * segmento pedido excede el archivo real, ffmpeg trunca al final real
 * disponible (comportamiento nativo, no se enmascara).
 *
 * BUG REAL CORREGIDO (Editable Video Project, 2026-08-24): HyperFrames
 * muxea el archivo de audio COMPLETO que recibe como fuente del <audio>
 * de la escena -- no lo vuelve a recortar por su cuenta a data-duration.
 * En algunos WAV fuente (sample rate/frame size distinto de 44.1kHz) el
 * primer corte con `-t` puede rendir una duración real ligeramente MAYOR
 * a la pedida, y ese excedente terminaba como ruido/voz residual audible
 * después de que la escena visual ya había terminado. Se corrige aquí, en
 * la fuente (nunca agregando silencio -- eso movería la duración en la
 * dirección contraria al bug real), con un segundo recorte dado sobre el
 * archivo YA cortado si el primero se excedió, y una medición real
 * (ffprobe) que nunca declara éxito sobre un archivo que sigue
 * excediendo la duración pedida.
 */
export function recortarAudioReal(sourcePath, startSeconds, durationSeconds, outputPath, ffmpegBinDir = null) {
  const ffmpegBin = ffmpegBinDir ? join(ffmpegBinDir, 'ffmpeg.exe') : 'ffmpeg';
  const ffprobeBin = ffmpegBinDir ? join(ffmpegBinDir, 'ffprobe.exe') : 'ffprobe';
  const r = correr(ffmpegBin, ['-y', '-i', sourcePath, '-ss', String(startSeconds), '-t', String(durationSeconds), '-acodec', 'pcm_s16le', '-ar', '44100', outputPath]);
  if (r.status !== 0) throw new Error(`recortarAudioReal: ffmpeg falló al recortar "${sourcePath}" [${startSeconds}s, +${durationSeconds}s]: ${r.stderr || r.stdout}`);
  if (!existsSync(outputPath)) throw new Error(`recortarAudioReal: ffmpeg no produjo el archivo real esperado "${outputPath}".`);

  const duracionTrasPrimerCorte = medirDuracionAudioReal(outputPath, ffprobeBin);
  if (duracionTrasPrimerCorte > durationSeconds + AUDIO_TRIM_TOLERANCE_SECONDS) {
    const rutaTemporal = `${outputPath}.retrim.wav`;
    const r2 = correr(ffmpegBin, ['-y', '-i', outputPath, '-t', String(durationSeconds), '-acodec', 'pcm_s16le', '-ar', '44100', rutaTemporal]);
    if (r2.status !== 0) throw new Error(`recortarAudioReal: el segundo recorte real (excedente de ${(duracionTrasPrimerCorte - durationSeconds).toFixed(3)}s detectado) falló: ${r2.stderr || r2.stdout}`);
    copyFileSync(rutaTemporal, outputPath);
    try { rmSync(rutaTemporal, { force: true }); } catch { /* limpieza best-effort */ }
    const duracionFinal = medirDuracionAudioReal(outputPath, ffprobeBin);
    if (duracionFinal > durationSeconds + AUDIO_TRIM_TOLERANCE_SECONDS) {
      throw new Error(`recortarAudioReal: el segmento real sigue excediendo la duración pedida tras el segundo recorte (${duracionFinal}s > ${durationSeconds}s) -- nunca se entrega un audio real más largo de lo pedido.`);
    }
  }

  return outputPath;
}
