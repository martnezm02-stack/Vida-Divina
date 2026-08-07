// discovery.js
// Pipeline paso 1-2: descubrir módulos y documentos.
// Responsabilidad única: leer el sistema de archivos bajo DOCS_ROOT y devolver
// una lista plana de documentos. No clasifica, no extrae metadatos, no valida.
// No depende de nombres de carpeta específicos — cualquier subcarpeta directa
// de docs/ se trata como un módulo, sin importar cómo se llame.

import fs from 'node:fs';
import path from 'node:path';
import { DOCS_ROOT, DOCUMENT_EXTENSION, DOCS_ROOT_EXCLUDED_FILES, MODULE_ROOT_INDEX_FILE } from './config.js';
import { toRepoRelativePosix } from './pathUtils.js';

/**
 * Si el módulo tiene un índice como archivo suelto en la raíz de docs/
 * (ver MODULE_ROOT_INDEX_FILE en config.js), lo devuelve como un documento
 * más de ese módulo, marcado como raíz. Si no aplica, devuelve null.
 */
function discoverModuleRootIndexFile(moduleName) {
  const filename = MODULE_ROOT_INDEX_FILE[moduleName];
  if (!filename) return null;
  const absolutePath = path.join(DOCS_ROOT, filename);
  if (!fs.existsSync(absolutePath)) return null;
  return {
    absolutePath,
    rutaOriginal: toRepoRelativePosix(absolutePath),
    modulo: moduleName,
    filename,
    esRaizDeModulo: false, // vive fuera de la carpeta del módulo, no "dentro" de su raíz
    esIndiceDeModuloExterno: true, // pero cumple el rol de índice de módulo — ver classifier.js
  };
}

/**
 * Descubre los módulos disponibles: toda carpeta directa dentro de docs/.
 * @returns {string[]} nombres de módulo (ej. ["productos", "clientes", ...])
 */
export function discoverModules() {
  if (!fs.existsSync(DOCS_ROOT)) {
    throw new Error(`DOCS_ROOT no existe: ${DOCS_ROOT}`);
  }
  return fs
    .readdirSync(DOCS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Recorre recursivamente un módulo y devuelve todos los documentos .md encontrados.
 * @param {string} moduleName
 * @returns {import('./models.js').DiscoveredDocument[]}
 */
export function discoverDocumentsInModule(moduleName) {
  const moduleRoot = path.join(DOCS_ROOT, moduleName);
  const documents = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(DOCUMENT_EXTENSION)) {
        documents.push({
          absolutePath,
          rutaOriginal: toRepoRelativePosix(absolutePath),
          modulo: moduleName,
          filename: entry.name,
          esRaizDeModulo: currentDir === moduleRoot,
          esIndiceDeModuloExterno: false,
        });
      }
    }
  }

  walk(moduleRoot);
  return documents;
}

/**
 * Descubre los documentos sueltos directamente en docs/ (no dentro de ningún
 * módulo) que NO están en la lista de exclusión — por diseño, hoy la lista de
 * exclusión cubre todos los que existen, así que esto normalmente devuelve
 * un arreglo vacío. Se deja implementado para que un archivo nuevo en la raíz
 * de docs/ que no sea de arquitectura se detecte y se reporte, en vez de
 * desaparecer silenciosamente del alcance del compilador.
 * @returns {{incluidos: import('./models.js').DiscoveredDocument[], excluidos: string[]}}
 */
export function discoverLooseRootDocuments() {
  const entries = fs.readdirSync(DOCS_ROOT, { withFileTypes: true });
  const incluidos = [];
  const excluidos = [];
  const moduleRootIndexFilenames = new Set(Object.values(MODULE_ROOT_INDEX_FILE));
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(DOCUMENT_EXTENSION)) continue;
    if (moduleRootIndexFilenames.has(entry.name)) continue; // ya se procesa vía discoverModuleRootIndexFile, no es "suelto"
    if (DOCS_ROOT_EXCLUDED_FILES.has(entry.name.toLowerCase())) {
      excluidos.push(entry.name);
      continue;
    }
    const absolutePath = path.join(DOCS_ROOT, entry.name);
    incluidos.push({
      absolutePath,
      rutaOriginal: toRepoRelativePosix(absolutePath),
      modulo: null,
      filename: entry.name,
      esRaizDeModulo: false,
    });
  }
  return { incluidos, excluidos };
}

/**
 * Orquesta el descubrimiento completo: módulos + documentos por módulo.
 * @param {string[] | null} moduleFilter - si se provee, limita el descubrimiento a estos módulos
 * @returns {{modules: string[], documentsByModule: Record<string, import('./models.js').DiscoveredDocument[]>, skippedRootFiles: string[]}}
 */
export function discoverAll(moduleFilter = null) {
  const allModules = discoverModules();
  const modules = moduleFilter
    ? allModules.filter((m) => moduleFilter.includes(m))
    : allModules;

  const documentsByModule = {};
  for (const moduleName of modules) {
    const docs = discoverDocumentsInModule(moduleName);
    const rootIndex = discoverModuleRootIndexFile(moduleName);
    documentsByModule[moduleName] = rootIndex ? [rootIndex, ...docs] : docs;
  }

  const { excluidos } = discoverLooseRootDocuments();

  return { modules, documentsByModule, skippedRootFiles: excluidos };
}
