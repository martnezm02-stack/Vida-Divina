// productFactsLoader.js — lee los hechos reales de un producto directamente
// de docs/productos/**/*.md (la fuente de verdad del catálogo, según
// CLAUDE.md). No existía ningún loader estructurado de estos campos en el
// proyecto: knowledge/compiled/entities.json (Knowledge Compiler) solo
// guarda metadata de navegación (palabras clave, relaciones, referencias),
// NUNCA el cuerpo real de "Problema"/"Beneficios" -- se verificó esto
// antes de escribir este archivo, para no asumir que ya existía.
//
// REGLA CENTRAL: parseo determinista de un formato real y consistente ya
// usado en todo docs/productos/ ("- **Campo:** valor"), sin librerías de
// markdown -- mismo espíritu zero-dep que
// video-production/src/assetRegistry.js#leerDimensionesJpeg. Nunca
// inventa un campo que no esté literalmente en el archivo.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTOS_DIR = fileURLToPath(new URL('../../docs/productos', import.meta.url));

const CAMPO_PATTERN = /^- \*\*([^:*]+):\*\*\s*(.+)$/;
const ANCHOR_PATTERN = /<a id="([^"]+)">\s*<\/a>/g;

function normalizarSlug(nombre) {
  return nombre.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Hallazgo real (Fase 19): varios archivos de docs/productos/ documentan
 * MÁS DE UN producto en el mismo archivo, usando anclas reales
 * `<a id="...-capsules"></a>` (convención ya documentada en CLAUDE.md:
 * "si tiene pocos [productos], se mantiene como un único archivo con
 * secciones ancladas"). El parseo anterior de este loader operaba a nivel
 * de ARCHIVO completo -- para un archivo con 2 productos (ej.
 * 08-intimidad-libido.md: Mars + Venus), eso mezclaba los campos de ambos
 * (el último "- **Campo:**" de cada nombre gana, por ser un objeto plano),
 * dejando el primer producto del archivo completamente inalcanzable.
 * Verificado antes de escribir esto: Mars Capsules devolvía en la práctica
 * los campos reales de Venus.
 *
 * Este helper localiza los límites reales de cada sección anclada (desde
 * su `<a id>` hasta la siguiente ancla o el fin del archivo) -- ninguna
 * regla de negocio nueva, solo delimita qué texto real pertenece a cada
 * producto antes de parsearlo con parsearCamposReales() ya existente.
 *
 * @returns {Array<{id:string, markdown:string}>} vacío si el archivo no tiene anclas (producto único, comportamiento sin cambios).
 */
function seccionesAncladas(markdown) {
  const anclas = [...markdown.matchAll(ANCHOR_PATTERN)];
  if (anclas.length === 0) return [];
  return anclas.map((m, i) => {
    const inicio = m.index;
    const fin = i + 1 < anclas.length ? anclas[i + 1].index : markdown.length;
    return { id: m[1], markdown: markdown.slice(inicio, fin) };
  });
}

/**
 * Lista TODOS los slugs de producto reales que existen en docs/productos/
 * -- un slug por producto individualmente direccionable: el ancla real
 * (`<a id="...">`) cuando el archivo documenta más de un producto, o el
 * nombre de archivo cuando documenta exactamente uno (sin anclas, mismo
 * comportamiento que antes). Usado por productMatcher.js para resolver un
 * producto real mencionado en texto libre (userIntent) sin tener que
 * adivinar el slug de antemano.
 */
export function listAllProductSlugs() {
  if (!existsSync(PRODUCTOS_DIR)) return [];
  const slugs = [];
  const pilas = [PRODUCTOS_DIR];
  while (pilas.length > 0) {
    const dir = pilas.pop();
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        pilas.push(full);
      } else if (entry.toLowerCase().endsWith('.md') && entry.toLowerCase() !== 'index.md') {
        const secciones = seccionesAncladas(readFileSync(full, 'utf8'));
        if (secciones.length > 0) {
          for (const s of secciones) slugs.push(s.id);
        } else {
          slugs.push(entry.replace(/\.md$/i, ''));
        }
      }
    }
  }
  return slugs;
}

/**
 * Busca, en TODOS los archivos reales de docs/productos/, una sección
 * anclada (`<a id="...">`) cuyo id normalizado coincida con productSlug.
 * Solo aplica a archivos con más de un producto -- nunca adivina cuál
 * sección es si el archivo no usa anclas.
 */
