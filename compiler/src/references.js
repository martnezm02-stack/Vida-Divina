// references.js
// Pipeline paso 5: detectar referencias.
// Responsabilidad única: encontrar enlaces Markdown dentro del contenido de
// un documento y resolverlos contra el sistema de archivos. No decide si
// una referencia se convierte en una relación del grafo (eso es
// relationships.js) — solo reporta qué encontró, si el destino existe, y
// bajo qué encabezado "## " del documento aparece (necesario desde el
// Sprint 3B para que relationships.js pueda distinguir "Productos
// recomendados" de "Productos complementarios", ver
// docs/RECOMMENDATION_ENGINE.md §6).

import fs from 'node:fs';
import { resolveMarkdownLink } from './pathUtils.js';

const MARKDOWN_LINK_PATTERN = /\]\(([^)]+)\)/g;
const HEADING_PATTERN = /^##\s+(.+?)\s*$/gm;

/**
 * Ubica, para cada posición del contenido, cuál es el encabezado "## " más
 * cercano que la precede. Se calcula una sola vez por documento.
 * @param {string} content
 * @returns {Array<{startIndex: number, texto: string}>}
 */
function ubicarEncabezados(content) {
  const encabezados = [];
  let match;
  HEADING_PATTERN.lastIndex = 0;
  while ((match = HEADING_PATTERN.exec(content)) !== null) {
    encabezados.push({ startIndex: match.index, texto: match[1].trim() });
  }
  return encabezados;
}

function encabezadoParaPosicion(encabezados, posicion) {
  let actual = null;
  for (const enc of encabezados) {
    if (enc.startIndex <= posicion) actual = enc.texto;
    else break;
  }
  return actual;
}

/**
 * @param {string} content
 * @param {string} fromFileAbsolutePath
 * @returns {Array<{targetRaw: string, resolvedPath: string|null, anchor: string|null, exists: boolean, seccion: string|null}>}
 */
export function extractReferences(content, fromFileAbsolutePath) {
  const references = [];
  const encabezados = ubicarEncabezados(content);
  let match;

  MARKDOWN_LINK_PATTERN.lastIndex = 0;
  while ((match = MARKDOWN_LINK_PATTERN.exec(content)) !== null) {
    const rawTarget = match[1].trim();

    // Se ignoran enlaces externos (http/https/mailto) — el compilador solo
    // verifica referencias dentro del propio repositorio.
    if (/^([a-z]+:)?\/\//i.test(rawTarget) || rawTarget.startsWith('mailto:')) {
      continue;
    }

    const [pathPart, anchorPart] = splitAnchor(rawTarget);
    if (pathPart.length === 0) {
      // Enlace de solo-ancla dentro del mismo archivo (ej. "#seccion") — no
      // es una referencia entre documentos, se omite del grafo de entidades.
      continue;
    }

    const resolvedPath = resolveMarkdownLink(fromFileAbsolutePath, pathPart);
    const exists = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile();

    references.push({
      targetRaw: rawTarget,
      resolvedPath: exists ? resolvedPath : resolvedPath, // se conserva aunque no exista, para el reporte de error
      anchor: anchorPart || null,
      exists,
      seccion: encabezadoParaPosicion(encabezados, match.index),
    });
  }

  return references;
}

function splitAnchor(target) {
  const hashIndex = target.indexOf('#');
  if (hashIndex === -1) return [target, null];
  return [target.slice(0, hashIndex), target.slice(hashIndex + 1)];
}
