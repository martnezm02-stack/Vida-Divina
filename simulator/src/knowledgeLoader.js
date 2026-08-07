// knowledgeLoader.js
// Responsabilidad única: leer knowledge/compiled/ (la salida del Knowledge
// Compiler, Sprint 2) y exponerlo como estructuras en memoria fáciles de
// consultar. No lee docs/ directamente — el simulador consulta el
// conocimiento YA COMPILADO, tal como exige el encargo de este sprint.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMPILED_ROOT = path.join(REPO_ROOT, 'knowledge', 'compiled');

function readJson(filename) {
  const filePath = path.join(COMPILED_ROOT, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No se encontró ${filePath}. El Knowledge Compiler (Sprint 2) debe ejecutarse antes que el simulador — ver compiler/main.js.`
    );
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * @returns {{
 *   entitiesByType: Record<string, Array>,
 *   entityById: Map<string, Object>,
 *   relationships: Array,
 *   relationshipsByOrigin: Map<string, Array>,
 *   index: Array,
 *   manifest: Object
 * }}
 */
export function loadCompiledKnowledge() {
  const entitiesByType = readJson('entities.json');
  const relationships = readJson('relationships.json');
  const index = readJson('index.json');
  const manifest = readJson('manifest.json');

  const entityById = new Map();
  for (const type of Object.keys(entitiesByType)) {
    for (const entity of entitiesByType[type]) {
      entityById.set(entity.id, entity);
    }
  }

  const relationshipsByOrigin = new Map();
  for (const rel of relationships) {
    if (!relationshipsByOrigin.has(rel.origen_id)) relationshipsByOrigin.set(rel.origen_id, []);
    relationshipsByOrigin.get(rel.origen_id).push(rel);
  }

  return { entitiesByType, entityById, relationships, relationshipsByOrigin, index, manifest };
}
