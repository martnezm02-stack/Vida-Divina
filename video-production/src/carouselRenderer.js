// carouselRenderer.js — Bloque 2 (Carousel real). Reutiliza el MISMO
// renderer real (HyperFrames) que hyperframesRenderer.js -- NO es un
// renderer paralelo: reutiliza resolverHyperframesCli()/correr() tal
// cual (exportados desde ese archivo) y el mismo mecanismo de escritura de
// proyecto (index.html + hyperframes.json + meta.json). La única extensión
// real es el COMANDO invocado: en vez de `render` (video+audio -> MP4),
// usa `snapshot` (composición estática -> PNG real, vía Chrome headless
// real de HyperFrames) -- exactamente la misma tecnología de composición
// HTML, sin audio ni timeline animado, para producir un still de un slide
// de carrusel.
//
// REGLA CENTRAL: este archivo NUNCA escribe copy nuevo ni fabrica una
// fotografía de producto -- todo headline/body/cta llega ya resuelto
// (carouselCompositor.js, content-orchestrator), y `backgroundImageRelPath`
// solo puede ser una fotografía RAW real ya copiada al proyecto.

import { mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { correr, resolverHyperframesCli, assertNoForbiddenProductClaims } from './hyperframesRenderer.js';
import { assertBrandAvoidCompliance, BRAND_COLORS } from '../../content-orchestrator/src/brandVisualSystem.js';

export const CAROUSEL_SLIDE_WIDTH = 1080;
export const CAROUSEL_SLIDE_HEIGHT = 1350; // 4:5, formato recomendado para Instagram Feed Carousel (ver ASPECT_RATIOS_BY_ASSET_TYPE en creative-intelligence/production/visualProductionPackage.js).

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function assertNonEmptyString(value, fieldName) {
  if (!value?.trim()) throw new Error(`carouselRenderer: "${fieldName}" es obligatorio.`);
}

/** Lee width/height reales de un PNG (chunk IHDR, bytes 16-24, big-endian) -- sin librerías de imagen, mismo espíritu que assetRegistry.js#leerDimensionesJpeg pero para el formato real que produce `hyperframes snapshot` (PNG). */
export function leerDimensionesPng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error('leerDimensionesPng: el archivo no empieza con la firma PNG -- no es un PNG real.');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// Elemento botánico sutil, determinista (no generado por IA) -- una hoja
// simple en SVG inline, usando la paleta de marca. Decorativo, baja
// opacidad, nunca contiene texto.
function svgHoja({ color = BRAND_COLORS.oliveGreen, opacity = 0.16, x = 0, y = 0, scale = 1, rotate = 0 } = {}) {
  return `<g transform="translate(${x},${y}) rotate(${rotate}) scale(${scale})" opacity="${opacity}">
    <path d="M0,120 C10,60 60,0 130,0 C120,60 90,110 0,120 Z" fill="${color}" />
  </g>`;
}

/**
 * Construye el HTML estático de UN slide de carrusel -- sin audio, sin
 * animación de timeline (solo un frame real). Registra `window.__timelines`
 * (paused, vacío) para satisfacer el mismo contrato HyperFrame que
 * construirComposicionHtml() ya cumple -- evita el warning de StaticGuard.
 *
 * @param {{
 *   headline: string, body: string|null, cta: string|null,
 *   backgroundImageRelPath: string|null, slideIndex: number, totalSlides: number,
 *   showNumbering?: boolean, brandColors?: object,
 * }} args
 */
export function construirComposicionSlideHtml({ headline, body = null, cta = null, backgroundImageRelPath = null, slideIndex, totalSlides, showNumbering = true, brandColors = BRAND_COLORS }) {
  assertNonEmptyString(headline, 'headline');
  if (!(Number.isInteger(slideIndex) && slideIndex >= 1)) throw new Error('carouselRenderer: "slideIndex" debe ser un entero >= 1.');
  if (!(Number.isInteger(totalSlides) && totalSlides >= slideIndex)) throw new Error('carouselRenderer: "totalSlides" debe ser un entero >= slideIndex.');

  for (const [k, v] of Object.entries({ headline, body, cta })) assertNoForbiddenProductClaims(v, k);
  const textoCombinado = [headline, body, cta].filter(Boolean).join(' \n ');
  if (textoCombinado.trim()) assertBrandAvoidCompliance(textoCombinado, 'carouselRenderer: slide combinado');

  const c = brandColors;
  const overlay = backgroundImageRelPath ? `linear-gradient(180deg, rgba(14,30,17,0.35) 0%, rgba(14,30,17,0.78) 100%)` : `radial-gradient(circle at 50% 30%, ${c.oliveGreen} 0%, ${c.forestGreen} 75%)`;

  return `<!doctype html>
<html lang="es" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${CAROUSEL_SLIDE_WIDTH}, height=${CAROUSEL_SLIDE_HEIGHT}" />
    <title>HyperFrames carousel slide — auto-generado por carouselRenderer.js</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${CAROUSEL_SLIDE_WIDTH}px; height: ${CAROUSEL_SLIDE_HEIGHT}px; overflow: hidden; background: ${c.forestGreen}; font-family: "Segoe UI", Arial, sans-serif; }
      .scene { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 88px 76px; text-align: center; }
      .bg { position: absolute; inset: 0; z-index: 0; background: ${overlay}; }
      .bg-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1; }
      .botanicals { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
      .content { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 32px; }
      .headline { font-size: 58px; line-height: 1.18; color: ${c.warmCream}; font-weight: 800; max-width: 880px; }
      .body-text { font-size: 34px; line-height: 1.4; color: ${c.warmCream}; font-weight: 400; max-width: 820px; opacity: 0.92; }
      .cta-pill { margin-top: 12px; padding: 24px 50px; background: ${c.warmGold}; border-radius: 60px; color: ${c.softBlack}; font-size: 38px; font-weight: 800; }
      .numbering { position: absolute; top: 56px; right: 56px; z-index: 2; color: ${c.warmCream}; font-size: 30px; font-weight: 700; opacity: 0.85; background: rgba(0,0,0,0.25); padding: 10px 22px; border-radius: 30px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="${CAROUSEL_SLIDE_WIDTH}" data-height="${CAROUSEL_SLIDE_HEIGHT}">
      <div id="scene-1" class="scene clip" data-start="0" data-duration="1" data-track-index="1">
        <div class="bg"></div>
        ${backgroundImageRelPath ? `<img class="bg-photo" src="${escapeHtml(backgroundImageRelPath)}" alt="" />` : ''}
        <svg class="botanicals" viewBox="0 0 ${CAROUSEL_SLIDE_WIDTH} ${CAROUSEL_SLIDE_HEIGHT}">
          ${svgHoja({ color: c.warmGold, x: -20, y: CAROUSEL_SLIDE_HEIGHT - 160, rotate: -18, scale: 1.1 })}
          ${svgHoja({ color: c.oliveGreen, x: CAROUSEL_SLIDE_WIDTH - 110, y: 40, rotate: 150, scale: 0.9 })}
        </svg>
        ${showNumbering ? `<div class="numbering">${slideIndex}/${totalSlides}</div>` : ''}
        <div class="content">
          <div class="headline">${escapeHtml(headline)}</div>
          ${body ? `<div class="body-text">${escapeHtml(body)}</div>` : ''}
          ${cta ? `<div class="cta-pill">${escapeHtml(cta)}</div>` : ''}
        </div>
      </div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines['main'] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
}

/**
 * Renderiza UN slide real: escribe el proyecto HyperFrames estático y
 * captura un PNG real vía `hyperframes snapshot` (mismo CLI real que
 * `hyperframes render` usa para video -- nunca fabricado, nunca mockeado).
 *
 * @param {{
 *   projectDir: string, slideIndex: number, totalSlides: number,
 *   headline: string, body?: string|null, cta?: string|null,
 *   backgroundImageSourcePath?: string|null, brandColors?: object,
 * }} args
 * @returns {{ outputPath: string|null, width: number|null, height: number|null, status: 'COMPLETADO'|'ERROR_RENDER'|'ERROR_VALIDACION', error?: string }}
 */
export function renderCarouselSlide({ projectDir, slideIndex, totalSlides, headline, body = null, cta = null, backgroundImageSourcePath = null, brandColors = BRAND_COLORS }) {
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, 'assets'), { recursive: true });

  let backgroundImageRelPath = null;
  if (backgroundImageSourcePath) {
    if (!existsSync(backgroundImageSourcePath)) throw new Error(`renderCarouselSlide: no existe la fotografía real en ${backgroundImageSourcePath}.`);
    const ext = extname(backgroundImageSourcePath) || '.jpg';
    backgroundImageRelPath = `assets/product${ext}`;
    copyFileSync(backgroundImageSourcePath, join(projectDir, 'assets', basename(backgroundImageRelPath)));
  }

  const html = construirComposicionSlideHtml({ headline, body, cta, backgroundImageRelPath, slideIndex, totalSlides, brandColors });
  writeFileSync(join(projectDir, 'index.html'), html, 'utf8');
  writeFileSync(join(projectDir, 'hyperframes.json'), JSON.stringify({
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
    paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
    media: { autoProxy: true },
  }, null, 2));
  writeFileSync(join(projectDir, 'meta.json'), JSON.stringify({ id: basename(projectDir), name: basename(projectDir), createdAt: new Date().toISOString() }, null, 2));

  const snapshotsDir = join(projectDir, 'snapshots');
  const hyperframesCli = resolverHyperframesCli();
  const result = correr(process.execPath, [hyperframesCli, 'snapshot', projectDir, '--at', '0', '--no-end', '--frames', '1', '-o', snapshotsDir]);
  if (result.status !== 0) {
    return { outputPath: null, width: null, height: null, status: 'ERROR_RENDER', error: result.stderr || result.stdout };
  }

  const outputPath = join(snapshotsDir, 'frame-00-at-0s.png');
  if (!existsSync(outputPath)) {
    return { outputPath: null, width: null, height: null, status: 'ERROR_VALIDACION', error: `carouselRenderer: hyperframes snapshot terminó sin error pero no escribió ${outputPath}.` };
  }

  let width;
  let height;
  try {
    ({ width, height } = leerDimensionesPng(readFileSync(outputPath)));
  } catch (err) {
    return { outputPath, width: null, height: null, status: 'ERROR_VALIDACION', error: err.message };
  }
  if (width !== CAROUSEL_SLIDE_WIDTH || height !== CAROUSEL_SLIDE_HEIGHT) {
    return { outputPath, width, height, status: 'ERROR_VALIDACION', error: `carouselRenderer: dimensiones reales ${width}x${height} no coinciden con ${CAROUSEL_SLIDE_WIDTH}x${CAROUSEL_SLIDE_HEIGHT}.` };
  }

  const assetId = createHash('sha256').update(readFileSync(outputPath)).digest('hex');
  return { outputPath, width, height, status: 'COMPLETADO', assetId };
}

/**
 * Renderiza TODOS los slides reales de un carrusel, uno por uno -- cada
 * slide es un subdirectorio propio de `projectDir` (nunca comparten
 * proyecto, para que un fallo de un slide no invalide los demás ya
 * renderizados). No detiene el resto si un slide individual falla --
 * cada resultado se reporta con su propio status.
 *
 * @param {{ projectDir: string, slides: Array<{headline:string, body?:string|null, cta?:string|null, backgroundImageSourcePath?:string|null}>, brandColors?: object }} args
 */
export function renderCarousel({ projectDir, slides, brandColors = BRAND_COLORS }) {
  if (!Array.isArray(slides) || slides.length === 0) throw new Error('renderCarousel: "slides" debe ser un arreglo no vacío.');
  const totalSlides = slides.length;
  return slides.map((slide, i) => {
    const slideIndex = i + 1;
    const slideDir = join(projectDir, `slide-${String(slideIndex).padStart(2, '0')}`);
    const resultado = renderCarouselSlide({ projectDir: slideDir, slideIndex, totalSlides, brandColors, ...slide });
    return { slideIndex, totalSlides, ...resultado };
  });
}
