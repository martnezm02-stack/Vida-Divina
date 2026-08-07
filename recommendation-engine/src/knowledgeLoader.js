// knowledgeLoader.js
// Lector independiente de knowledge/compiled/ — deliberadamente no
// importado desde simulator/ ni desde compiler/, para que este módulo
// pueda ejecutarse, moverse o eliminarse sin afectar a los otros dos (ver
// docs/RECOMMENDATION_ENGINE.md §9, nota sobre una futura librería
// compartida).

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
      `No se encontró ${filePath}. Corre el Knowledge Compiler (compiler/main.js) antes que el Recommendation Engine.`
    );
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadCompiledKnowledge() {
  const entitiesByType = readJson('entities.json');
  const relationships = readJson('relationships.json');
  const manifest = readJson('manifest.json');

  const entityById = new Map();
  for (const type of Object.keys(entitiesByType)) {
    for (const entity of entitiesByType[type]) entityById.set(entity.id, entity);
  }

  const relationshipsByOrigin = new Map();
  for (const rel of relationships) {
    if (!relationshipsByOrigin.has(rel.origen_id)) relationshipsByOrigin.set(rel.origen_id, []);
    relationshipsByOrigin.get(rel.origen_id).push(rel);
  }

  return { entityById, relationshipsByOrigin, manifest };
}
