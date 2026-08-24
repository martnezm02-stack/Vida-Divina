import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANGLE_STRATEGIES, HOOK_STRATEGIES, PERSONA_FRAMINGS, VARIANT_BLUEPRINTS, VISUAL_STYLES,
  SCROLL_STOPPING_PATTERNS, CTA_STRATEGIES, COPY_STYLES,
  assertValidAngleId, assertValidHookId, assertValidPersonaFraming, assertValidVisualStyle,
  assertValidScrollStoppingPattern, assertValidCtaStrategy, assertValidCopyStyle,
  buildMechanismStatement, buildAngleText, buildMarketingPrincipleBasisEntry, renderHook,
  copyStructureFor, selectVariantBlueprints, buildCta, deriveToneLabel, renderCopyStyleSection, getHookType,
} from '../src/marketingPlaybook.js';
import { HYPOTHESIS_BASIS_TYPES } from '../src/hypothesisTesting.js';

const FACTS = Object.freeze({
  nombreComercial: 'Divina Ripped Capsules',
  problema: 'Baja masa muscular y envejecimiento prematuro.',
  beneficios: 'Aporta al aumento de la musculatura.',
  ingredientes: 'Tongkat Ali, Ganoderma (Reishi).',
});

describe('MARKETING_PRINCIPLE está registrado en hypothesisTesting.js (Fase 16, Parte 8)', () => {
  test('HYPOTHESIS_BASIS_TYPES incluye MARKETING_PRINCIPLE sin perder los 3 tipos existentes', () => {
    assert.ok(HYPOTHESIS_BASIS_TYPES.includes('MARKETING_PRINCIPLE'));
    assert.ok(HYPOTHESIS_BASIS_TYPES.includes('PRODUCT_FACT'));
    assert.ok(HYPOTHESIS_BASIS_TYPES.includes('MARKET_EVIDENCE'));
    assert.ok(HYPOTHESIS_BASIS_TYPES.includes('BRAND_CONTEXT'));
  });
});

describe('ANGLE_STRATEGIES / HOOK_STRATEGIES — vocabulario, nunca datos de cliente', () => {
  test('ningún AngleStrategy contiene una afirmación de mercado', () => {
    for (const angle of Object.values(ANGLE_STRATEGIES)) {
      assert.doesNotMatch(angle.description, /compran|los clientes|las mujeres|los hombres de \d/i);
    }
  });

  test('assertValidAngleId/assertValidHookId aceptan valores reales y rechazan inventados', () => {
    assert.doesNotThrow(() => assertValidAngleId('convenience'));
    assert.throws(() => assertValidAngleId('no-existe'));
    assert.doesNotThrow(() => assertValidHookId('question'));
    assert.throws(() => assertValidHookId('no-existe'));
  });

  test('HOOK_STRATEGIES cubre exactamente los 11 tipos reales de la taxonomía (Fase de Creative Quality, Parte 4)', () => {
    const tipos = Object.values(HOOK_STRATEGIES).map((h) => h.hookType).sort();
    assert.deepEqual(tipos, ['POV', 'contrarian', 'curiosity', 'demonstration', 'pattern_interrupt', 'problem_recognition', 'question', 'story', 'text_on_screen', 'verbal', 'visual'].sort());
  });

  test('getHookType devuelve el hookType real de cada hookId', () => {
    assert.equal(getHookType('curiosity'), 'curiosity');
    assert.equal(getHookType('pov'), 'POV');
  });
});

describe('buildMechanismStatement — nunca inventa, exige al menos un hecho real', () => {
  test('lanza sin ingredientes ni beneficios', () => {
    assert.throws(() => buildMechanismStatement({}), /nunca se inventa un mecanismo/);
  });

  test('usa solo lo real disponible', () => {
    assert.equal(buildMechanismStatement({ ingredientes: 'Tongkat Ali' }), 'Tongkat Ali');
    assert.match(buildMechanismStatement(FACTS), /Tongkat Ali/);
  });
});

