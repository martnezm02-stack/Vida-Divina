// productCatalog.js — Marketing Intelligence: mapeo productId -> category
// usado por ranking.js para determinar productFit. Mismos slugs que
// seedData/snapshot-2026-08-31.js (alineados con assets/products/<slug>/
// ya existente en el repo) y las mismas 5 categorías de producto usadas en
// las señales curadas -- no se inventa ninguna relación nueva aquí, solo
// se centraliza la que ya existe implícitamente en los datos.

export const PRODUCT_CATEGORY = Object.freeze({
  'tongkat-ali-cafe': 'cafe-divina',
  'sculpt-tongkat-ali': 'cafe-divina',
  'sculpt-black': 'cafe-divina',
  cappuccino: 'cafe-divina',
  'venus-capsules': 'intimidad-libido',
  'ripped-capsules': 'rendimiento-fisico',
  'mars-capsules': 'intimidad-libido',
  'extracto-tremella': 'extractos-hongos',
  'te-divina': 'control-de-peso',
});

export const PRODUCT_IDS = Object.freeze(Object.keys(PRODUCT_CATEGORY));

// Categorías que mapean 1:1 a una línea de producto -- una señal con una de
// estas categorías pero SIN productId pertenece a esa línea (fit CATEGORY),
// nunca a otra. Categorías fuera de esta lista (marca, mlm-oportunidad,
// mercado-general, regulatorio, comercio-social, contenido-hooks) son
// transversales por diseño y siempre elegibles como GENERAL para
// cualquier producto.
export const PRODUCT_SPECIFIC_CATEGORIES = Object.freeze([
  'cafe-divina', 'control-de-peso', 'intimidad-libido', 'rendimiento-fisico', 'extractos-hongos',
]);

export function getProductCategory(productId) {
  return PRODUCT_CATEGORY[productId] ?? null;
}
