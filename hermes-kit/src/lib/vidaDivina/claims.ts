// claims.ts — Política de claims real para Hermes: PRODUCT_FACT vs
// MARKETING_CLAIM.
//
// NO crea un segundo motor de clasificación. Reutiliza EXACTAMENTE
// content-strategy/src/claimClassification.js#classifyClaim (Fase 15) --
// el mismo clasificador ya usado para auditar contenido de marketing
// generado, con el mismo orden de precedencia (causalidad/certeza
// inventada > lenguaje fisiológico > CTA/pregunta > hecho respaldado >
// lenguaje de marketing genérico) y el mismo guard fisiológico
// (physiologicalClaimGuard.js, vía classifyClaim). No se duplica ni se
// reimplementa esa lógica aquí.
//
// La única pieza nueva es el adaptador productFacts: content-strategy
// solo tenía curado a mano TEDIVINA_PRODUCT_FACTS (un producto). Hermes
// necesita poder verificar un claim contra CUALQUIERA de los productos
// reales del catálogo -- así que se construye, en caliente y por producto
// consultado, un ProductFact por línea real no vacía del markdown fuente
// (docs/productos/**/*.md, vía getProductKnowledge -- la misma fuente de
// verdad de esta fase), usando createProductFact() (también reutilizado
// de content-strategy/src/productTruth.js, validación intacta) en vez de
// curar 66 productos a mano.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPO_ROOT, getProductKnowledge } from "./productKnowledge";

const CLAIM_CLASSIFICATION_PATH = path.join(REPO_ROOT, "content-strategy", "src", "claimClassification.js");
const PRODUCT_TRUTH_PATH = path.join(REPO_ROOT, "content-strategy", "src", "productTruth.js");

let _classifyClaim: ((args: { text: string; productFacts: unknown[]; isCta?: boolean }) => { text: string; category: string; reasoning: string; supporting_fact_id?: string }) | null = null;
let _createProductFact: ((args: { product_ref: string; field: string; value: string; source_document: string; field_in_document?: string }) => unknown) | null = null;

async function loadClassifier() {
  if (!_classifyClaim) {
    const mod: any = await import(pathToFileURL(CLAIM_CLASSIFICATION_PATH).href);
    _classifyClaim = mod.classifyClaim;
  }
  return _classifyClaim!;
}

async function loadProductTruth() {
  if (!_createProductFact) {
    const mod: any = await import(pathToFileURL(PRODUCT_TRUTH_PATH).href);
    _createProductFact = mod.createProductFact;
  }
  return _createProductFact!;
}

/** Construye un ProductFact real (validado) por cada línea sustancial del markdown fuente de un producto -- nunca inventa contenido, solo indexa lo que ya existe en docs/productos/. */
async function buildProductFactsFromMarkdown(productoId: string, titulo: string, contenidoMarkdown: string, rutaFuente: string): Promise<unknown[]> {
  const createFact = await loadProductTruth();
  const lineas = contenidoMarkdown
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length >= 8 && !/^\s*$/.test(l));

  const facts: unknown[] = [];
  lineas.forEach((linea, i) => {
    try {
      facts.push(createFact({
        product_ref: titulo,
        field: `linea_${i}`,
        value: linea,
        source_document: rutaFuente,
        field_in_document: `${productoId} línea ${i}`,
      }));
    } catch {
      // línea vacía/degenerada tras el recorte -- createProductFact la rechaza, se omite sin romper el resto.
    }
  });
  return facts;
}

export type ClaimVerdict =
  | { approved: true; category: string; reasoning: string; groundedIn?: string }
  | { approved: false; category: string; reasoning: string };

const CATEGORIAS_SEGURAS = new Set(["SUPPORTED_PRODUCT_FACT", "MARKETING_LANGUAGE", "CTA", "QUESTION", "OPINION"]);

/**
 * getApprovedClaim(productQuery, claimText) -- la tool real que Hermes debe
 * llamar antes de afirmar algo específico sobre un producto (ingrediente,
 * beneficio, mecanismo, etc.) que no sea un dato ya literal de
 * getProductKnowledge. Nunca aprueba un claim fisiológico/causal sin
 * respaldo real en el catálogo -- ante la duda, HEALTH_CLAIM_REQUIRES_REVIEW
 * o UNSUPPORTED_CLAIM, nunca aprobado.
 */
export async function getApprovedClaim(productQuery: string, claimText: string): Promise<ClaimVerdict> {
  const producto = await getProductKnowledge(productQuery);
  if (!producto.found) {
    return { approved: false, category: "SIN_PRODUCTO", reasoning: producto.reason };
  }

  const [classify, productFacts] = await Promise.all([
    loadClassifier(),
    buildProductFactsFromMarkdown(producto.productId, producto.titulo, producto.contenidoMarkdown, producto.rutaFuente),
  ]);

  const result = classify({ text: claimText, productFacts });

  if (CATEGORIAS_SEGURAS.has(result.category)) {
    return { approved: true, category: result.category, reasoning: result.reasoning, groundedIn: producto.rutaFuente };
  }
  return { approved: false, category: result.category, reasoning: result.reasoning };
}