describe('buildAngleText — grounded en facts reales', () => {
  test('cada angle real produce un texto real, grounded en el nombre comercial o en el problema/beneficio real (nunca vacío ni inventado)', () => {
    for (const angle of Object.values(ANGLE_STRATEGIES)) {
      const text = buildAngleText(angle.id, FACTS);
      assert.ok(text.length > 0);
      const mencionaProducto = text.includes(FACTS.nombreComercial);
      const mencionaProblemaOBeneficio = text.includes('Baja masa muscular') || text.includes('aumento de la musculatura');
      assert.ok(mencionaProducto || mencionaProblemaOBeneficio, `angle "${angle.id}" produjo un texto sin grounding real: "${text}"`);
    }
  });

  test('lanza para un angleId inexistente', () => {
    assert.throws(() => buildAngleText('no-existe', FACTS));
  });
});

describe('buildMarketingPrincipleBasisEntry — forma real del basis (Fase 16 Parte 8, enriquecido en Creative Quality Parte 14)', () => {
  test('sin contexto: produce { type, ref, detail } básico', () => {
    const entry = buildMarketingPrincipleBasisEntry('convenience');
    assert.equal(entry.type, 'MARKETING_PRINCIPLE');
    assert.equal(entry.ref, 'AngleStrategy.CONVENIENCE');
    assert.ok(entry.detail.length > 0);
  });

  test('con contexto: produce la forma de hipótesis rigurosa ("Porque...creemos que...hipotética")', () => {
    const entry = buildMarketingPrincipleBasisEntry('mechanism', { personaFramingLabel: 'curiosa de bienestar', factFragment: FACTS.beneficios });
    assert.match(entry.detail, /^Porque el producto documenta/);
    assert.match(entry.detail, /hipótesis/i);
    assert.match(entry.detail, /curiosa de bienestar/);
    // La frase completa niega explícitamente la afirmación de éxito
    // ("nunca una afirmación validada de que funcionará") -- se verifica
    // la negación real, no la mera ausencia de la palabra.
    assert.match(entry.detail, /nunca una afirmación validada de que funcionará/i);
    assert.doesNotMatch(entry.detail, /garantizado/i);
  });

  test('nunca es CUSTOMER_EVIDENCE ni MARKET_EVIDENCE', () => {
    const entry = buildMarketingPrincipleBasisEntry('mechanism');
    assert.notEqual(entry.type, 'CUSTOMER_EVIDENCE');
    assert.notEqual(entry.type, 'MARKET_EVIDENCE');
  });
});

describe('PERSONA_FRAMINGS — pain reframing real (Fase de Creative Quality, Parte 6)', () => {
  test('cada framing real expone buildPainFragment (completo) y buildPainHookFragment (corto)', () => {
    for (const framing of Object.values(PERSONA_FRAMINGS)) {
      assert.equal(typeof framing.buildPainFragment, 'function');
      assert.equal(typeof framing.buildPainHookFragment, 'function');
      const full = framing.buildPainFragment(FACTS);
      const short = framing.buildPainHookFragment(FACTS);
      assert.ok(full.length > 0);
      assert.ok(short.length > 0);
      assert.ok(short.length < full.length, 'el fragmento de hook debe ser más corto que el painPoint completo');
    }
  });

  test('los 5 framings producen 5 buildPainFragment realmente distintos para los MISMOS facts (root cause real: antes todas compartían el mismo pain)', () => {
    const fragments = Object.values(PERSONA_FRAMINGS).map((f) => f.buildPainFragment(FACTS));
    assert.equal(new Set(fragments).size, fragments.length);
  });

  test('los 5 framings producen 5 buildPainHookFragment realmente distintos', () => {
    const fragments = Object.values(PERSONA_FRAMINGS).map((f) => f.buildPainHookFragment(FACTS));
    assert.equal(new Set(fragments).size, fragments.length);
  });

  test('buildPainFragment sigue grounded: cita el hecho real (problema o beneficios, según el framing) entre comillas, nunca inventa contenido', () => {
    for (const framing of Object.values(PERSONA_FRAMINGS)) {
      const full = framing.buildPainFragment(FACTS);
      const citaProblema = full.includes('Baja masa muscular y envejecimiento prematuro');
      const citaBeneficios = full.includes('Aporta al aumento de la musculatura');
      assert.ok(citaProblema || citaBeneficios, `buildPainFragment no citó ningún hecho real: "${full}"`);
    }
  });
});