function localizarSeccionAnclada(productSlug) {
  const objetivo = normalizarSlug(productSlug);
  if (!existsSync(PRODUCTOS_DIR)) return null;

  const pilas = [PRODUCTOS_DIR];
  while (pilas.length > 0) {
    const dir = pilas.pop();
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        pilas.push(full);
      } else if (entry.toLowerCase().endsWith('.md') && entry.toLowerCase() !== 'index.md') {
        const secciones = seccionesAncladas(readFileSync(full, 'utf8'));
        const match = secciones.find((s) => normalizarSlug(s.id) === objetivo);
        if (match) return { sourcePath: full, markdown: match.markdown };
      }
    }
  }
  return null;
}

/** Busca recursivamente en docs/productos/ un archivo .md cuyo nombre (sin extensión, normalizado) coincida con productSlug. Nunca adivina rutas -- si no existe, devuelve null explícito. */
function localizarArchivoProducto(productSlug) {
  const objetivo = normalizarSlug(productSlug);
  if (!existsSync(PRODUCTOS_DIR)) return null;

  const pilas = [PRODUCTOS_DIR];
  while (pilas.length > 0) {
    const dir = pilas.pop();
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        pilas.push(full);
      } else if (entry.toLowerCase().endsWith('.md') && entry.toLowerCase() !== 'index.md') {
        const nombreSinExt = entry.replace(/\.md$/i, '');
        if (normalizarSlug(nombreSinExt) === objetivo) return full;
      }
    }
  }
  return null;
}

// Data Quality Status (Corrección "Limpieza y normalización del Product
// Knowledge", 2026-08-28, Paso 18/19/20/33 del encargo): VERIFIED/
// INCOMPLETE/CONFLICT/MISSING, calculado SOLO a partir de lo que el
// propio .md real ya declara -- nunca infiere ni corrige con
// conocimiento externo (Paso 30/31).
//
// GAP_PHRASE_RE detecta frases reales que YA usa el catálogo (nunca
// inventadas aquí) para marcar ausencia de dato -- ej. Venus Capsules:
// "Fórmula patentada — componentes específicos no detallados en el
// catálogo." Se revisa SOLO Beneficios/Ingredientes (los campos
// realmente usados como Marketing Claim/Product Fact por el Creative
// pipeline, Paso 7) -- "Público objetivo: No especificado" es la norma
// en casi todo el catálogo y no es la señal de calidad que este encargo
// pide vigilar.
const GAP_PHRASE_RE = /no especificado|no detallad|no se detalla/i;

// Conflict Registry explícito y auditable (Paso 19/26/33 del encargo):
// SOLO los conflictos reales ya encontrados por inspección directa de
// docs/productos/ en esta corrección -- NUNCA un detector genérico de
// contradicción semántica (arriesgaría falsos positivos reales en las
// otras 64 fichas nunca auditadas en esta tarea, violando "NO auditoría
// general"). Cada entrada documenta el conflicto real exacto.
const KNOWN_DATA_CONFLICTS = Object.freeze({
  sculptblack: 'Objetivo principal menciona "Garcinia Cambogia"; Ingredientes principales no la incluye (docs/productos/02-cafe-divina/sculpt-black.md).',
});

/**
 * dataQualityStatus real (Paso 18 del encargo): CONFLICT si el producto
 * real está en KNOWN_DATA_CONFLICTS; INCOMPLETE si Beneficios/
 * Ingredientes principales reales contienen una frase real de ausencia
 * de dato; MISSING si NINGÚN campo real de negocio (Beneficios/
 * Ingredientes/Objetivo/Problema) existe; VERIFIED en cualquier otro
 * caso real.
 */
function computeDataQualityStatus(campos, productSlug) {
  if (KNOWN_DATA_CONFLICTS[normalizarSlug(productSlug)]) return 'CONFLICT';
  const conGap = ['Beneficios', 'Ingredientes principales'].some((c) => GAP_PHRASE_RE.test(campos[c] ?? ''));
  if (conGap) return 'INCOMPLETE';
  const camposNegocio = ['Beneficios', 'Ingredientes principales', 'Objetivo principal', 'Problema que ayuda a resolver'];
  if (!camposNegocio.some((c) => campos[c])) return 'MISSING';
  return 'VERIFIED';
}

