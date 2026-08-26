// productMatcher.js — Autonomous CREATE, paso 0: resuelve qué producto real
// (docs/productos/) menciona un userIntent en prosa libre ("Crear una
// campaña para TéDivina...") ANTES de poder llamar a campaignMode.js (que
// ya exige un productId real explícito). Mismo espíritu que
// campaignMode.js#normalizarPalabras: comparación determinista de texto
// normalizado, nunca comprensión semántica -- si ningún producto real
// aparece mencionado, se rechaza explícitamente en vez de adivinar.

import { listAllProductSlugs, loadProductFacts } from './productFactsLoader.js';

/**
 * Resuelve un producto real a partir de un identificador ESTRUCTURADO ya
 * elegido por quien llama (ej. el productId real que ya lista /api/products
 * en el dashboard, el mismo que ya usa handleCreate para /api/create) --
 * nunca texto libre. A diferencia de resolveProductIdFromText() (búsqueda
 * por coincidencia de texto), esta función es una identidad exacta: delega
 * 100% en loadProductFacts() (mismo gateway real que ya usan
 * dashboard/server/lib/productCatalog.js y campaignMode.js) para su
 * tolerancia real de mayúsculas/espacios/guiones -- nunca reimplementa esa
 * normalización, nunca inventa un producto sin hechos reales en
 * docs/productos/.
 *
 * @param {string} productId
 * @returns {{productId:string, nombreComercial:string|null, matchedOn:string}|null}
 */
export function resolveProductIdFromCanonicalId(productId) {
  if (!productId?.trim()) return null;
  try {
    const facts = loadProductFacts(productId);
    return Object.freeze({ productId, nombreComercial: facts.nombreComercial, nombreVisible: facts.nombreVisible, matchedOn: 'productId' });
  } catch {
    return null; // sin hechos reales en docs/productos/ para este productId -- nunca se inventa.
  }
}

function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca, entre TODOS los productos reales de docs/productos/, aquel cuyo
 * nombreComercial real (o su slug de archivo) aparezca mencionado
 * literalmente dentro del userIntent -- nunca infiere un producto que no
 * fue nombrado. Si más de un producto real coincide, se prefiere la
 * coincidencia más larga (más específica) -- p.ej. "CX90" no debe ganarle a
 * un nombre compuesto más específico que también aparezca.
 *
 * @param {string} userIntent
 * @returns {{productId:string, nombreComercial:string, matchedOn:string}|null}
 */
export function resolveProductIdFromText(userIntent) {
  const textoNormalizado = normalizar(userIntent);
  if (!textoNormalizado) return null;

  const slugs = listAllProductSlugs();
  const candidatos = [];

  for (const slug of slugs) {
    let facts;
    try {
      facts = loadProductFacts(slug);
    } catch {
      continue; // producto sin catálogo real legible -- se ignora, no se inventa.
    }
    const nombreNormalizado = normalizar(facts.nombreComercial ?? '');
    const slugNormalizado = normalizar(slug);

    if (nombreNormalizado && textoNormalizado.includes(nombreNormalizado)) {
      candidatos.push({ productId: slug, nombreComercial: facts.nombreComercial, nombreVisible: facts.nombreVisible, matchedOn: nombreNormalizado, len: nombreNormalizado.length });
    } else if (slugNormalizado && textoNormalizado.replace(/\s+/g, '').includes(slugNormalizado.replace(/\s+/g, ''))) {
      candidatos.push({ productId: slug, nombreComercial: facts.nombreComercial, nombreVisible: facts.nombreVisible, matchedOn: slugNormalizado, len: slugNormalizado.length });
    }
  }

  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => b.len - a.len);
  return Object.freeze({ productId: candidatos[0].productId, nombreComercial: candidatos[0].nombreComercial, nombreVisible: candidatos[0].nombreVisible, matchedOn: candidatos[0].matchedOn });
}
