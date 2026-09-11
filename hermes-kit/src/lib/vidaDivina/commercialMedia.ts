// commercialMedia.ts — Testimonios/contenido comercial real para Hermes.
//
// Reutiliza EXACTAMENTE commercial-media/src/selector.js (ya construido,
// probado, y explícitamente documentado como "listo para conectar" --
// ver selector.js: "el commercial engine real... NO se modifica ni se
// conecta todavía a estas funciones -- la conexión real queda para una
// fase posterior"). Esta es esa fase: Hermes es el primer consumidor real.
// Nunca reimplementa el ranking/clasificación -- solo llama a
// selectCommercialMedia() y traduce el resultado a lo que necesitan las
// tools de Hermes (ruta real del archivo, nunca contenido inventado).

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPO_ROOT } from "./productKnowledge";

const SELECTOR_PATH = path.join(REPO_ROOT, "commercial-media", "src", "selector.js");

interface CommercialMediaRecord {
  mediaId: string;
  displayName: string;
  filePath: string;
  mediaType: string;
  businessIntent: string;
  productId: string | null;
  needTags: string[];
  audience: string | null;
  language: string | null;
  classificationConfidence: string;
  active: boolean;
}

let _selectCommercialMedia: ((criteria: Record<string, unknown>) => CommercialMediaRecord | "NO_MATCH") | null = null;
async function selector() {
  if (!_selectCommercialMedia) {
    const mod: any = await import(pathToFileURL(SELECTOR_PATH).href);
    _selectCommercialMedia = mod.selectCommercialMedia;
  }
  return _selectCommercialMedia!;
}

const STORE_PATH = path.join(REPO_ROOT, "commercial-media", "src", "commercialMediaStore.js");
let _listCommercialMedia: (() => CommercialMediaRecord[]) | null = null;
async function store() {
  if (!_listCommercialMedia) {
    const mod: any = await import(pathToFileURL(STORE_PATH).href);
    _listCommercialMedia = mod.listCommercialMedia;
  }
  return _listCommercialMedia!;
}

function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export type CommercialMediaResult =
  | { found: true; mediaId: string; displayName: string; mediaType: string; filePath: string; fileExists: boolean }
  | { found: false; reason: string };

function toResult(record: CommercialMediaRecord | "NO_MATCH"): CommercialMediaResult {
  if (record === "NO_MATCH") {
    return { found: false, reason: "No hay contenido comercial real aprobado que coincida con esos criterios." };
  }
  const absPath = path.isAbsolute(record.filePath) ? record.filePath : path.join(REPO_ROOT, record.filePath);
  return {
    found: true,
    mediaId: record.mediaId,
    displayName: record.displayName,
    mediaType: record.mediaType,
    filePath: absPath,
    fileExists: fs.existsSync(absPath),
  };
}

/**
 * Busca contenido comercial real (explicaciones de producto, contenido de
 * marca, material de distribución) -- criterios exactamente los mismos que
 * ya define selector.js, nunca inventados aquí.
 */
export async function searchCommercialMedia(criteria: {
  productId?: string;
  businessIntent?: "CONSUMPTION" | "DISTRIBUTION" | "GENERAL";
  needTags?: string[];
  audience?: "female" | "male" | "general";
  mediaType?: string;
}): Promise<CommercialMediaResult> {
  const fn = await selector();
  return toResult(fn(criteria));
}

/**
 * Busca específicamente un TESTIMONIO real (mediaType: VIDEO_TESTIMONIAL,
 * businessIntent: CONSUMPTION) -- nunca inventa un testimonio ni narra uno
 * a partir de memoria del modelo.
 */
/**
 * Resuelve un ASSET real por su nombre semántico (ej. "explicacion-te-divina",
 * el mismo nombre que el generador de voz del Dashboard asigna al guardarlo
 * -- FASE "Voice Engine automático + generador de voz"). Nunca depende de un
 * ID técnico ni de una ruta física hardcodeada: busca por displayName
 * normalizado contra el Commercial Media Registry real, el MISMO registry
 * que ya usan searchTestimonials/searchCommercialMedia -- nunca un segundo
 * mecanismo de resolución.
 */
export async function findAssetByName(nombre: string): Promise<CommercialMediaResult> {
  const listAll = await store();
  const objetivo = normalizeName(nombre);
  const encontrado = listAll().find((r) => r.active && normalizeName(r.displayName) === objetivo);
  return toResult(encontrado ?? "NO_MATCH");
}

/**
 * Un testimonio SOLO se entrega si está explícitamente asociado al MISMO
 * producto solicitado -- nunca se reutiliza un testimonio genérico
 * (productId: null) ni el de otro producto como si fuera prueba social de
 * este. selector.js acepta productId:null como candidato válido a propósito
 * (es correcto para contenido genérico vía searchCommercialMedia), pero para
 * testimonios esa flexibilidad es justo el bug: sin este check, un producto
 * sin testimonio real (ej. Ripped Capsules) recibía el testimonio de OTRO
 * producto (Hígado Graso) porque el ranking lo aceptaba como "compatible".
 * Esta validación ocurre en código, nunca depende de que el LLM decida bien.
 */
export async function searchTestimonials(criteria: {
  productId?: string;
  needTags?: string[];
  audience?: "female" | "male" | "general";
}): Promise<CommercialMediaResult> {
  const fn = await selector();
  const record = fn({ ...criteria, businessIntent: "CONSUMPTION", mediaType: "VIDEO_TESTIMONIAL" });

  if (criteria.productId !== undefined) {
    if (record === "NO_MATCH" || record.productId !== criteria.productId) {
      return {
        found: false,
        reason: "NO_TESTIMONIAL_FOR_PRODUCT: no existe un testimonio real validado explícitamente asociado a este producto.",
      };
    }
  }

  return toResult(record);
}
