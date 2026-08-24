import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicCopyProvider, AnthropicCopyProvider } from '../src/copyGenerationProvider.js';

const STRATEGIC_DIRECTION_REAL = Object.freeze({
  persona: { name: 'La de Estreñimiento Crónico con Miedo a Depender' },
  pain: { painPoint: 'Miedo a depender del laxante.' },
  angle: { angleText: 'También existen formas de apoyar el tránsito intestinal', scriptDirection: 'Reencuadrar sin diagnosticar, a nivel de categoría.' },
  hookDirection: '"¿Sabías que también existen formas de apoyar tu tránsito?" — pregunta directa.',
  mechanismEntry: 'NOT_ESTABLISHED.',
  productFacts: { nombreComercial: 'TéDivina', beneficios: 'Mejora el tránsito intestinal; promueve la energía.' },
});

describe('DeterministicCopyProvider — determinista, sin red, seguro para tests', () => {
  test('produce hook/script/cta reales a partir de campos reales, nunca inventa', async () => {
    const provider = new DeterministicCopyProvider();
    const r = await provider.generate(STRATEGIC_DIRECTION_REAL);
    assert.equal(r.mode, 'deterministic');
    assert.ok(r.hook.includes('apoyar tu tránsito'));
    assert.ok(r.script.some((l) => l.includes('TéDivina')));
    assert.ok(r.cta.length > 0);
  });

  test('un campo NOT_ESTABLISHED nunca se muestra como copy real', async () => {
    const provider = new DeterministicCopyProvider();
    const r = await provider.generate(STRATEGIC_DIRECTION_REAL);
    const todoElTexto = [r.hook, ...r.script, r.cta].join(' ');
    assert.doesNotMatch(todoElTexto, /NOT_ESTABLISHED/);
  });

  test('es determinista: misma entrada -> mismo resultado', async () => {
    const provider = new DeterministicCopyProvider();
    const r1 = await provider.generate(STRATEGIC_DIRECTION_REAL);
    const r2 = await provider.generate(STRATEGIC_DIRECTION_REAL);
    assert.deepEqual(r1.hook, r2.hook);
    assert.deepEqual(r1.script, r2.script);
  });

  test('genera N variantes cuando se pide variantCount > 1, sin fabricar contenido nuevo', async () => {
    const provider = new DeterministicCopyProvider();
    const r = await provider.generate({ ...STRATEGIC_DIRECTION_REAL, variantCount: 2 });
    assert.equal(r.variants.length, 2);
  });

  test('rechaza un claim prohibido si apareciera en un campo real (defensa en profundidad)', async () => {
    const provider = new DeterministicCopyProvider();
    await assert.rejects(
      provider.generate({ ...STRATEGIC_DIRECTION_REAL, hookDirection: '"Esto cura todo" — directo.' }),
      /claim prohibido/,
    );
  });
});

describe('AnthropicCopyProvider — real opcional, CONFIGURATION_REQUIRED si falta credencial', () => {
  test('sin ANTHROPIC_API_KEY: lanza explícito, nunca intenta red', async () => {
    const provider = new AnthropicCopyProvider({ apiKey: null, fetchImpl: async () => { throw new Error('NO DEBE LLAMARSE'); } });
    await assert.rejects(provider.generate(STRATEGIC_DIRECTION_REAL), /REQUIERE CREDENCIAL/);
  });

  test('con API key inyectada (fetch simulado): produce copy real desde la respuesta del modelo', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ hook: 'Hook real', script: ['línea 1'], cta: 'CTA real' }) }] }),
    });
    const provider = new AnthropicCopyProvider({ apiKey: 'sk-test', fetchImpl });
    const r = await provider.generate(STRATEGIC_DIRECTION_REAL);
    assert.equal(r.mode, 'real');
    assert.equal(r.hook, 'Hook real');
    assert.equal(r.cta, 'CTA real');
  });

  test('respuesta HTTP no-ok: lanza con el status real', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'error interno' });
    const provider = new AnthropicCopyProvider({ apiKey: 'sk-test', fetchImpl });
    await assert.rejects(provider.generate(STRATEGIC_DIRECTION_REAL), /500/);
  });
});
