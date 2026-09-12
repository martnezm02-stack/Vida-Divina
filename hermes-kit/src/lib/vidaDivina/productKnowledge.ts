// productKnowledge.ts — Fuente de verdad de producto para Hermes.
//
// Reutiliza el Knowledge Package YA COMPILADO (knowledge/compiled/,
// recommendation-engine/src/knowledgeLoader.js) para LOCALIZAR el producto
// correcto por nombre/palabra clave (índice real, ya construido, nunca
// reimplementado aquí) -- pero el índice compilado solo trae METADATA
// (título, palabras clave, relaciones), no el contenido completo. El
// CONTENIDO real (ingredientes, beneficios, precio, dosis...) se lee
// SIEMPRE del markdown original en `docs/productos/**/*.md`
// (`ruta_original` de la propia entidad compilada) -- exactamente la
// fuente de verdad que exige esta fase. Nunca se inventa, nunca se
// completa con IA: si algo no está en el archivo, se declara ausente.
//
// No crea un segundo Knowledge Engine: importa knowledgeLoader.js tal cual
// existe (recommendation-engine/), sin copiar su lógica. Ese módulo es
// JavaScript plano sin tipos propios -- se tipa localmente como `any` en el
// cruce, el resto de este archivo sí está tipado.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// hermes-kit/src/lib/vidaDivina/ -> raíz real del monorepo Vida Divina
// (hermes-kit/ vive como carpeta hermana de recommendation-engine/, docs/, etc.)
export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const KNOWLEDGE_LOADER_PATH = path.join(REPO_ROOT, "recommendation-engine", "src", "knowledgeLoader.js");

interface CompiledEntity {
  id: string;
  tipo_entidad: string;
  titulo: string;
  ruta_original: string;
  palabras_clave?: string[];
}
interface CompiledKnowledge {
  entityById: Map<string, CompiledEntity>;
  relationshipsByOrigin: Map<string, unknown[]>;
  manifest: unknown;
}

let _cache: CompiledKnowledge | null = null;
/**
 * Carga (una vez) el Knowledge Package compilado real, importando
 * recommendation-engine/src/knowledgeLoader.js tal cual existe (import()
 * dinámico por ruta absoluta -- hermes-kit/ y recommendation-engine/ son
 * paquetes hermanos sin workspaces npm compartidos). Nunca lo modifica ni
 * duplica su lógica.
 */
async function loadKnowledge(): Promise<CompiledKnowledge> {
  if (_cache) return _cache;
  const mod: any = await import(pathToFileURL(KNOWLEDGE_LOADER_PATH).href);
  _cache = mod.loadCompiledKnowledge();
  return _cache as CompiledKnowledge;
}

function normalize(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // quita acentos para comparar
}

// Artículos españoles al inicio de una consulta de producto ("el té",
// "las cápsulas...") -- se quitan antes de comparar, nunca cambian el
// resultado real, solo evitan que un artículo suelto rompa la coincidencia.
const ARTICULO_INICIAL = /^(el|la|los|las|un|una|unos|unas)\s+/i;
function quitarArticulo(s: string): string {
  const m = s.trim().match(ARTICULO_INICIAL);
  return m ? s.trim().slice(m[0].length) : s.trim();
}

// Colapsa espacios tras normalizar (hallazgo real, 2026-09-08): el título
// compilado de un producto puede escribirse SIN espacio ("TéDivina", tal
// cual su "Nombre comercial" real en docs/productos/) mientras que
// clientes/el propio modelo lo escriben CON espacio ("Té Divina", "té
// divina") -- un substring normalizado pero con espacios nunca calzaba.
// Comparar también la forma sin espacios hace la coincidencia tolerante a
// esa diferencia real de formato, sin tocar el dato fuente ni depender de
// otra ronda del LLM.
function colapsar(s: string): string {
  return normalize(s).replace(/\s+/g, "");
}

// Palabras GENÉRICAS de presentación (2026-09-11, hallazgo real:
// "capsulas ripped" no encontraba "Ripped Capsules"): términos que casi
// nunca DISTINGUEN un producto de otro en este catálogo -- a diferencia de
// "café"/"té" (que sí distinguen formato real entre variantes del mismo
// ingrediente, ej. Tongkat Ali, y por eso NUNCA se tratan como vacíos
// aquí). Incluye la forma inglesa "capsule(s)" porque el título real
// compilado usa esa palabra en inglés ("Ripped Capsules") mientras el
// cliente escribe en español ("cápsulas") -- misma palabra, mismo
// significado, solo cambia el idioma: no es un alias inventado.
const PALABRAS_VACIAS = new Set(["capsula", "capsulas", "capsule", "capsules", "producto", "productos"]);