describe('renderHook — 11 tipos, texto real y estructuralmente distinto', () => {
  const ctx = { painFragment: 'mantener una rutina consistente', mechanismFragment: 'Tongkat Ali', nombreComercial: 'Divina Ripped Capsules' };

  test('cada HookStrategy real produce un texto no vacío', () => {
    for (const hook of Object.values(HOOK_STRATEGIES)) {
      const text = renderHook(hook.id, ctx);
      assert.ok(text.trim().length > 0);
    }
  });

  test('los 11 tipos producen 11 textos realmente distintos con el MISMO contexto', () => {
    const textos = Object.values(HOOK_STRATEGIES).map((h) => renderHook(h.id, ctx));
    assert.equal(new Set(textos).size, textos.length);
  });

  test('el hook de curiosidad NUNCA revela el ingrediente literal (evita duplicar el claim que la sección mechanism cita después -- root cause real detectado en pruebas)', () => {
    const text = renderHook('curiosity', ctx);
    assert.doesNotMatch(text, /Tongkat Ali/);
  });

  test('lanza para un hookId inexistente', () => {
    assert.throws(() => renderHook('no-existe', ctx));
  });
});

describe('SCROLL_STOPPING_PATTERNS — Fase de Creative Quality, Parte 5', () => {
  test('cada patrón real expone firstFrame y visualHook no vacíos', () => {
    for (const pattern of Object.values(SCROLL_STOPPING_PATTERNS)) {
      assert.ok(pattern.firstFrame.length > 0);
      assert.ok(pattern.visualHook.length > 0);
    }
  });

  test('ningún patrón afirma un resultado corporal/transformación (regla no negociable)', () => {
    for (const pattern of Object.values(SCROLL_STOPPING_PATTERNS)) {
      assert.doesNotMatch(pattern.firstFrame, /antes y despu[eé]s|transformaci[oó]n corporal|resultado real/i);
    }
  });

  test('split_screen documenta explícitamente que NUNCA es un antes/después de resultado corporal', () => {
    assert.match(SCROLL_STOPPING_PATTERNS.SPLIT_SCREEN.firstFrame, /nunca un antes\/después de resultado corporal/i);
  });

  test('assertValidScrollStoppingPattern rechaza un patrón inventado', () => {
    assert.throws(() => assertValidScrollStoppingPattern('no-existe'));
  });
});

describe('CTA_STRATEGIES — Fase de Creative Quality, Parte 8', () => {
  test('las 5 estrategias reales producen CTAs distintas para el mismo producto', () => {
    const ctas = Object.values(CTA_STRATEGIES).map((c) => buildCta(c.id, FACTS.nombreComercial));
    assert.equal(new Set(ctas).size, ctas.length);
  });

  test('todas las CTAs reales terminan en el canal real disponible (WhatsApp), nunca inventan descuento/urgencia/disponibilidad', () => {
    for (const c of Object.values(CTA_STRATEGIES)) {
      const cta = buildCta(c.id, FACTS.nombreComercial);
      assert.match(cta, /WhatsApp/);
      assert.doesNotMatch(cta, /descuento|oferta|% off|solo hoy|últimas unidades|promoci[oó]n/i);
    }
  });

  test('assertValidCtaStrategy rechaza una estrategia inventada', () => {
    assert.throws(() => assertValidCtaStrategy('no-existe'));
  });
});

