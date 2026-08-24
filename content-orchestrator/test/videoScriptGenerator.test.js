import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateVariantCopy } from '../src/hypothesisCopyProvider.js';
import { VARIANT_BLUEPRINTS, PERSONA_FRAMINGS } from '../../creative-intelligence/src/marketingPlaybook.js';
import {
  buildVideoScript, estimateDurationSeconds, classifyDuration, resolveStyleCategory,
  assertVoiceoverTextSafe, DURATION_TARGET_SECONDS_BY_STYLE, VIDEO_SCRIPT_SECTION_TYPES,
} from '../src/videoScriptGenerator.js';

const FACTS = Object.freeze({
  nombreComercial: 'Divina Ripped Capsules',
  problema: 'Baja masa muscular y envejecimiento prematuro.',
  beneficios: 'Aporta al aumento de la musculatura; ayuda a prevenir el envejecimiento prematuro.',
  ingredientes: 'Tongkat Ali, Ganoderma (Reishi).',
});

function painHookFor(blueprint) {
  return PERSONA_FRAMINGS[blueprint.personaFraming].buildPainHookFragment(FACTS);
}

function copyFor(blueprint) {
  return generateVariantCopy({ blueprint, painHookFragment: painHookFor(blueprint), facts: FACTS });
}

describe('buildVideoScript -- Video Script != Creative Copy (Parte J del encargo)', () => {
  for (const bp of VARIANT_BLUEPRINTS) {
    test(`blueprint ${bp.id} (${bp.format}): Video Script real, grounded en el copy ya generado`, () => {
      const copy = copyFor(bp);
      const script = buildVideoScript({
        hook: copy.hook, bodyLines: copy.bodyLines, sectionsUsed: copy.sectionsUsed,
        cta: copy.cta, format: bp.format, copyStyle: bp.copyStyle,
      });
      if (bp.format === 'Static comparison frames') {
        assert.equal(script.applicable, false);
        assert.equal(script.voiceoverText, null);
        assert.equal(script.sections, null);
        return;
      }
      assert.equal(script.applicable, true);
      assert.ok(script.sections.length >= 2); // al menos HOOK + CTA
      assert.equal(script.sections[0].type, 'HOOK');
      assert.equal(script.sections.at(-1).type, 'CTA');
      for (const s of script.sections) assert.ok(VIDEO_SCRIPT_SECTION_TYPES.includes(s.type));
      // Video Script es un artefacto propio (tiene target/estimación de
      // duración), no una simple copia de copy.primaryText.
      assert.ok(script.targetDurationRange.max > script.targetDurationRange.min);
      assert.equal(script.wordCount, script.voiceoverText.trim().split(/\s+/).filter(Boolean).length);
      assert.ok(['TOO_SHORT', 'WITHIN_TARGET', 'TOO_LONG'].includes(script.durationStatus));
    });
  }

  test('el voiceoverText del Video Script sigue siendo grounded: coincide con hook+bodyLines+cta del copy, nunca inventa texto nuevo', () => {
    const bp = VARIANT_BLUEPRINTS.find((b) => b.format !== 'Static comparison frames');
    const copy = copyFor(bp);
    const script = buildVideoScript({ hook: copy.hook, bodyLines: copy.bodyLines, sectionsUsed: copy.sectionsUsed, cta: copy.cta, format: bp.format, copyStyle: bp.copyStyle });
    assert.equal(script.voiceoverText, [copy.hook, ...copy.bodyLines, copy.cta].join(' '));
  });
});

