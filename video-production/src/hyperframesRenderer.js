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

export function correr(cmd, args, opts) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
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

  const hyperframesCli = resolverHyperframesCli();
  const renderResult = correr(process.execPath, [hyperframesCli, 'render', '-f', String(RENDER_FPS), '-o', outputPath], { cwd: projectDir, env });
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
