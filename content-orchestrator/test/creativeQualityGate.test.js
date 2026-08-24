import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkClaimRepetition, checkStructuralSameness, checkEmptyOrLowValueCopy,
  checkHookRepetition, checkCtaDiversityAcrossExperiment, checkSocialNative,
  runCreativeQualityGate, runExperimentQualityGate,
} from '../src/creativeQualityGate.js';

const FACTS = Object.freeze({
  nombreComercial: 'Divina Ripped Capsules',
  problema: 'Baja masa muscular y envejecimiento prematuro',
  beneficios: 'Aporta al aumento de la musculatura',
  ingredientes: 'Tongkat Ali, Ganoderma (Reishi)',
});

describe('checkClaimRepetition — root cause real del benchmark de Ripped', () => {
  test('detecta un campo real repetido 2+ veces literalmente en el mismo copy', () => {
    const primaryText = `${FACTS.beneficios}. Divina Ripped Capsules: ${FACTS.beneficios}.`;
    const result = checkClaimRepetition(primaryText, FACTS);
    assert.equal(result.passed, false);
    assert.match(result.issues[0], /beneficios/);
  });

  test('no marca nada cuando cada campo aparece una sola vez', () => {
    const primaryText = `${FACTS.problema}. ${FACTS.ingredientes}. ${FACTS.beneficios}.`;
    const result = checkClaimRepetition(primaryText, FACTS);
    assert.equal(result.passed, true);
  });

  test('ignora fragmentos demasiado cortos (evita falsos positivos)', () => {
    const result = checkClaimRepetition('a a a a a', { problema: 'a', beneficios: null, ingredientes: null });
    assert.equal(result.passed, true);
  });
});

describe('checkStructuralSameness', () => {
  test('detecta dos secciones que citan el mismo sourceField', () => {
    const result = checkStructuralSameness([{ section: 'mechanism', sourceField: 'beneficios' }, { section: 'productReveal', sourceField: 'beneficios' }]);
    assert.equal(result.passed, false);
    assert.match(result.issues[0], /mechanism.*productReveal|mismo campo fuente/);
  });

  test('no marca nada cuando cada sección tiene su propio campo fuente (diseño corregido)', () => {
    const result = checkStructuralSameness([{ section: 'problem', sourceField: 'problema' }, { section: 'mechanism', sourceField: 'ingredientes' }, { section: 'productReveal', sourceField: 'beneficios' }]);
    assert.equal(result.passed, true);
  });
});

describe('checkHookRepetition — patrón real observado en Variante A del benchmark', () => {
  test('detecta hook y primera línea del cuerpo esencialmente iguales', () => {
    const result = checkHookRepetition('¿Baja masa muscular y envejecimiento prematuro?', ['Baja masa muscular y envejecimiento prematuro.']);
    assert.equal(result.passed, false);
  });

  test('no marca nada cuando hook y cuerpo son genuinamente distintos', () => {
    const result = checkHookRepetition('¿mantener una rutina consistente?', ['Baja masa muscular y envejecimiento prematuro.']);
    assert.equal(result.passed, true);
  });

  test('sin bodyLines -- pasa trivialmente (nada que comparar)', () => {
    const result = checkHookRepetition('cualquier hook', []);
    assert.equal(result.passed, true);
  });
});

describe('checkEmptyOrLowValueCopy', () => {
  test('advierte (no bloquea) cuando el copy total es muy corto', () => {
    const result = checkEmptyOrLowValueCopy({ hook: 'Hola', bodyLines: [], cta: 'Escribe' });
    assert.equal(result.passed, false);
    assert.ok(result.warnings.length > 0);
  });

  test('pasa con contenido real suficiente', () => {
    const result = checkEmptyOrLowValueCopy({ hook: '¿mantener una rutina consistente?', bodyLines: ['Divina Ripped Capsules incluye Tongkat Ali.'], cta: 'Escríbenos por WhatsApp para conocer más.' });
    assert.equal(result.passed, true);
  });
});

describe('checkCtaDiversityAcrossExperiment — root cause real: CTA idéntico en las 3 variantes', () => {
  test('detecta cuando TODAS las variantes comparten la misma CTA', () => {
    const result = checkCtaDiversityAcrossExperiment(['Escríbenos por WhatsApp.', 'Escríbenos por WhatsApp.', 'Escríbenos por WhatsApp.']);
    assert.equal(result.passed, false);
    assert.equal(result.distinctCount, 1);
  });

  test('pasa cuando existe diversidad real de CTA', () => {
    const result = checkCtaDiversityAcrossExperiment(['CTA A', 'CTA B', 'CTA C']);
    assert.equal(result.passed, true);
    assert.equal(result.distinctCount, 3);
  });

  test('con una sola variante, no aplica (nada que comparar)', () => {
    const result = checkCtaDiversityAcrossExperiment(['CTA única']);
    assert.equal(result.passed, true);
  });
});