describe('Duration target + estimación (Parte L del encargo)', () => {
  test('estimateDurationSeconds crece con el conteo de palabras', () => {
    assert.ok(estimateDurationSeconds('una dos tres cuatro') < estimateDurationSeconds('una dos tres cuatro cinco seis siete ocho'));
  });

  test('classifyDuration: TOO_SHORT / WITHIN_TARGET / TOO_LONG -- informativo, nunca reescribe el texto', () => {
    const range = { min: 15, max: 25 };
    assert.equal(classifyDuration(5, range), 'TOO_SHORT');
    assert.equal(classifyDuration(20, range), 'WITHIN_TARGET');
    assert.equal(classifyDuration(40, range), 'TOO_LONG');
  });

  test('las 5 categorías reales de estilo tienen un rango de duración definido y coherente', () => {
    for (const cat of Object.keys(DURATION_TARGET_SECONDS_BY_STYLE)) {
      const r = DURATION_TARGET_SECONDS_BY_STYLE[cat];
      assert.ok(r.min > 0 && r.max > r.min, `categoría ${cat} tiene un rango inválido`);
    }
  });

  test('resolveStyleCategory: blueprint B (Educational walk-and-talk) -> EDUCATIONAL real', () => {
    const bp = VARIANT_BLUEPRINTS.find((b) => b.id === 'B');
    assert.equal(resolveStyleCategory({ format: bp.format, copyStyle: bp.copyStyle }), 'EDUCATIONAL');
  });

  test('resolveStyleCategory: blueprint C (POV personal story) -> POV real', () => {
    const bp = VARIANT_BLUEPRINTS.find((b) => b.id === 'C');
    assert.equal(resolveStyleCategory({ format: bp.format, copyStyle: bp.copyStyle }), 'POV');
  });

  test('resolveStyleCategory: format desconocido cae a copyStyle DIRECT_RESPONSE real', () => {
    assert.equal(resolveStyleCategory({ format: 'Formato futuro no listado', copyStyle: 'DIRECT_RESPONSE' }), 'DIRECT_RESPONSE');
  });
});

describe('Claim Safety en el Video Script (Parte M del encargo) -- guards reutilizados, nunca debilitados', () => {
  test('un claim prohibido real en bodyLines es rechazado por buildVideoScript', () => {
    const bp = VARIANT_BLUEPRINTS.find((b) => b.format !== 'Static comparison frames');
    assert.throws(() => buildVideoScript({
      hook: 'Hook seguro', bodyLines: ['cura el envejecimiento por completo'],
      sectionsUsed: [{ section: 'productReveal', sourceField: 'beneficios' }],
      cta: 'Escríbenos por WhatsApp.', format: bp.format, copyStyle: bp.copyStyle,
    }));
  });

  test('assertVoiceoverTextSafe rechaza un texto EDITADO por el usuario que introduce un claim prohibido', () => {
    assert.throws(() => assertVoiceoverTextSafe('Este producto cura el envejecimiento por completo.'));
  });

  test('assertVoiceoverTextSafe rechaza lenguaje BRAND_AVOID en un texto editado', () => {
    assert.throws(() => assertVoiceoverTextSafe('Un fondo saturado y neón, muy llamativo.'));
  });

  test('assertVoiceoverTextSafe acepta un texto editado real, sin claims prohibidos ni lenguaje BRAND_AVOID', () => {
    assert.doesNotThrow(() => assertVoiceoverTextSafe('Hola, esto es un texto editado a mano por el usuario, real y seguro.'));
  });
});

describe('buildVideoScript -- validación real', () => {
  test('lanza sin hook', () => {
    assert.throws(() => buildVideoScript({ hook: '', bodyLines: [], cta: 'x', format: 'POV personal story', copyStyle: 'POV' }));
  });
  test('lanza sin cta', () => {
    assert.throws(() => buildVideoScript({ hook: 'x', bodyLines: [], cta: '', format: 'POV personal story', copyStyle: 'POV' }));
  });
  test('lanza sin bodyLines como arreglo', () => {
    assert.throws(() => buildVideoScript({ hook: 'x', bodyLines: null, cta: 'y', format: 'POV personal story', copyStyle: 'POV' }));
  });
  test('formato estático -> applicable:false, nunca lanza (mismo criterio que hypothesisCopyProvider.js#STATIC_FORMATS)', () => {
    const script = buildVideoScript({ hook: 'x', bodyLines: ['y'], cta: 'z', format: 'Static comparison frames', copyStyle: 'DIRECT_RESPONSE' });
    assert.equal(script.applicable, false);
  });
  test('bodyLines vacío (ej. awareness "Most Aware": estructura hook+cta solamente) -- no lanza, produce un Video Script de 2 secciones', () => {
    const script = buildVideoScript({ hook: 'x', bodyLines: [], sectionsUsed: [], cta: 'y', format: 'POV personal story', copyStyle: 'POV' });
    assert.equal(script.sections.length, 2);
    assert.equal(script.sections[0].type, 'HOOK');
    assert.equal(script.sections[1].type, 'CTA');
  });
});