function tokenizar(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Tokens SIGNIFICATIVOS de la consulta del cliente (sin palabras vacías). */
function tokenizarConsulta(s: string): string[] {
  return tokenizar(s).filter((t) => !PALABRAS_VACIAS.has(t));
}

// Fallback de tolerancia a errores tipográficos/de transcripción de voz
// (hallazgo real, 2026-09-11: "Ripet" -- transcripción real de Gemini de
// "Ripped" -- no resolvía contra "Ripped Capsules"; ninguna de las
// coincidencias de arriba tolera una diferencia de ortografía). Distancia
// de edición (Levenshtein) local, determinista, sin embeddings ni LLM.
const FUZZY_MIN_TOKEN_LEN = 4; // por debajo de esto, demasiado riesgo de falso positivo -- fuzzy desactivado

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = temp;
    }
  }
  return dp[n];
}

/** Umbral conservador por longitud de palabra -- cuanto más larga, un poco más de tolerancia. */
function umbralFuzzy(len: number): number {
  if (len < FUZZY_MIN_TOKEN_LEN) return 0;
  if (len <= 6) return 2;
  return 3;
}

/** Todas las entidades tipo "producto" del Knowledge Package real. */
async function allProducts(): Promise<CompiledEntity[]> {
  const { entityById } = await loadKnowledge();
  return [...entityById.values()].filter((e) => e.tipo_entidad === "producto");
}

export interface KnowledgeSearchHit {
  id: string;
  titulo: string;
  palabrasClave: string[];
}

/**
 * Busca productos reales por nombre/palabra clave ("searchKnowledge").
 * Coincidencia por substring normalizado contra `titulo` y `palabras_clave`
 * -- nunca por similitud semántica/embeddings (fuera del alcance de esta
 * fase, ver docs/PROJECT_STATE.md, Decisión Arquitectónica #5).
 */
export async function searchKnowledge(query: string, opts: { limit?: number } = {}): Promise<KnowledgeSearchHit[]> {
  const limit = opts.limit ?? 5;
  const consultaSinArticulo = quitarArticulo(query);
  const q = normalize(consultaSinArticulo);
  const qColapsada = colapsar(consultaSinArticulo);
  if (!q) return [];
  const products = await allProducts();
  // Tokens significativos UNA sola vez (reutilizados para todos los
  // productos) -- ver PALABRAS_VACIAS/tokenizarConsulta arriba.
  const qTokens = tokenizarConsulta(consultaSinArticulo);

  const scored: Array<{ score: number; entity: CompiledEntity }> = [];
  for (const p of products) {
    let score = 0;
    const tituloColapsado = colapsar(p.titulo);
    if (tituloColapsado === qColapsada) {
      // Coincidencia exacta (una vez quitados espacios/acentos/artículo) --
      // la señal más fuerte posible, desempata frente a matches parciales
      // de otros productos (ej. "TéDivina" exacto vs "Té Negro"/"Té Verde"
      // que solo comparten el prefijo "té").
      score += 50;
    } else if (tituloColapsado.includes(qColapsada) || qColapsada.includes(tituloColapsado)) {
      // Bidireccional: cubre tanto "título más largo que la consulta"
      // (título real "Sculpt Max" dentro de "cápsulas sculpt max") como
      // "consulta más larga que el título" (al revés) -- antes solo se
      // comprobaba una dirección, y solo sobre la forma CON espacios.
      score += 10;
    } else if (qTokens.length > 0 && qTokens.every((t) => tokenizar(p.titulo).includes(t))) {
      // Corrección real 2026-09-11 ("capsulas ripped" no encontraba
      // "Ripped Capsules"): coincidencia por CONJUNTO de palabras
      // significativas, insensible al ORDEN ("capsulas ripped" vs "Ripped
      // Capsules") y a los términos genéricos de presentación (ver
      // PALABRAS_VACIAS) -- el substring de arriba exige que la frase
      // aparezca LITERAL y en el mismo orden, y por eso no bastaba. Misma
      // fuerza que el match parcial de título (+10): cada palabra real de
      // la consulta debe aparecer completa en el título real, nunca al
      // revés (evita que un título corto matchee una consulta larga y no
      // relacionada).
      score += 10;
    }
    for (const kw of p.palabras_clave ?? []) {
      const kwNormalizada = normalize(kw);
      const kwColapsada = colapsar(kw);
      if (kwNormalizada === q) {
        // Coincidencia EXACTA de palabra clave (2026-09-10, actualización de
        // catálogo -- hallazgo real): "café tongkat ali" es palabra clave
        // literal de tongkat-ali-cafe.md, pero "tongkat ali" TAMBIÉN es
        // palabra clave de sculpt-tongkat-ali.md y matcheaba por substring
        // con el mismo score (+3) -- el empate lo resolvía el orden de
        // inserción del Knowledge Package, no la relevancia real, y a veces
        // devolvía el producto equivocado (Sculpt en vez del Tongkat Ali
        // base). Una coincidencia EXACTA de palabra clave es una señal
        // mucho más fuerte que una parcial: se puntúa igual que un match
        // parcial de TÍTULO (+10 no alcanzaría; se usa +20 para desempatar
        // con margen frente a cualquier match parcial simultáneo de otro
        // producto), sin llegar al +50 reservado para el título exacto.
        score += 20;
      } else if (kwNormalizada.includes(q) || q.includes(kwNormalizada) || kwColapsada.includes(qColapsada) || qColapsada.includes(kwColapsada)) {
        score += 3;
      } else if (qTokens.length > 0 && qTokens.every((t) => tokenizar(kw).includes(t))) {
        // Mismo criterio que el título (ver arriba): conjunto de palabras,
        // insensible a orden y a términos genéricos de presentación.
        score += 3;
      }
    }
    if (score > 0) scored.push({ score, entity: p });
  }

  // Fallback fuzzy (SOLO si ninguna coincidencia exacta/substring/conjunto
  // de tokens de arriba encontró NADA -- nunca compite con ellas, nunca
  // reordena un resultado ya válido). Prioriza título sobre palabras clave,
  // mismo criterio de pesos relativos que el resto del archivo (título más
  // fuerte que keyword), siempre por debajo de +10 para no poder superar
  // ninguna coincidencia real de las ramas anteriores si alguna vez se
  // combinaran.
  if (scored.length === 0 && qTokens.length > 0) {
    for (const p of products) {
      let score = 0;
      const tituloTokens = tokenizar(p.titulo);
      for (const qt of qTokens) {
        if (qt.length < FUZZY_MIN_TOKEN_LEN) continue;
        for (const tt of tituloTokens) {
          if (tt.length < FUZZY_MIN_TOKEN_LEN) continue;
          const dist = levenshtein(qt, tt);
          if (dist <= umbralFuzzy(Math.max(qt.length, tt.length))) {
            score = Math.max(score, 6 - dist);
          }
        }
        for (const kw of p.palabras_clave ?? []) {
          for (const kt of tokenizar(kw)) {
            if (kt.length < FUZZY_MIN_TOKEN_LEN) continue;
            const dist = levenshtein(qt, kt);
            if (dist <= umbralFuzzy(Math.max(qt.length, kt.length))) {
              score = Math.max(score, 5 - dist);
            }
          }
        }
      }
      if (score > 0) scored.push({ score, entity: p });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ entity }) => ({
    id: entity.id,
    titulo: entity.titulo,
    palabrasClave: entity.palabras_clave ?? [],
  }));
}

