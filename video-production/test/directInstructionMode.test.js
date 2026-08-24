import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { directInstructionToProductionBrief, DIRECT_INSTRUCTION_MODE } from '../src/directInstructionMode.js';

const VISUAL_ASSETS = [{ assetId: 'abc123', sourcePath: 'C:/x/foto.jpeg' }];

describe('directInstructionToProductionBrief — parámetros deterministas', () => {
  test('extrae duración y aspect ratio vertical del ejemplo dado por el usuario', () => {
    const brief = directInstructionToProductionBrief({
      instructionText: 'Crear un Reel vertical de 20 segundos usando esta fotografía del producto, mi voz oficial, subtítulos dinámicos y CTA a WhatsApp.',
      visualAssets: VISUAL_ASSETS,
      voiceoverText: 'Texto literal de prueba.',
      cta: 'Escríbenos por WhatsApp.',
    });
    assert.equal(brief.mode, DIRECT_INSTRUCTION_MODE);
    assert.equal(brief.durationSeconds, 20);
    assert.equal(brief.aspectRatio, '9:16');
    assert.equal(brief.subtitles, true);
    assert.equal(brief.useOfficialVoice, true);
  });

  test('detecta horizontal y cuadrado', () => {
    const h = directInstructionToProductionBrief({ instructionText: 'video horizontal de 10 segundos', visualAssets: VISUAL_ASSETS, voiceoverText: 'x', cta: 'y' });
    assert.equal(h.aspectRatio, '16:9');
    const s = directInstructionToProductionBrief({ instructionText: 'video cuadrado de 10 segundos', visualAssets: VISUAL_ASSETS, voiceoverText: 'x', cta: 'y' });
    assert.equal(s.aspectRatio, '1:1');
  });

  test('durationSeconds explícito tiene prioridad sobre lo detectado en el texto', () => {
    const brief = directInstructionToProductionBrief({
      instructionText: 'un video de 20 segundos', visualAssets: VISUAL_ASSETS, voiceoverText: 'x', cta: 'y', durationSeconds: 12,
    });
    assert.equal(brief.durationSeconds, 12);
  });
});

describe('directInstructionToProductionBrief — nunca infiere contenido de la prosa libre', () => {
  test('rechaza si falta voiceoverText (nunca redacta guion)', () => {
    assert.throws(
      () => directInstructionToProductionBrief({ instructionText: 'un video de 10 segundos', visualAssets: VISUAL_ASSETS, cta: 'y' }),
      /voiceoverText.*obligatorio/
    );
  });

  test('rechaza si falta cta (nunca redacta CTA)', () => {
    assert.throws(
      () => directInstructionToProductionBrief({ instructionText: 'un video de 10 segundos', visualAssets: VISUAL_ASSETS, voiceoverText: 'x' }),
      /cta.*obligatorio/
    );
  });

  test('rechaza si faltan visualAssets (nunca infiere "esta fotografía" de la prosa)', () => {
    assert.throws(
      () => directInstructionToProductionBrief({ instructionText: 'un video de 10 segundos usando esta fotografía', voiceoverText: 'x', cta: 'y' }),
      /visualAssets.*explícito/
    );
  });

  test('rechaza si no puede determinar duración de ningún lado', () => {
    assert.throws(
      () => directInstructionToProductionBrief({ instructionText: 'un video llamativo', visualAssets: VISUAL_ASSETS, voiceoverText: 'x', cta: 'y' }),
      /durationSeconds/
    );
  });

  test('voiceoverText y cta se preservan literalmente, sin ninguna transformación', () => {
    const texto = 'Té Divina, parte del catálogo de productos de Vida Divina.';
    const cta = 'Escríbenos por WhatsApp para más información.';
    const brief = directInstructionToProductionBrief({ instructionText: 'video de 10 segundos', visualAssets: VISUAL_ASSETS, voiceoverText: texto, cta });
    assert.equal(brief.voiceoverText, texto);
    assert.equal(brief.cta, cta);
    assert.deepEqual([...brief.screenText], [texto]);
  });
});

describe('directInstructionToProductionBrief — escenas', () => {
  test('genera 3 escenas (hook/product/cta) que suman la duración total', () => {
    const brief = directInstructionToProductionBrief({ instructionText: 'video de 20 segundos', visualAssets: VISUAL_ASSETS, voiceoverText: 'x', cta: 'y' });
    assert.equal(brief.scenes.length, 3);
    const sumaDuraciones = brief.scenes.reduce((acc, s) => acc + s.duration, 0);
    assert.ok(Math.abs(sumaDuraciones - 20) < 0.01);
    assert.equal(brief.scenes[1].visualAssetId, 'abc123');
  });
});
