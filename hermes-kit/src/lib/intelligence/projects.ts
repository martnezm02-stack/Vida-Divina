// projects.ts — Workspaces/proyectos: aislamiento lógico dentro del Store compartido.
import { getDb } from "./connection";
import type { Project } from "./types";

export function getOrCreateProject(slug: string, name?: string): Project {
  const db = getDb();
  const existing = db
    .prepare<[string], Project>("SELECT * FROM projects WHERE slug = ?")
    .get(slug);
  if (existing) return existing;

  const info = db
    .prepare("INSERT INTO projects (slug, name) VALUES (?, ?)")
    .run(slug, name ?? slug);
  return db
    .prepare<[number], Project>("SELECT * FROM projects WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function getProjectBySlug(slug: string): Project | null {
  return (
    getDb()
      .prepare<[string], Project>("SELECT * FROM projects WHERE slug = ?")
      .get(slug) ?? null
  );
}

export function getProjectById(id: number): Project | null {
  return (
    getDb()
      .prepare<[number], Project>("SELECT * FROM projects WHERE id = ?")
      .get(id) ?? null
  );
}

export function listProjects(): Project[] {
  return getDb()
    .prepare<[], Project>("SELECT * FROM projects ORDER BY created_at ASC")
    .all();
}
