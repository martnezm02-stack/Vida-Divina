import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateVariantCopy } from '../src/hypothesisCopyProvider.js';
import { VARIANT_BLUEPRINTS, PERSONA_FRAMINGS } from '../../creative-intelligence/src/marketingPlaybook.js';

const FACTS = Object.freeze({
  nombreComercial: 'Divina Ripped Capsules',
  problema: 'Baja masa muscular y envejecimiento prematuro.',
  beneficios: 'Aporta al aumento de la musculatura; ayuda a prevenir el envejecimiento prematuro.',
  ingredientes: 'Tongkat Ali, Ganoderma (Reishi).',
});

function painHookFor(blueprint) {
  return PERSONA_FRAMINGS[blueprint.personaFraming].buildPainHookFragment(FACTS);
}

describe('generateVariantCopy — validación real', () => {
  test('lanza sin blueprint completo (falta copyStyle/ctaStrategy)', () => {
    assert.throws(() => generateVariantCopy({ blueprint: { hook: 'question', awareness: 'Problem Aware', format: 'Native TikTok-style' }, painHookFragment: 'algo', facts: FACTS }));
  });
  test('lanza sin painHookFragment', () => {
    assert.throws(() => generateVariantCopy({ blueprint: VARIANT_BLUEPRINTS[0], painHookFragment: '', facts: FACTS }));
  });
  test('lanza sin facts.nombreComercial', () => {
    assert.throws(() => generateVariantCopy({ blueprint: VARIANT_BLUEPRINTS[0], painHookFragment: 'algo', facts: {} }));
  });
});

describe('generateVariantCopy — forma real del resultado', () => {
  test('produce hook/headline/primaryText/cta/tone/copyStyle reales, no vacíos', () => {
    const bp = VARIANT_BLUEPRINTS[0];
    const copy = generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS });
    assert.ok(copy.hook.length > 0);
    assert.equal(copy.headline, copy.hook);
    assert.ok(copy.primaryText.length > 0);
    assert.ok(copy.cta.length > 0);
    assert.ok(copy.tone.length > 0);
    assert.equal(copy.copyStyle, bp.copyStyle);
  });

  test('expone bodyLines y sectionsUsed (necesarios para creativeQualityGate.js)', () => {
    const bp = VARIANT_BLUEPRINTS[0];
    const copy = generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS });
    assert.ok(Array.isArray(copy.bodyLines));
    assert.ok(Array.isArray(copy.sectionsUsed));
    for (const s of copy.sectionsUsed) {
      assert.ok(typeof s.section === 'string');
      assert.ok(typeof s.sourceField === 'string');
    }
  });

  test('formato de video (no "Static comparison frames") produce voiceover/script; formato estático no', () => {
    const videoBp = VARIANT_BLUEPRINTS.find((b) => b.format !== 'Static comparison frames');
    const staticBp = VARIANT_BLUEPRINTS.find((b) => b.format === 'Static comparison frames');
    const videoCopy = generateVariantCopy({ blueprint: videoBp, painHookFragment: painHookFor(videoBp), facts: FACTS });
    const staticCopy = generateVariantCopy({ blueprint: staticBp, painHookFragment: painHookFor(staticBp), facts: FACTS });
    assert.ok(Array.isArray(videoCopy.voiceover) && videoCopy.voiceover.length > 0);
    assert.equal(staticCopy.voiceover, null);
    assert.equal(staticCopy.script, null);
  });

  test('el CTA siempre es el canal de WhatsApp real ya establecido en el proyecto', () => {
    const bp = VARIANT_BLUEPRINTS[0];
    const copy = generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS });
    assert.match(copy.cta, /WhatsApp/);
  });
});

