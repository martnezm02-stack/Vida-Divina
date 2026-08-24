import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderAndPostProduce, visualProductionPackageToRenderArgs, productionBriefToRenderArgs, dividirEnFrases, MASTER_OUTPUT_PROFILE,
} from '../src/contentOrchestrator.js';

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

describe('MASTER_OUTPUT_PROFILE', () => {
  test('es GENERIC_VERTICAL — el aspect ratio nativo del compositor HyperFrames de este proyecto', () => {
    assert.equal(MASTER_OUTPUT_PROFILE, 'GENERIC_VERTICAL');
  });
});

describe('dividirEnFrases — nunca cambia palabras, solo dónde caen los cortes', () => {
  test('divide por frase real sin alterar el texto', () => {
    const frases = dividirEnFrases('Hola mundo. Esto es una prueba real. ¿Funciona bien?');
    assert.equal(frases.join(' '), 'Hola mundo. Esto es una prueba real. ¿Funciona bien?');
    assert.equal(frases.length, 3);
  });

  test('un texto sin puntuación final se devuelve como una sola línea, literal', () => {
    assert.deepEqual(dividirEnFrases('texto sin punto final'), ['texto sin punto final']);
  });
});

describe('visualProductionPackageToRenderArgs — mapeo determinista', () => {
  test('mapea screenText[0] a hookText y cta/whatsappCta literalmente', () => {
    const vpp = { screenText: ['Hook real', 'Cuerpo real'], caption: 'caption', cta: 'CTA real', whatsappCta: 'WhatsApp real', voiceover: ['línea 1', 'línea 2'], subjectDescription: 'sujeto' };
    const args = visualProductionPackageToRenderArgs(vpp, { nombreComercial: 'TéDivina' });
    assert.equal(args.hookText, 'Hook real');
    assert.equal(args.productTitle, 'TéDivina');
    assert.equal(args.productBody, 'Cuerpo real');
    assert.equal(args.ctaText, 'CTA real');
    assert.equal(args.whatsappLabel, 'WhatsApp real');
    assert.deepEqual(args.voiceoverLines, ['línea 1', 'línea 2']);
  });

  test('sin productFacts, usa subjectDescription como productTitle (nunca inventa un nombre)', () => {
    const vpp = { screenText: ['Hook'], caption: 'cap', cta: 'CTA', whatsappCta: 'WA', voiceover: ['x'], subjectDescription: 'Producto genérico' };
    const args = visualProductionPackageToRenderArgs(vpp, null);
    assert.equal(args.productTitle, 'Producto genérico');
  });
});

describe('productionBriefToRenderArgs — mapeo determinista (Direct Instruction)', () => {
  test('usa productBody:null cuando la escena de producto ya tiene un asset visual (foto real, no lockup tipográfico)', () => {
    const brief = { screenText: ['Hook'], voiceoverText: 'Hook. Cuerpo.', cta: 'CTA', scenes: [{ role: 'product', visualAssetId: 'abc' }] };
    const args = productionBriefToRenderArgs(brief, { nombreComercial: 'TéDivina', beneficios: 'x' });
    assert.equal(args.productBody, null);
  });

  test('usa beneficios reales como productBody cuando NO hay foto (fallback tipográfico)', () => {
    const brief = { screenText: ['Hook'], voiceoverText: 'Hook.', cta: 'CTA', scenes: [{ role: 'product' }] };
    const args = productionBriefToRenderArgs(brief, { nombreComercial: 'TéDivina', beneficios: 'Beneficios reales del catálogo.' });
    assert.equal(args.productBody, 'Beneficios reales del catálogo.');
  });
});

describe('renderAndPostProduce — integración real, sin mock (sintético y corto para velocidad)', () => {
  test('produce un render maestro real + 1 Final Asset derivado por PostProduction, sin volver a invocar HyperFrames por perfil', async (t) => {
    let tmpAudio, projectDir;
    try {
      tmpAudio = join(mkdtempSync(join(tmpdir(), 'co-test-')), 'voz.wav');
      writeFileSync(tmpAudio, crearWavSilencioBuffer(3.0, 24000));
      projectDir = join(tmpdir(), `co-render-test-${Date.now()}`);

      const resultado = renderAndPostProduce({
        contentRequestId: 'cr-integration-1',
        renderArgs: {
          hookText: 'Hook real de integración', productTitle: 'Producto de prueba', productBody: 'Cuerpo real de prueba',
          ctaText: 'CTA real de prueba', whatsappLabel: 'WhatsApp', voiceoverLines: ['Hook real de integración.', 'CTA real de prueba.'],
        },
        audioSourcePath: tmpAudio, audioDurationSeconds: 3.0,
        productId: 'te-divina',
        outputProfileNames: ['INSTAGRAM_REEL'],
        postProductionOperations: ['LOUDNESS_NORMALIZATION'],
        projectDir, ffmpegBinDir: FFMPEG_BIN_DIR,
      });

      assert.equal(resultado.status, 'COMPLETADO');
      assert.equal(resultado.assetPackage.hasAllAssetsAvailable, true);
      assert.equal(resultado.masterResult.status, 'COMPLETADO');
      assert.equal(resultado.outputs.length, 1);
      assert.equal(resultado.outputs[0].outputProfileName, 'INSTAGRAM_REEL');
      assert.equal(resultado.outputs[0].status, 'COMPLETADO');
      assert.ok(existsSync(resultado.outputs[0].outputPath));
      rmSync(resultado.outputs[0].outputPath, { force: true });
    } finally {
      if (projectDir) { rmSync(projectDir, { recursive: true, force: true }); rmSync(`${projectDir}.mp4`, { force: true }); }
    }
  });

  test('rechaza un Output Profile desconocido antes de renderizar nada', () => {
    assert.throws(() => renderAndPostProduce({
      contentRequestId: 'x', renderArgs: { hookText: 'x', productTitle: 'x', productBody: 'x', ctaText: 'x', whatsappLabel: 'x', voiceoverLines: ['x'] },
      audioSourcePath: 'C:/no/importa.wav', audioDurationSeconds: 3, productId: 'te-divina',
      outputProfileNames: ['TIKTOK_VIDEO'], projectDir: 'C:/no/importa',
    }), /perfil desconocido/);
  });

  test('rechaza cuando el Audio Asset real no existe (Asset Package incompleto), nunca renderiza sin él', () => {
    assert.throws(() => renderAndPostProduce({
      contentRequestId: 'x', renderArgs: { hookText: 'x', productTitle: 'x', productBody: 'x', ctaText: 'x', whatsappLabel: 'x', voiceoverLines: ['x'] },
      audioSourcePath: 'C:/no/existe/voz.wav', audioDurationSeconds: 3, productId: 'te-divina',
      outputProfileNames: ['GENERIC_VERTICAL'], projectDir: 'C:/no/importa',
    }), /Asset Package tiene assets requeridos faltantes/);
  });
});
