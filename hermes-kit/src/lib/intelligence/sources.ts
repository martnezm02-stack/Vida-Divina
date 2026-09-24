// sources.ts — Catálogo de fuentes de inteligencia (tiktok, meta_ads, x...).
import { getDb } from "./connection";
import type { Source } from "./types";

export function getOrCreateSource(slug: string, name?: string): Source {
  const db = getDb();
  const existing = db
    .prepare<[string], Source>("SELECT * FROM sources WHERE slug = ?")
    .get(slug);
  if (existing) return existing;

  const info = db
    .prepare("INSERT INTO sources (slug, name) VALUES (?, ?)")
    .run(slug, name ?? slug);
  return db
    .prepare<[number], Source>("SELECT * FROM sources WHERE id = ?")
    .get(info.lastInsertRowid as number)!;
}

export function getSourceBySlug(slug: string): Source | null {
  return (
    getDb()
      .prepare<[string], Source>("SELECT * FROM sources WHERE slug = ?")
      .get(slug) ?? null
  );
}

export function listSources(): Source[] {
  return getDb()
    .prepare<[], Source>("SELECT * FROM sources ORDER BY name ASC")
    .all();
}
