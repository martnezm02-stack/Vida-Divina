// sceneRenderer.test.js — Creative Production Orchestrator (2026-08-24):
// construirComposicionEscenaHtml() / renderScene() / recortarAudioReal(),
// EXTENSIÓN de hyperframesRenderer.js (construirComposicionHtml() /
// renderVisualProductionPackage() siguen intactas, ver
// hyperframesRenderer.test.js, sin tocar).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  construirComposicionEscenaHtml, renderScene, recortarAudioReal, validarMp4ConFfprobe, SCENE_KINDS,
  medirDuracionAudioReal, limpiarProcesosHuerfanosChrome, AUDIO_TRIM_TOLERANCE_SECONDS,
} from '../src/hyperframesRenderer.js';

const FFMPEG_BIN_DIR = 'C:\\Users\\manue\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin';

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

describe('construirComposicionEscenaHtml — validación real', () => {
  test('rechaza sceneKind inválido', () => {
    assert.throws(() => construirComposicionEscenaHtml({
      sceneKind: 'INVENTADO', text: 'x', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [],
    }), /sceneKind/);
  });

  test('CTA sin ctaWhatsappLabel real lanza', () => {
    assert.throws(() => construirComposicionEscenaHtml({
      sceneKind: 'CTA', text: 'Escríbenos', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [],
    }), /ctaWhatsappLabel/);
  });

  test('un claim prohibido real en el texto de la escena se rechaza', () => {
    assert.throws(() => construirComposicionEscenaHtml({
      sceneKind: 'CONCEPT', text: 'esto cura todo', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [],
    }), /claim/i);
  });

  test('SCENE_KINDS expone los 3 tipos reales', () => {
    assert.deepEqual([...SCENE_KINDS], ['CONCEPT', 'PRODUCT', 'CTA']);
  });

  test('sin captionStyle/textOverlays (Editable Video Project), el HTML generado es byte-idéntico al de antes de esta fase', () => {
    const args = { sceneKind: 'CONCEPT', text: 'vitalidad real', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [{ texto: 'vitalidad real', start: 0, duration: 3 }] };
    const html1 = construirComposicionEscenaHtml(args);
    const html2 = construirComposicionEscenaHtml({ ...args, captionStyle: null, textOverlays: [] });
    assert.equal(html1, html2);
    assert.ok(html1.includes('.caption-line { color: #fff; font-size: 38px'));
  });

  test('un captionStyle real reemplaza el CSS de captions y habilita resaltado de palabras', () => {
    const html = construirComposicionEscenaHtml({
      sceneKind: 'CONCEPT', text: 'x', audioRelPath: 'a.wav', durationSeconds: 3,
      subtitulos: [{ texto: 'Reishi real de verdad', start: 0, duration: 3 }],
      captionStyle: { fontSizePx: 60, textColor: '#00ff00', position: 'top', highlightWords: ['Reishi'] },
    });
    assert.ok(html.includes('font-size: 60px'));
    assert.ok(html.includes('color: #00ff00'));
    assert.ok(html.includes('top: 140px'));
    assert.ok(html.includes('<span class=\\"hl\\">Reishi</span>'));
  });

  test('textOverlays reales se renderizan como elementos independientes de las captions de narración', () => {
    const html = construirComposicionEscenaHtml({
      sceneKind: 'CONCEPT', text: 'x', audioRelPath: 'a.wav', durationSeconds: 5, subtitulos: [],
      textOverlays: [{ text: '70% OFF', position: 'top-right', startSeconds: 1, durationSeconds: 2 }],
    });
    assert.ok(html.includes('id="overlay-0"'));
    assert.ok(html.includes('70% OFF'));
    assert.ok(html.includes('text-overlay'));
  });

  test('un textOverlay real con un claim prohibido se rechaza', () => {
    assert.throws(() => construirComposicionEscenaHtml({
      sceneKind: 'CONCEPT', text: 'x', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [],
      textOverlays: [{ text: 'esto cura todo', position: 'top', startSeconds: 0, durationSeconds: 1 }],
    }), /claim/i);
  });

  // Fix Editor Hook/Voiceover/Captions (2026-08-25) -- Problema 1 (UI
  // "Mostrar texto en pantalla") aplicado al Hook/CTA-headline.
  describe('onScreenTextVisible -- oculta SOLO la capa visual del Hook/CTA-headline, nunca borra el dato', () => {
    test('default (omitido) es byte-idéntico al HTML de antes de esta fase', () => {
      const args = { sceneKind: 'CONCEPT', text: 'vitalidad real', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [] };
      assert.equal(construirComposicionEscenaHtml(args), construirComposicionEscenaHtml({ ...args, onScreenTextVisible: true }));
    });

    test('onScreenTextVisible:false oculta el hook-text en una escena CONCEPT (pero mantiene el contenedor .content para la animación)', () => {
      const html = construirComposicionEscenaHtml({
        sceneKind: 'CONCEPT', text: 'Texto que no debe verse', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [], onScreenTextVisible: false,
      });
      assert.ok(!html.includes('<div class="hook-text">')); // sin el ELEMENTO -- la regla CSS ".hook-text{...}" sigue en <style>, eso es esperado.
      assert.ok(!html.includes('Texto que no debe verse'));
      assert.ok(html.includes('<div class="content"></div>'));
    });

    test('onScreenTextVisible:false en CTA oculta el cta-text pero MANTIENE el pill de WhatsApp real (la acción, no el copy decorativo)', () => {
      const html = construirComposicionEscenaHtml({
        sceneKind: 'CTA', text: 'Copy de CTA que no debe verse', ctaWhatsappLabel: 'WhatsApp', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [], onScreenTextVisible: false,
      });
      assert.ok(!html.includes('<div class="cta-text">'));
      assert.ok(!html.includes('Copy de CTA que no debe verse'));
      assert.ok(html.includes('whatsapp-pill'));
      assert.ok(html.includes('WhatsApp'));
    });

    test('sigue validando "text" aunque esté oculto (el dato real nunca deja de existir/validarse)', () => {
      assert.throws(() => construirComposicionEscenaHtml({
        sceneKind: 'CONCEPT', text: 'esto cura todo', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [], onScreenTextVisible: false,
      }), /claim/i);
    });
  });

  describe('captionStyle extendido (Problema 3) -- outline/shadow/alignment se traducen a CSS real', () => {
    test('outlineWidthPx > 0 agrega -webkit-text-stroke real', () => {
      const html = construirComposicionEscenaHtml({
        sceneKind: 'CONCEPT', text: 'x', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [{ texto: 'x', start: 0, duration: 3 }],
        captionStyle: { outlineColor: '#ff0000', outlineWidthPx: 4 },
      });
      assert.ok(html.includes('-webkit-text-stroke: 4px #ff0000'));
    });

    test('shadow:true agrega text-shadow real', () => {
      const html = construirComposicionEscenaHtml({
        sceneKind: 'CONCEPT', text: 'x', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [{ texto: 'x', start: 0, duration: 3 }],
        captionStyle: { shadow: true },
      });
      assert.ok(html.includes('text-shadow'));
    });

    test('alignment real se traduce a text-align', () => {
      const html = construirComposicionEscenaHtml({
        sceneKind: 'CONCEPT', text: 'x', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [{ texto: 'x', start: 0, duration: 3 }],
        captionStyle: { alignment: 'left' },
      });
      assert.ok(html.includes('text-align: left'));
    });

    test('un preset real (Bold) se puede pasar directamente como captionStyle', () => {
      const html = construirComposicionEscenaHtml({
        sceneKind: 'CONCEPT', text: 'x', audioRelPath: 'a.wav', durationSeconds: 3, subtitulos: [{ texto: 'x', start: 0, duration: 3 }],
        captionStyle: { fontSizePx: 52, fontWeight: 800, outlineWidthPx: 3, shadow: true },
      });
      assert.ok(html.includes('font-size: 52px'));
      assert.ok(html.includes('font-weight: 800'));
    });
  });
});

