// pathUtils.js
// Utilidades de rutas compartidas — evita repetir la conversión a POSIX y el
// cálculo de id en cada módulo (Windows usa "\", el modelo usa "/").

import path from 'node:path';
import { REPO_ROOT, DOCS_ROOT, DOCUMENT_EXTENSION } from './config.js';

/** Convierte una ruta absoluta a una ruta relativa a la raíz del repo, con "/" */
export function toRepoRelativePosix(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).split(path.sep).join('/');
}

/** Convierte una ruta absoluta a una ruta relativa a docs/, con "/" */
export function toDocsRelativePosix(absolutePath) {
  return path.relative(DOCS_ROOT, absolutePath).split(path.sep).join('/');
}

/**
 * Deriva el id determinista de una entidad a partir de su ruta.
 * Ej. docs/productos/01-control-de-peso/tedivina.md -> "productos/01-control-de-peso/tedivina"
 * El id es único por construcción porque las rutas de archivo lo son.
 */
export function deriveEntityId(absolutePath) {
  const relative = toDocsRelativePosix(absolutePath);
  return relative.endsWith(DOCUMENT_EXTENSION)
    ? relative.slice(0, -DOCUMENT_EXTENSION.length)
    : relative;
}

/**
 * Resuelve un enlace relativo de Markdown (tal como aparece en el archivo)
 * contra el directorio del archivo que lo contiene, devolviendo una ruta
 * absoluta. No valida existencia — eso es responsabilidad de references.js.
 */
export function resolveMarkdownLink(fromFileAbsolutePath, rawTarget) {
  const fromDir = path.dirname(fromFileAbsolutePath);
  return path.resolve(fromDir, rawTarget);
}
