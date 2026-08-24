import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  distribuirSubtitulos, construirComposicionHtml, validarMp4ConFfprobe,
  renderVisualProductionPackage, assertNoForbiddenProductClaims, FORBIDDEN_PRODUCT_CLAIMS,
  RENDER_FPS, RENDER_FORMAT,
} from '../src/hyperframesRenderer.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';
const CC_A1_A_REAL_MP4 = 'C:\\Users\\manue\\Vida Divina\\video-production\\output-cc-a1-a.mp4';

function crearWavSilencioBuffer(duracionSegundos, sampleRate = 24000) {
  const numSamples = Math.round(duracionSegundos * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

describe('distribuirSubtitulos — reparto proporcional real, nunca reordena ni reescribe', () => {
  test('reparte proporcionalmente por número de palabras y cubre la duración total', () => {
    const lineas = ['Hola mundo', 'Esto es una línea más larga de prueba'];
    const segs = distribuirSubtitulos(lineas, 10);
    assert.equal(segs.length, 2);
    assert.equal(segs[0].texto, 'Hola mundo');
    assert.equal(segs[1].texto, 'Esto es una línea más larga de prueba');
    const sumaDur = segs.reduce((a, s) => a + s.duration, 0);
    assert.ok(Math.abs(sumaDur - 10) < 0.01);
    assert.equal(segs[0].start, 0);
  });

  test('rechaza duración <= 0', () => {
    assert.throws(() => distribuirSubtitulos(['x'], 0));
  });
});

describe('assertNoForbiddenProductClaims', () => {
  test('rechaza cada uno de los claims prohibidos de la Parte 8', () => {
    for (const claim of FORBIDDEN_PRODUCT_CLAIMS) {
      assert.throws(() => assertNoForbiddenProductClaims(`texto que dice ${claim} aquí`, 'campo'), /claim prohibido/);
    }
  });

  test('acepta texto seguro real', () => {
    assert.equal(assertNoForbiddenProductClaims('Té Divina, parte del catálogo de Vida Divina.', 'campo'), true);
  });

  test('NO bloquea "desintoxicación" (sustantivo real y aprobado en el catálogo de TéDivina) aunque contenga "desintoxica" como substring', () => {
    assert.equal(assertNoForbiddenProductClaims('TéDivina promueve la desintoxicación natural.', 'campo'), true);
  });

  test('NO bloquea "tratamiento" (usado en disclaimers reales) aunque contenga "trata" como substring', () => {
    assert.equal(assertNoForbiddenProductClaims('Esto no es un tratamiento, es un complemento de hábitos.', 'campo'), true);
  });

  test('sigue rechazando la forma imperativa real "desintoxica" y el verbo real "trata"', () => {
    assert.throws(() => assertNoForbiddenProductClaims('Desintoxica tu cuerpo ya.', 'campo'), /claim prohibido/);
    assert.throws(() => assertNoForbiddenProductClaims('Este té trata el estreñimiento.', 'campo'), /claim prohibido/);
  });
});

describe('construirComposicionHtml — preserva CTA y voiceover literalmente', () => {
  test('el HTML generado contiene el hook/CTA/whatsapp exactos, sin reescribir', () => {
    const subtitulos = distribuirSubtitulos(['Hola.', 'Escríbenos por WhatsApp.'], 5);
    const html = construirComposicionHtml({
      hookText: '¿Sabías que tu café puede aportar más que solo energía?',
      productTitle: 'Café Divina Tongkat Ali',
      productBody: 'Combina Reishi, Tongkat Ali y café arábico.',
      ctaText: 'Escríbenos por WhatsApp y te contamos cómo incluirlo en tu rutina.',
      whatsappLabel: 'WhatsApp',
      audioRelPath: 'assets/voiceover.wav',
      imageRelPath: null,
      durationSeconds: 5,
      subtitulos,
    });
    assert.match(html, /¿Sabías que tu café puede aportar más que solo energía\?/);
    assert.match(html, /Café Divina Tongkat Ali/);
    assert.match(html, /Escríbenos por WhatsApp y te contamos cómo incluirlo en tu rutina\./);
    assert.match(html, /data-composition-id="main"/);
    assert.match(html, /src="assets\/voiceover\.wav"/);
  });

  test('rechaza si algún campo de texto contiene un claim prohibido', () => {
    assert.throws(() => construirComposicionHtml({
      hookText: 'Esto desintoxica tu cuerpo',
      productTitle: 'x', productBody: 'x', ctaText: 'x', whatsappLabel: 'x',
      audioRelPath: 'assets/voiceover.wav', imageRelPath: null, durationSeconds: 5,
      subtitulos: distribuirSubtitulos(['x'], 5),
    }), /claim prohibido/);
  });

  test('usa fotografía real (img) cuando se provee imageRelPath, nunca fabrica un lockup', () => {
    const html = construirComposicionHtml({
      hookText: 'Hook', productTitle: 'Té Divina', productBody: 'x', ctaText: 'CTA', whatsappLabel: 'WhatsApp',
      audioRelPath: 'assets/voiceover.wav', imageRelPath: 'assets/product.jpeg', durationSeconds: 5,
      subtitulos: distribuirSubtitulos(['Hook', 'CTA'], 5),
    });
    assert.match(html, /<img class="product-photo" src="assets\/product\.jpeg"/);
  });
});

describe('validarMp4ConFfprobe — sobre el MP4 real ya generado (CC-A1-A)', () => {
  test('valida el MP4 real: video+audio, 1080x1920, 30fps', (t) => {
    if (!existsSync(CC_A1_A_REAL_MP4)) {
      t.skip('output-cc-a1-a.mp4 no existe todavía en este entorno (renderizar primero).');
      return;
    }
    const probe = validarMp4ConFfprobe(CC_A1_A_REAL_MP4, { ffprobeBin: join(FFMPEG_BIN_DIR, 'ffprobe.exe') });
    assert.equal(probe.ok, true);
    assert.equal(probe.hasVideo, true);
    assert.equal(probe.hasAudio, true);
    assert.equal(probe.width, 1080);
    assert.equal(probe.height, 1920);
    assert.equal(probe.fps, '30/1');
    assert.ok(probe.videoDurationSeconds > 15 && probe.videoDurationSeconds < 16);
  });

  test('reporta ok:false si el archivo no existe', () => {
    const probe = validarMp4ConFfprobe('C:/no/existe.mp4', { ffprobeBin: join(FFMPEG_BIN_DIR, 'ffprobe.exe') });
    assert.equal(probe.ok, false);
  });
});

describe('renderVisualProductionPackage — render REAL, sin mock (sintético y corto para velocidad)', () => {
  test('produce un MP4 real, válido, con el metadata estructurado correcto', async (t) => {
    let tmpAudio;
    let projectDir;
    try {
      tmpAudio = join(mkdtempSync(join(tmpdir(), 'hf-test-')), 'voz.wav');
      writeFileSync(tmpAudio, crearWavSilencioBuffer(3.0, 24000));
      projectDir = join(tmpdir(), `hf-render-test-${Date.now()}`);

      const resultado = await renderVisualProductionPackage({
        projectDir,
        visualProductionPackageId: 'test-vpp-id',
        productionArtifactId: 'test-pa-id',
        audioAssetId: 'test-audio-id',
        audioSourcePath: tmpAudio,
        audioDurationSeconds: 3.0,
        imageAsset: null,
        hookText: 'Hook de prueba real', productTitle: 'Producto de prueba', productBody: 'Cuerpo de prueba',
        ctaText: 'CTA de prueba', whatsappLabel: 'WhatsApp',
        voiceoverLines: ['Hook de prueba real.', 'CTA de prueba.'],
        ffmpegBinDir: FFMPEG_BIN_DIR,
      });

      assert.equal(resultado.status, 'COMPLETADO');
      assert.equal(resultado.format, RENDER_FORMAT);
      assert.equal(resultado.fps, RENDER_FPS);
      assert.equal(resultado.width, 1080);
      assert.equal(resultado.height, 1920);
      assert.ok(resultado.duration > 2.5 && resultado.duration < 3.6);
      assert.equal(resultado.visualProductionPackageId, 'test-vpp-id');
      assert.equal(resultado.audioAssetId, 'test-audio-id');
      assert.ok(existsSync(resultado.outputPath));
      assert.match(resultado.videoAssetId, /^[0-9a-f]{64}$/);
    } finally {
      if (projectDir) rmSync(projectDir, { recursive: true, force: true });
      if (projectDir) rmSync(`${projectDir}.mp4`, { force: true });
    }
  });

  test('lanza (no fabrica un resultado) si el Audio Asset no existe', () => {
    // renderVisualProductionPackage es síncrona (spawnSync internamente) --
    // no async, por eso assert.throws en vez de assert.rejects.
    assert.throws(
      () => renderVisualProductionPackage({
        projectDir: join(tmpdir(), `hf-render-missing-${Date.now()}`),
        visualProductionPackageId: 'x', audioAssetId: 'x', audioSourcePath: 'C:/no/existe.wav', audioDurationSeconds: 5,
        hookText: 'x', productTitle: 'x', productBody: 'x', ctaText: 'x', whatsappLabel: 'x', voiceoverLines: ['x'],
      }),
      /no existe el Audio Asset real/
    );
  });
});

describe('renderer no modifica Creative Intelligence', () => {
  test('este módulo no importa nada de creative-intelligence/', async () => {
    const fs = await import('node:fs');
    const contenido = fs.readFileSync(new URL('../src/hyperframesRenderer.js', import.meta.url), 'utf8');
    assert.ok(!contenido.includes('creative-intelligence'), 'hyperframesRenderer.js no debe importar creative-intelligence/');
  });
});
