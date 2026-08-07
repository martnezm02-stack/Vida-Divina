// artifacts.js
// Pipeline paso 8: generar artefactos.
// Responsabilidad única: escritura a disco. Es la única capa del compilador
// que hace I/O de salida — todas las demás etapas son funciones puras que
// devuelven datos. Esto concentra en un solo lugar la garantía de que
// jamás se escribe dentro de docs/ (ver docs/KNOWLEDGE_MODEL.md §11).

import fs from 'node:fs';
import path from 'node:path';
import { RAW_ROOT, COMPILED_ROOT, DOCS_ROOT, CACHE_ROOT } from './config.js';

function assertNeverWritesToDocs(targetPath) {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedDocs = path.resolve(DOCS_ROOT);
  if (normalizedTarget === normalizedDocs || normalizedTarget.startsWith(normalizedDocs + path.sep)) {
    throw new Error(
      `Intento de escritura dentro de docs/ bloqueado: ${targetPath}. Esto nunca debe ocurrir — ver docs/KNOWLEDGE_MODEL.md §11.`
    );
  }
}

function writeJson(targetPath, data) {
  assertNeverWritesToDocs(targetPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Escribe el archivo .meta.json de una entidad en knowledge/raw/, replicando
 * la misma ruta relativa que el documento fuente tiene dentro de docs/.
 * Ej. docs/productos/.../tedivina.md -> knowledge/raw/productos/.../tedivina.meta.json
 */
export function writeEntityMetaJson(entity) {
  const relativeNoExt = entity.ruta_original.replace(/^docs\//, '').replace(/\.md$/, '');
  const targetPath = path.join(RAW_ROOT, `${relativeNoExt}.meta.json`);
  writeJson(targetPath, entity);
  return targetPath;
}

export function writeIndexJson(entities) {
  const index = entities.map((e) => ({
    id: e.id,
    tipo_entidad: e.tipo_entidad,
    titulo: e.titulo,
    modulo: e.modulo,
    ruta_original: e.ruta_original,
  }));
  writeJson(path.join(COMPILED_ROOT, 'index.json'), index);
}

export function writeEntitiesJson(entities) {
  const grouped = {};
  for (const e of entities) {
    if (!grouped[e.tipo_entidad]) grouped[e.tipo_entidad] = [];
    grouped[e.tipo_entidad].push(e);
  }
  writeJson(path.join(COMPILED_ROOT, 'entities.json'), grouped);
}

export function writeRelationshipsJson(relationships) {
  writeJson(path.join(COMPILED_ROOT, 'relationships.json'), relationships);
}

export function writeCatalogJson(entities, modules) {
  const catalog = modules.map((moduleName) => {
    const moduleEntities = entities.filter((e) => e.modulo === moduleName);
    return {
      modulo: moduleName,
      cantidad_documentos: moduleEntities.length,
      tipos_entidad: [...new Set(moduleEntities.map((e) => e.tipo_entidad))].sort(),
      documentos: moduleEntities
        .map((e) => ({ id: e.id, titulo: e.titulo, tipo_entidad: e.tipo_entidad }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  });
  writeJson(path.join(COMPILED_ROOT, 'catalog.json'), catalog);
}

export function writeStatisticsJson(statistics) {
  writeJson(path.join(COMPILED_ROOT, 'statistics.json'), statistics);
}

export function writeManifestJson(manifest) {
  writeJson(path.join(COMPILED_ROOT, 'manifest.json'), manifest);
}

/** Prepara knowledge/cache/ — solo la carpeta y una nota, sin lógica de cache (fuera de alcance del MVP). */
export function prepareCacheDirectory() {
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  const readmePath = path.join(CACHE_ROOT, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      '# knowledge/cache/\n\n' +
        'Carpeta preparada por el Knowledge Compiler MVP, sin lógica de cache implementada todavía ' +
        '(fuera de alcance de este sprint — ver docs/KNOWLEDGE_COMPILER_NOTES.md).\n\n' +
        'Uso previsto a futuro: permitir compilación incremental, comparando el checksum de cada ' +
        'documento contra una corrida anterior para evitar reprocesar archivos sin cambios.\n'
    );
  }
}