describe('renderScene — render REAL de una escena (sin mock)', () => {
  test('produce un MP4 real, válido, tipo CONCEPT (sin imagen, tratamiento tipográfico)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'co-scene-render-'));
    const audioPath = join(tmp, 'voice.wav');
    writeFileSync(audioPath, crearWavSilencioBuffer(3));
    const projectDir = join(tmp, 'scene-1', 'proj');
    const result = renderScene({
      projectDir, sceneKind: 'CONCEPT', text: 'vitalidad y confianza masculina',
      audioSourcePath: audioPath, durationSeconds: 3,
      subtitulos: [{ texto: 'vitalidad y confianza masculina', start: 0, duration: 3 }],
      ffmpegBinDir: FFMPEG_BIN_DIR,
    });
    assert.equal(result.status, 'COMPLETADO');
    assert.ok(existsSync(result.outputPath));
    const probe = validarMp4ConFfprobe(result.outputPath, { ffprobeBin: join(FFMPEG_BIN_DIR, 'ffprobe.exe') });
    assert.ok(probe.ok);
    assert.ok(probe.hasVideo);
    assert.ok(probe.hasAudio);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('sin audioSourcePath real lanza, nunca renderiza sin audio', () => {
    assert.throws(() => renderScene({
      projectDir: join(tmpdir(), 'co-scene-missing'), sceneKind: 'CTA', text: 'x', ctaWhatsappLabel: 'WhatsApp',
      audioSourcePath: 'C:/no/existe.wav', durationSeconds: 3, subtitulos: [],
    }), /Audio Asset real/);
  });
});

describe('recortarAudioReal — corte real de un WAV real', () => {
  test('produce un segmento real con la duración real pedida (leída del header WAV real, nunca asumida)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'co-audio-slice-'));
    const sourcePath = join(tmp, 'full.wav');
    writeFileSync(sourcePath, crearWavSilencioBuffer(9));
    const outputPath = join(tmp, 'segment.wav');
    recortarAudioReal(sourcePath, 2, 3, outputPath, FFMPEG_BIN_DIR);
    assert.ok(existsSync(outputPath));
    assert.ok(statSync(outputPath).size > 0);
    // Duración real leída del propio WAV de salida (44.1kHz, 16-bit, mono -- ver recortarAudioReal): 3s reales -> 3 * 44100 * 2 bytes de datos + 44 de header.
    const dataSizeEsperado = 3 * 44100 * 2;
    assert.ok(Math.abs(statSync(outputPath).size - 44 - dataSizeEsperado) < 4410); // margen real ~0.05s por redondeo de ffmpeg.
    rmSync(tmp, { recursive: true, force: true });
  });

  test('sobre un archivo real inexistente, lanza real (ffmpeg falla), nunca inventa un segmento', () => {
    assert.throws(() => recortarAudioReal('C:/no/existe.wav', 0, 2, join(tmpdir(), 'nunca.wav'), FFMPEG_BIN_DIR), /ffmpeg falló/);
  });

  test('invariante real (Editable Video Project, bug de ruido residual): audioDuration <= intendedSceneDuration, siempre, con margen real de tolerancia', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'co-audio-invariant-'));
    const sourcePath = join(tmp, 'full.wav');
    // WAV fuente a 24kHz (mismo sample rate real que produce Voice Engine) --
    // el caso real donde el primer corte con -t puede rendir un excedente,
    // ver comentario de recortarAudioReal().
    writeFileSync(sourcePath, crearWavSilencioBuffer(12, 24000));
    const intendedSceneDuration = 4.78; // duración real no-entera, como las que ya produce scenePlanner.js reescalado.
    const outputPath = join(tmp, 'segment.wav');
    recortarAudioReal(sourcePath, 1.23, intendedSceneDuration, outputPath, FFMPEG_BIN_DIR);
    const duracionReal = medirDuracionAudioReal(outputPath, join(FFMPEG_BIN_DIR, 'ffprobe.exe'));
    assert.ok(
      duracionReal <= intendedSceneDuration + AUDIO_TRIM_TOLERANCE_SECONDS,
      `audioDuration (${duracionReal}s) excede intendedSceneDuration (${intendedSceneDuration}s) más allá del margen real -- este es exactamente el bug real de ruido residual reportado.`,
    );
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('limpiarProcesosHuerfanosChrome — limpieza de procesos huérfanos (Windows, best-effort)', () => {
  test('nunca lanza, y en win32 devuelve un resultado real con "checked"/"killed" numéricos', () => {
    const resultado = limpiarProcesosHuerfanosChrome({ padrePids: [999999999] });
    assert.equal(typeof resultado, 'object');
    if (process.platform === 'win32') {
      assert.equal(typeof resultado.killed, 'number');
      assert.equal(typeof resultado.checked, 'number');
    } else {
      assert.equal(resultado.killed, 0);
    }
  });
});