export type ProductKnowledgeResult =
  | { found: true; productId: string; titulo: string; rutaFuente: string; contenidoMarkdown: string; palabrasClave: string[] }
  | { found: false; reason: string };

/**
 * Contenido REAL de un producto, leído del markdown original
 * (`ruta_original`, siempre bajo docs/productos/). Nunca devuelve texto
 * inventado: si el archivo no existe o el producto no se encuentra, marca
 * `found:false` con el motivo explícito, para que Hermes pueda decir con
 * honestidad "no tengo esa información" (ver docs/agente_ia/ -- principio
 * "nunca inventar").
 */
/** Título real de un producto a partir de su id del Knowledge Package (ej. para mostrarlo en una alerta) -- null si no existe, nunca inventado. */
export async function getProductTitleById(productId: string): Promise<string | null> {
  const { entityById } = await loadKnowledge();
  return entityById.get(productId)?.titulo ?? null;
}

export async function getProductKnowledge(productQuery: string): Promise<ProductKnowledgeResult> {
  const matches = await searchKnowledge(productQuery, { limit: 1 });
  if (matches.length === 0) {
    return {
      found: false,
      reason: `No se encontró ningún producto real que coincida con "${productQuery}" en el catálogo (docs/productos/).`,
    };
  }
  const { entityById } = await loadKnowledge();
  const entity = entityById.get(matches[0].id)!;
  const rutaAbsoluta = path.join(REPO_ROOT, entity.ruta_original);

  if (!fs.existsSync(rutaAbsoluta)) {
    return {
      found: false,
      reason: `El producto "${entity.titulo}" existe en el índice compilado pero su archivo fuente (${entity.ruta_original}) no existe en disco -- posible desincronización docs//knowledge/.`,
    };
  }

  const contenidoMarkdown = fs.readFileSync(rutaAbsoluta, "utf-8");
  return {
    found: true,
    productId: entity.id,
    titulo: entity.titulo,
    rutaFuente: entity.ruta_original,
    contenidoMarkdown,
    palabrasClave: entity.palabras_clave ?? [],
  };
}