describe('COPY_STYLES / deriveToneLabel — el tone ya no es dead metadata (Fase de Creative Quality, Parte 7)', () => {
  test('cada copyStyle real produce un toneLabel real, no vacío', () => {
    for (const style of Object.keys(COPY_STYLES)) {
      assert.ok(deriveToneLabel(style).length > 0);
    }
  });

  test('deriveToneLabel lanza para un copyStyle inexistente (nunca produce un tone huérfano)', () => {
    assert.throws(() => deriveToneLabel('NO_EXISTE'));
  });

  test('renderCopyStyleSection produce texto REALMENTE distinto para el mismo fragmento según el copyStyle (el tone/estilo sí afecta la redacción)', () => {
    const textos = Object.keys(COPY_STYLES).map((style) => renderCopyStyleSection('mechanism', style, 'Tongkat Ali', 'Divina Ripped Capsules'));
    assert.equal(new Set(textos).size, textos.length);
  });

  test('renderCopyStyleSection nunca omite el fragmento factual real, solo cambia la forma', () => {
    for (const style of Object.keys(COPY_STYLES)) {
      const texto = renderCopyStyleSection('productReveal', style, 'Aporta al aumento de la musculatura', 'Divina Ripped Capsules');
      assert.match(texto, /aumento de la musculatura/i);
    }
  });

  test('assertValidCopyStyle rechaza un estilo inventado', () => {
    assert.throws(() => assertValidCopyStyle('NO_EXISTE'));
  });
});

describe('copyStructureFor — la estructura cambia por awareness stage (remapeada al framework de 3 fases)', () => {
  test('Unaware/Problem Aware incluyen "problem"; Most Aware no', () => {
    assert.ok(copyStructureFor('Unaware').includes('problem'));
    assert.ok(copyStructureFor('Problem Aware').includes('problem'));
    assert.ok(!copyStructureFor('Most Aware').includes('problem'));
  });

  test('lanza para un awareness stage inválido', () => {
    assert.throws(() => copyStructureFor('No Aware'));
  });
});

describe('VARIANT_BLUEPRINTS / selectVariantBlueprints — diversidad estructural real ampliada (Fase de Creative Quality, Parte 13)', () => {
  test('los 5 blueprints reales son estructuralmente distintos en TODAS las dimensiones: personaFraming, angle, hook, copyStyle, ctaStrategy, awareness, format, visualStyle, scrollStoppingPattern', () => {
    const dimensiones = ['personaFraming', 'angle', 'hook', 'copyStyle', 'ctaStrategy', 'awareness', 'format', 'visualStyle', 'scrollStoppingPattern'];
    for (const dim of dimensiones) {
      const valores = VARIANT_BLUEPRINTS.map((b) => b[dim]);
      assert.equal(new Set(valores).size, VARIANT_BLUEPRINTS.length, `la dimensión "${dim}" no es única entre los 5 blueprints reales`);
    }
  });

  test('selectVariantBlueprints(3) es determinista -- misma llamada, mismo resultado', () => {
    const a = selectVariantBlueprints(3).map((b) => b.id);
    const b = selectVariantBlueprints(3).map((b) => b.id);
    assert.deepEqual(a, b);
  });

  test('selectVariantBlueprints rechaza cuentas fuera de rango', () => {
    assert.throws(() => selectVariantBlueprints(1));
    assert.throws(() => selectVariantBlueprints(6));
  });

  test('cada blueprint real referencia identificadores realmente definidos en cada vocabulario (persona/visual/angle/hook/cta/copyStyle/scrollStoppingPattern)', () => {
    for (const bp of VARIANT_BLUEPRINTS) {
      assert.doesNotThrow(() => assertValidPersonaFraming(bp.personaFraming));
      assert.doesNotThrow(() => assertValidVisualStyle(bp.visualStyle));
      assert.doesNotThrow(() => assertValidAngleId(bp.angle));
      assert.doesNotThrow(() => assertValidHookId(bp.hook));
      assert.doesNotThrow(() => assertValidCtaStrategy(bp.ctaStrategy));
      assert.doesNotThrow(() => assertValidCopyStyle(bp.copyStyle));
      assert.doesNotThrow(() => assertValidScrollStoppingPattern(bp.scrollStoppingPattern));
    }
  });
});