/**
 * Parsea los campos "- **Campo:** valor" reales de un archivo de producto.
 * Devuelve un objeto con las claves normalizadas a camelCase de lo que
 * realmente existe en el archivo -- nunca rellena un campo ausente.
 */
function parsearCamposReales(markdown) {
  const campos = {};
  for (const linea of markdown.split('\n')) {
    const m = linea.match(CAMPO_PATTERN);
    if (!m) continue;
    const etiqueta = m[1].trim();
    const valor = m[2].trim();
    campos[etiqueta] = valor;
  }
  return campos;
}

/**
 * Carga los hechos reales de un producto desde su archivo real en
 * docs/productos/. Lanza si el producto no existe -- NUNCA inventa datos
 * de producto (regla no-negociable de todas las fases anteriores de este
 * proyecto).
 *
 * @param {string} productSlug — ej. "te-divina", "tedivina", "TéDivina" (se normaliza).
 * @returns {{productSlug:string, sourcePath:string, camposReales:object, nombreComercial:string|null, problema:string|null, beneficios:string|null, ingredientes:string|null}}
 */
export function loadProductFacts(productSlug) {
  if (!productSlug?.trim()) throw new Error('loadProductFacts: "productSlug" es obligatorio.');

  // Primero, sección anclada real (archivo con más de un producto) -- más
  // específico que el archivo completo, nunca se confunde un producto con
  // otro del mismo archivo. Si no hay ninguna ancla que coincida, se cae
  // al comportamiento original (archivo completo = un solo producto),
  // intacto para todos los productos ya existentes de un solo archivo.
  const seccion = localizarSeccionAnclada(productSlug);
  let archivo, markdown;
  if (seccion) {
    archivo = seccion.sourcePath;
    markdown = seccion.markdown;
  } else {
    archivo = localizarArchivoProducto(productSlug);
    if (!archivo) {
      throw new Error(`loadProductFacts: no existe ningún archivo real en docs/productos/ para "${productSlug}" — no se inventan hechos de producto.`);
    }
    markdown = readFileSync(archivo, 'utf8');
  }
  const campos = parsearCamposReales(markdown);

  return Object.freeze({
    productSlug,
    sourcePath: archivo,
    camposReales: Object.freeze(campos),
    nombreComercial: campos['Nombre comercial'] ?? null,
    // Nombre visible (UX cleanup, 2026-08-26): nombre corto para
    // usuario/UI/voiceover/hooks/CTA -- distinto del "Nombre comercial"
    // (que se conserva intacto arriba, es el nombre técnico usado para
    // matching/correlación real en todo el proyecto). Si el archivo real
    // no documenta "Nombre visible", cae al nombre comercial existente
    // (compatibilidad hacia atrás -- nunca null si hay nombre comercial).
    nombreVisible: campos['Nombre visible'] ?? campos['Nombre comercial'] ?? null,
    problema: campos['Problema que ayuda a resolver'] ?? null,
    beneficios: campos['Beneficios'] ?? null,
    ingredientes: campos['Ingredientes principales'] ?? null,
    objetivoPrincipal: campos['Objetivo principal'] ?? null,
    presentacion: campos['Presentación'] ?? null,
    publicoObjetivo: campos['Público objetivo'] ?? null,
    modoDeUso: campos['Modo de uso'] ?? null,
    // Ausente en la ficha real == sin estado especial documentado == ACTIVO
    // (mismo default implícito que ya asumía todo el catálogo antes de que
    // Ripped Capsules necesitara distinguirse explícitamente). Nunca se
    // infiere REQUIRES_CONFIRMATION -- solo se refleja si el campo real ya
    // lo dice literalmente en docs/productos/.
    estadoComercial: campos['Estado comercial'] ?? 'ACTIVO',
    // dataQualityStatus/dataQualityDetail (Paso 18/19/20 del encargo):
    // VERIFIED/INCOMPLETE/CONFLICT/MISSING -- ver computeDataQualityStatus()
    // arriba, nunca corrige el dato real, solo lo señala.
    dataQualityStatus: computeDataQualityStatus(campos, productSlug),
    dataQualityDetail: KNOWN_DATA_CONFLICTS[normalizarSlug(productSlug)] ?? null,
  });
}