describe('checkSocialNative', () => {
  test('advierte cuando no hay ningún marcador de ritmo social-nativo (ninguna línea corta, sin pregunta, sin pausa, sin emoji)', () => {
    const result = checkSocialNative({
      hook: 'Este producto real cuenta con ingredientes documentados en la ficha completa del catálogo oficial disponible.',
      bodyLines: ['Este producto tiene ingredientes reales documentados en la ficha del catalogo completo del producto real disponible.'],
      cta: 'El contacto real está disponible por el canal oficial de comunicación de la marca.',
    });
    assert.equal(result.passed, false);
  });

  test('pasa con una pregunta presente', () => {
    const result = checkSocialNative({ hook: '¿Te ha pasado?', bodyLines: ['Cuerpo real.'], cta: 'CTA real.' });
    assert.equal(result.passed, true);
  });

  test('pasa con un emoji presente', () => {
    const result = checkSocialNative({ hook: 'Mira esto 👀', bodyLines: ['Cuerpo real.'], cta: 'CTA real.' });
    assert.equal(result.passed, true);
  });

  test('advierte sobre bloques demasiado densos (>25 palabras sin pausa)', () => {
    const lineaLarga = new Array(30).fill('palabra').join(' ');
    const result = checkSocialNative({ hook: '¿Pregunta?', bodyLines: [lineaLarga], cta: 'CTA.' });
    assert.equal(result.passed, false);
    assert.match(result.warnings.join(' '), /densa|palabras/);
  });
});

describe('runCreativeQualityGate — integración por variante', () => {
  test('una variante real y limpia pasa con score 100', () => {
    const result = runCreativeQualityGate({
      hook: '¿mantener una rutina consistente?',
      primaryText: '¿mantener una rutina consistente? Baja masa muscular y envejecimiento prematuro. Divina Ripped Capsules incluye Tongkat Ali. Aporta al aumento de la musculatura. Escríbenos por WhatsApp.',
      cta: 'Escríbenos por WhatsApp.',
      bodyLines: ['Baja masa muscular y envejecimiento prematuro.', 'Divina Ripped Capsules incluye Tongkat Ali.', 'Aporta al aumento de la musculatura.'],
      sectionsUsed: [{ section: 'problem', sourceField: 'problema' }, { section: 'mechanism', sourceField: 'ingredientes' }, { section: 'productReveal', sourceField: 'beneficios' }],
      facts: FACTS,
    });
    assert.equal(result.passed, true);
    assert.equal(result.score, 100);
    assert.deepEqual([...result.issues], []);
  });

  test('una variante con claim repetido falla (passed:false) con issue explícito', () => {
    const result = runCreativeQualityGate({
      hook: 'Hook real.',
      primaryText: `${FACTS.beneficios}. Divina Ripped Capsules: ${FACTS.beneficios}.`,
      cta: 'CTA real.',
      bodyLines: [`${FACTS.beneficios}.`, `Divina Ripped Capsules: ${FACTS.beneficios}.`],
      sectionsUsed: [{ section: 'mechanism', sourceField: 'beneficios' }, { section: 'productReveal', sourceField: 'beneficios' }],
      facts: FACTS,
    });
    assert.equal(result.passed, false);
    assert.ok(result.issues.length > 0);
  });

  test('warnings nunca bloquean (passed puede ser true con warnings presentes)', () => {
    const result = runCreativeQualityGate({
      hook: 'Este producto real está formulado con ingredientes documentados en la ficha oficial completa.',
      primaryText: 'Este producto real está formulado con ingredientes documentados en la ficha oficial completa. Divina Ripped Capsules incluye Tongkat Ali real. Escríbenos por WhatsApp para conocer más información sobre el producto real disponible.',
      cta: 'Escríbenos por WhatsApp para conocer más información sobre el producto real disponible.',
      bodyLines: ['Divina Ripped Capsules incluye Tongkat Ali real.'],
      sectionsUsed: [{ section: 'mechanism', sourceField: 'ingredientes' }],
      facts: FACTS,
    });
    assert.equal(result.passed, true);
    assert.ok(result.warnings.length > 0); // sin pregunta/emoji/pausa/fragmento corto -> warning real, no bloqueante.
  });
});

describe('runExperimentQualityGate — a nivel de experimento completo', () => {
  test('detecta CTA idéntico entre variantes de UN experimento', () => {
    const result = runExperimentQualityGate([{ cta: 'Escríbenos por WhatsApp.' }, { cta: 'Escríbenos por WhatsApp.' }, { cta: 'Escríbenos por WhatsApp.' }]);
    assert.equal(result.passed, false);
  });

  test('pasa cuando el experimento real tiene CTAs distintas', () => {
    const result = runExperimentQualityGate([{ cta: 'CTA A' }, { cta: 'CTA B' }, { cta: 'CTA C' }]);
    assert.equal(result.passed, true);
  });
});
