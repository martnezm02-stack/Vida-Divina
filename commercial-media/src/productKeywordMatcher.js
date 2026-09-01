// productKeywordMatcher.js — Commercial Media: reconocimiento de producto
// desde nombre de archivo (encargo §8, §40). Reutiliza EXCLUSIVAMENTE el
// catálogo real ya existente (content-orchestrator/src/productFactsLoader.js
// -- el mismo que ya usa productMatcher.js/dashboard) -- nunca una segunda
// lista de productos hardcodeada.
//
// productMatcher.js#resolveProductIdFromText() ya existe pero exige que el
// NOMBRE COMERCIAL COMPLETO aparezca literal en el texto (diseñado para
// userIntent en prosa: "Crear una campaña para TéDivina..."). Un nombre de
// archivo como "Venus_menopausia_testimonio.mp4" solo trae una palabra
// clave corta -- se necesita coincidencia por PALABRA CLAVE distintiva, no
// por frase completa. Este archivo NO reemplaza resolveProductIdFromText(),
// resuelve un caso distinto (texto corto/keyword vs. prosa completa).

import { listAllProductSlugs, loadProductFacts } from '../../content-orchestrator/src/productFactsLoader.js';

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "[Longevidad y Bienestar General](./index.md)" -> "Longevidad y Bienestar General" -- mismo campo real de docs/productos/, solo se retira la sintaxis de enlace markdown. */
function stripMarkdownLink(text) {
  const m = /^\[([^\]]+)\]\([^)]+\)$/.exec(String(text ?? '').trim());
  return m ? m[1] : (text ?? null);
}

export function tokenize(text) {
  return normalize(text).split(' ').filter(Boolean);
}

// Palabras reales del catálogo demasiado genéricas para identificar UN
// producto por sí solas (aparecen en decenas de nombres reales) -- lista
// explícita y auditable, nunca un umbral de longitud arbitrario.
const GENERIC_CATALOG_TOKENS = new Set([
  'capsulas', 'capsules', 'cafe', 'divina', 'divino', 'vida', 'extracto', 'te', 'formula',
]);

function productKeywords(slug, facts) {
  const tokens = new Set();
  for (const raw of [slug.replace(/-/g, ' '), facts.nombreVisible, facts.nombreComercial]) {
    for (const t of tokenize(raw)) {
      if (!GENERIC_CATALOG_TOKENS.has(t)) tokens.add(t);
    }
  }
  return tokens;
}

let _catalogCache = null;
function loadCatalogKeywords() {
  if (_catalogCache) return _catalogCache;
  const entries = [];
  for (const slug of listAllProductSlugs()) {
    let facts;
    try {
      facts = loadProductFacts(slug);
    } catch {
      continue; // sin hechos reales -- se ignora, nunca se inventa un producto (mismo criterio que productMatcher.js).
    }
    entries.push({ productId: slug, nombreVisible: facts.nombreVisible, category: stripMarkdownLink(facts.camposReales?.['Categoría']), keywords: productKeywords(slug, facts) });
  }
  _catalogCache = entries;
  return entries;
}

/** Solo para tests: fuerza a releer docs/productos/ en la siguiente llamada (ej. tras registrar un producto nuevo en la misma corrida de test). */
export function resetProductKeywordCache() {
  _catalogCache = null;
}

/** Categoría real del catálogo (docs/productos/) para un productId ya resuelto -- null si el producto no existe o no tiene categoría real documentada. */
export function categoryForProduct(productId) {
  return loadCatalogKeywords().find((e) => e.productId === productId)?.category ?? null;
}

/** nombreVisible real del catálogo para un productId ya resuelto -- null si no existe. */
export function nombreVisibleForProduct(productId) {
  return loadCatalogKeywords().find((e) => e.productId === productId)?.nombreVisible ?? null;
}

/**
 * Busca, entre TODOS los productos reales del catálogo, cuál coincide con
 * más palabras clave distintivas del nombre de archivo dado. Nunca infiere
 * un producto no evidenciado: si ningún producto coincide, o si dos o más
 * empatan en especificidad, devuelve match:false (ambiguo/no encontrado) --
 * la decisión de NEEDS_METADATA la toma el classifier, no este módulo.
 *
 * @param {string} filenameOrText
 * @returns {{match:true, productId:string, nombreVisible:string, matchedKeywords:string[]} | {match:false, ambiguous:boolean, candidates:Array}}
 */
export function matchProductFromFilename(filenameOrText) {
  const fileTokens = new Set(tokenize(filenameOrText));
  const scored = [];
  for (const entry of loadCatalogKeywords()) {
    const matched = [...entry.keywords].filter((k) => fileTokens.has(k));
    if (matched.length > 0) scored.push({ ...entry, matchCount: matched.length, matchedKeywords: matched });
  }
  if (scored.length === 0) return Object.freeze({ match: false, ambiguous: false, candidates: [] });

  scored.sort((a, b) => b.matchCount - a.matchCount);
  const top = scored[0];
  const tied = scored.filter((s) => s.matchCount === top.matchCount);
  if (tied.length > 1) {
    return Object.freeze({ match: false, ambiguous: true, candidates: Object.freeze(tied.map((t) => t.productId)) });
  }
  return Object.freeze({ match: true, productId: top.productId, nombreVisible: top.nombreVisible, matchedKeywords: Object.freeze(top.matchedKeywords) });
}
