// editableProjectStore.js — Editable Video Project (2026-08-24).
//
// A diferencia de hypothesisBatchStore.js/productionJobStore.js (hechos
// históricos inmutables, escritura exclusiva 'wx'), un EditableVideoProject
// es -- por diseño -- MUTABLE: el usuario edita el draft, lo guarda, lo
// vuelve a editar. Este store persiste el ESTADO ACTUAL completo del
// proyecto (incluye su arreglo real "versions", que sí es append-only en la
// práctica -- cada Render real agrega una versión nueva, nunca se borra una
// anterior). Mismo DATA_ROOT propio e independiente que el resto de stores
// nuevos de esta fase (ver productionJobStore.js) -- aislar este store en
// un test nunca debe tocar datos reales de otro store no relacionado.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EDITABLE_PROJECTS_DIR = process.env.EDITABLE_PROJECT_DATA_ROOT
  ? path.join(path.resolve(process.env.EDITABLE_PROJECT_DATA_ROOT), 'editableProjects')
  : fileURLToPath(new URL('../data/editableProjects', import.meta.url));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function projectPath(projectId) {
  return path.join(EDITABLE_PROJECTS_DIR, `${projectId}.json`);
}

/** Guarda (crea o sobrescribe) el estado real completo de un proyecto -- mutable, a diferencia de los demás stores de este proyecto. */
export function saveProject(project) {
  if (!project?.projectId?.trim?.()) throw new Error('saveProject: "projectId" es obligatorio.');
  if (!Array.isArray(project.versions) || project.versions.length === 0) throw new Error('saveProject: "versions" debe ser un arreglo real no vacío.');
  ensureDir(EDITABLE_PROJECTS_DIR);
  fs.writeFileSync(projectPath(project.projectId), JSON.stringify(project, null, 2), 'utf8');
  return Object.freeze({ projectId: project.projectId, path: projectPath(project.projectId) });
}

export function getProject(projectId) {
  const filePath = projectPath(projectId);
  if (!fs.existsSync(filePath)) throw new Error(`getProject: no existe ningún proyecto editable guardado con id "${projectId}".`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Lista los proyectos reales editables de una creatividad (creativeId) -- nunca inventa un proyecto que no fue guardado. */
export function listProjectsForCreative(creativeId) {
  if (!creativeId?.trim?.()) throw new Error('listProjectsForCreative: "creativeId" es obligatorio.');
  ensureDir(EDITABLE_PROJECTS_DIR);
  const files = fs.readdirSync(EDITABLE_PROJECTS_DIR).filter((f) => f.endsWith('.json'));
  return Object.freeze(
    files
      .map((f) => JSON.parse(fs.readFileSync(path.join(EDITABLE_PROJECTS_DIR, f), 'utf8')))
      .filter((p) => p.creativeId === creativeId),
  );
}

/** Todos los proyectos editables reales guardados, sin filtrar por creativeId -- usado por la gestión de Assets (Dashboard) para comprobar si un archivo físico sigue en uso antes de borrarlo. Nunca inventa un proyecto. */
export function listAllProjects() {
  ensureDir(EDITABLE_PROJECTS_DIR);
  const files = fs.readdirSync(EDITABLE_PROJECTS_DIR).filter((f) => f.endsWith('.json'));
  return Object.freeze(files.map((f) => JSON.parse(fs.readFileSync(path.join(EDITABLE_PROJECTS_DIR, f), 'utf8'))));
}
