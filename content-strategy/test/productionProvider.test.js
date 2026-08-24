import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RuleBasedContentGenerator } from '../src/productionProvider.js';

const productContext = { product_name: 'TéDivina', problem: 'la desintoxicación previa a un programa de pérdida de peso', ingredients: ['malva', 'mirra', 'cardo bendito', 'chaga'] };

function gen(overrides = {}) {
  const generator = new RuleBasedContentGenerator();
  return generator.generate({ hookVariant: 'QUESTION', angle: 'educación', format: 'slideshow', pillar: 'EDUCATION', objective: 'objetivo de prueba', productContext, ...overrides });
}

describe('RuleBasedContentGenerator — reutiliza LLMProvider como clase base (§7)', () => {
  test('el generador ES una instancia de LLMProvider', async () => {
    const { LLMProvider } = await import('../../marketing-intelligence/src/llm/llmProvider.js');
    assert.ok(new RuleBasedContentGenerator() instanceof LLMProvider);
  });

  test('genera hook/body/scene_structure a partir de la combinación completa', () => {
    const result = gen();
    assert.ok(result.hook.length > 0);
    assert.ok(result.body.includes('TéDivina'));
    assert.ok(Array.isArray(result.scene_structure));
    assert.equal(result.generation_method, 'rule_based_template');
  });

  test('rechaza generar sin PRIMARY PRODUCT CONTEXT real', () => {
    const generator = new RuleBasedContentGenerator();
    assert.throws(() => generator.generate({ hookVariant: 'QUESTION', angle: 'educación', format: 'slideshow', pillar: 'EDUCATION', objective: 'x', productContext: null }));
  });

  test('rechaza un hookVariant inválido y un angle no respaldado', () => {
    assert.throws(() => gen({ hookVariant: 'INVENTADO' }));
    assert.throws(() => gen({ angle: 'descubrimiento' })); // no respaldado por ningún detector real (§4)
  });
});

describe('Diferenciación real (§2, Fase 14) — hook+angle+format+pillar+objective, no solo hookVariant', () => {
  test('mismo hookVariant, distinto angle/format/pillar → hook, body y scene_structure DISTINTOS', () => {
    const a = gen({ hookVariant: 'QUESTION', angle: 'educación', format: 'slideshow', pillar: 'EDUCATION' });
    const b = gen({ hookVariant: 'QUESTION', angle: 'comparación', format: 'short_video', pillar: 'PRODUCT_CONTEXT' });
    assert.notEqual(a.hook, b.hook);
    assert.notEqual(a.body, b.body);
    assert.notEqual(JSON.stringify(a.scene_structure), JSON.stringify(b.scene_structure));
  });

  test('mismo angle/format/pillar, distinto hookVariant → hook distinto', () => {
    const a = gen({ hookVariant: 'QUESTION' });
    const b = gen({ hookVariant: 'MYTH' });
    assert.notEqual(a.hook, b.hook);
  });

  test('la estructura (scene_structure) depende del formato (§5)', () => {
    const slideshow = gen({ format: 'slideshow' });
    const staticFormat = gen({ format: 'static' });
    assert.equal(slideshow.scene_structure.length, 5);
    assert.equal(staticFormat.scene_structure.length, 3);
    assert.notEqual(slideshow.scene_structure.map((s) => s.block).join(','), staticFormat.scene_structure.map((s) => s.block).join(','));
  });
});

describe('PATTERN != COPY (§8, reforzado con múltiples fuentes)', () => {
  test('rechaza si el texto generado reproduce un fragmento largo de CUALQUIERA de varias fuentes externas similares', () => {
    const externalExampleTexts = [
      'Do Detox Teas Really Work? Dietitian Reviews and honest opinions from real users everywhere',
      '14 Day Detox Fit Tea Review honest opinions from real users everywhere on this topic',
    ];
    assert.throws(() => {
      const generator = new RuleBasedContentGenerator();
      generator.generate({
        hookVariant: 'QUESTION', angle: 'educación', format: 'slideshow', pillar: 'EDUCATION', objective: 'x',
        productContext: { ...productContext, problem: 'Dietitian Reviews and honest opinions from real users everywhere sobre el tema' },
        externalExampleTexts,
      });
    });
  });

  test('una pieza real, transformada con hechos del producto, no coincide con ninguna fuente externa similar', () => {
    const externalExampleTexts = ['Do Detox Teas Really Work? Dietitian Reviews', '14 Day Detox: Fit Tea Review'];
    const result = gen({ externalExampleTexts });
    const fullText = (result.hook + ' ' + result.body).toLowerCase();
    assert.doesNotMatch(fullText, /do detox teas really work/);
    assert.doesNotMatch(fullText, /14 day detox/);
  });
});