describe('generateVariantCopy — corrección de root cause: mechanism y productReveal NUNCA comparten campo fuente (Fase de Creative Quality, Parte 3)', () => {
  test('sectionsUsed nunca repite un sourceField entre secciones distintas, para NINGUNO de los 5 blueprints reales', () => {
    for (const bp of VARIANT_BLUEPRINTS) {
      const copy = generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS });
      const camposVistos = new Set();
      for (const s of copy.sectionsUsed) {
        assert.ok(!camposVistos.has(s.sourceField), `blueprint ${bp.id}: la sección "${s.section}" repite el sourceField "${s.sourceField}" ya usado por otra sección`);
        camposVistos.add(s.sourceField);
      }
    }
  });

  test('el campo "beneficios" real nunca aparece 2+ veces literalmente en el mismo primaryText, para NINGUNO de los 5 blueprints (bug real observado en el benchmark de Ripped)', () => {
    for (const bp of VARIANT_BLUEPRINTS) {
      const copy = generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS });
      const fragment = FACTS.beneficios.replace(/\.+$/, '');
      const count = copy.primaryText.toLowerCase().split(fragment.toLowerCase()).length - 1;
      assert.ok(count <= 1, `blueprint ${bp.id}: "beneficios" aparece ${count} veces en el mismo copy`);
    }
  });
});

describe('generateVariantCopy — diversidad estructural real entre variantes (Fase 16 Parte 12; Fase de Creative Quality)', () => {
  test('los 5 blueprints reales producen 5 hooks realmente distintos para los MISMOS facts', () => {
    const hooks = VARIANT_BLUEPRINTS.map((bp) => generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS }).hook);
    assert.equal(new Set(hooks).size, hooks.length);
  });

  test('los 5 blueprints reales producen 5 primaryText realmente distintos', () => {
    const bodies = VARIANT_BLUEPRINTS.map((bp) => generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS }).primaryText);
    assert.equal(new Set(bodies).size, bodies.length);
  });

  test('los 5 blueprints reales producen 5 CTAs realmente distintas (root cause real: antes todas terminaban igual)', () => {
    const ctas = VARIANT_BLUEPRINTS.map((bp) => generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS }).cta);
    assert.equal(new Set(ctas).size, ctas.length);
  });

  test('los 5 blueprints reales producen 5 tones realmente distintos, siempre derivados de copyStyle (nunca dead metadata)', () => {
    const tones = VARIANT_BLUEPRINTS.map((bp) => generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS }).tone);
    assert.equal(new Set(tones).size, tones.length);
  });

  test('la estructura del copy sigue el awareness stage real de cada blueprint (Unaware/Problem Aware incluyen el problema; Product Aware/Most Aware no)', () => {
    const problemAwareBp = VARIANT_BLUEPRINTS.find((b) => b.awareness === 'Problem Aware');
    const productAwareBp = VARIANT_BLUEPRINTS.find((b) => b.awareness === 'Product Aware');
    const copyProblemAware = generateVariantCopy({ blueprint: problemAwareBp, painHookFragment: painHookFor(problemAwareBp), facts: FACTS });
    const copyProductAware = generateVariantCopy({ blueprint: productAwareBp, painHookFragment: painHookFor(productAwareBp), facts: FACTS });
    assert.match(copyProblemAware.primaryText, /Baja masa muscular/);
    assert.doesNotMatch(copyProductAware.primaryText, /Baja masa muscular/);
  });
});

describe('generateVariantCopy — grounded en Product Facts, nunca inventa (Fase 16 Parte 15)', () => {
  test('el texto combinado nunca menciona estudios/porcentajes/testimonios/reseñas inventados', () => {
    for (const bp of VARIANT_BLUEPRINTS) {
      const copy = generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: FACTS });
      assert.doesNotMatch(copy.primaryText, /estudio|clínic|porcentaje|%|testimonio|reseña/i);
    }
  });

  test('un claim prohibido (ej. "cura") en el texto real del producto lanza -- el guard sigue activo, no se debilitó', () => {
    const bp = VARIANT_BLUEPRINTS[1];
    const factsConClaimProhibido = { ...FACTS, beneficios: 'cura el envejecimiento por completo' };
    assert.throws(() => generateVariantCopy({ blueprint: bp, painHookFragment: painHookFor(bp), facts: factsConClaimProhibido }));
  });
});
