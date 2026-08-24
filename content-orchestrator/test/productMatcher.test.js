// productMatcher.test.js — resolveProductIdFromCanonicalId (Fase 17,
// corrección raíz: Crear Autónomo debe poder resolver un producto real por
// identidad estructurada, no solo por texto libre). Usa datos REALES ya
// persistidos en docs/productos/ y assets/products/ -- ningún fixture
// inventado, mismo criterio que autonomousCreate.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProductIdFromCanonicalId, resolveProductIdFromText } from '../src/productMatcher.js';

describe('resolveProductIdFromCanonicalId — identidad estructurada real', () => {
  test('resuelve TéDivina real por su productId real de docs/productos/ (tedivina)', () => {
    const r = resolveProductIdFromCanonicalId('tedivina');
    assert.ok(r);
    assert.equal(r.nombreComercial, 'TéDivina');
    assert.equal(r.matchedOn, 'productId');
  });

  test('resuelve TéDivina real por el slug REAL de la carpeta de assets (te-divina, distinto del archivo docs tedivina.md) -- misma tolerancia real que ya usa loadProductFacts()', () => {
    const r = resolveProductIdFromCanonicalId('te-divina');
    assert.ok(r);
    assert.equal(r.nombreComercial, 'TéDivina');
  });

  // Corrección de identidad (Fase 18): las 3 fotos reales de
  // "Tongkat Ali" SÍ pertenecen a un producto real -- "Café Divina
  // Tongkat Ali" (docs/productos/02-cafe-divina/tongkat-ali-cafe.md,
  // confirmado por evidencia fotográfica real: el empaque dice
  // literalmente "Café Tongkat Ali" / "Performance Enhancing Coffee").
  // La carpeta assets/products/ ya se renombró a su productId real
  // (tongkat-ali-cafe) -- nunca existió ni existe un producto
  // independiente llamado "Tongkat Ali" a secas.
  test('resuelve Café Divina Tongkat Ali real por su productId canónico (tongkat-ali-cafe, mismo nombre que la carpeta real de assets ya vinculada)', () => {
    const r = resolveProductIdFromCanonicalId('tongkat-ali-cafe');
    assert.ok(r);
    assert.equal(r.nombreComercial, 'Café Divina Tongkat Ali');
    assert.equal(r.matchedOn, 'productId');
  });

  test('"Tongkat Ali" a secas NUNCA resuelve como producto independiente -- no existe en docs/productos/ (nunca se sustituye por ninguno de los 4 productos reales que lo mencionan)', () => {
    assert.equal(resolveProductIdFromCanonicalId('Tongkat Ali'), null);
    assert.equal(resolveProductIdFromCanonicalId('tongkat-ali'), null);
  });

  test('un productId sin hechos reales en docs/productos/ -- null explícito, nunca inventa ni aproxima', () => {
    assert.equal(resolveProductIdFromCanonicalId('producto-de-prueba-sin-catalogo-vinculado'), null);
  });

  test('vacío/null -- null explícito', () => {
    assert.equal(resolveProductIdFromCanonicalId(''), null);
    assert.equal(resolveProductIdFromCanonicalId(null), null);
  });

  test('un productId inventado que no corresponde a ninguna carpeta ni archivo real -- null explícito', () => {
    assert.equal(resolveProductIdFromCanonicalId('producto-que-no-existe-en-ningun-lado'), null);
  });

  test('resolveProductIdFromText sigue intacta (compatibilidad) -- texto libre real sigue resolviendo TéDivina', () => {
    const r = resolveProductIdFromText('Necesito contenido de TéDivina para Instagram');
    assert.ok(r);
    assert.equal(r.nombreComercial, 'TéDivina');
  });
});
