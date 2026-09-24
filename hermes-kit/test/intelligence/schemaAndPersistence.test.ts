// schemaAndPersistence.test.ts — MI-1: el esquema se crea solo al abrir la
// conexión, y los datos sobreviven a un cierre/reapertura de la base (que
// simula un reinicio de Hermes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import {
  getDb,
  getDbPath,
  _resetConnectionForTests,
  getOrCreateProject,
  getOrCreateSource,
  upsertIntelligenceItem,
  getIntelligenceItemById,
  updateIntelligenceItem,
} from "../../src/lib/intelligence";

test("HERMES_TEST_MODE=1 activo (heredado de npm test)", () => {
  assert.equal(process.env.HERMES_TEST_MODE, "1");
});

test("getDb() crea el esquema (tablas del modelo canónico) en un archivo SQLite real en disco", () => {
  const db = getDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r: any) => r.name);

  for (const expected of [
    "projects",
    "sources",
    "actors",
    "intelligence_items",
    "item_metrics",
    "assets",
    "evidence",
    "ai_analyses",
    "signals",
    "item_relationships",
    "patterns",
    "pattern_items",
    "insights",
    "insight_patterns",
    "watchlists",
    "watchlist_entries",
  ]) {
    assert.ok(tables.includes(expected), `falta la tabla ${expected}`);
  }

  assert.ok(fs.existsSync(getDbPath()), "el archivo de la base debe existir realmente en disco");
});

test("create/read/update de un intelligence item básico", () => {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);

  const { item, created } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "ext-1",
    content_type: "ad",
    title: "Anuncio original",
  });
  assert.equal(created, true);

  const read = getIntelligenceItemById(item.id);
  assert.equal(read?.title, "Anuncio original");

  const updated = updateIntelligenceItem(item.id, { title: "Anuncio editado" });
  assert.equal(updated?.title, "Anuncio editado");
  assert.equal(getIntelligenceItemById(item.id)?.title, "Anuncio editado");
});

test("los datos sobreviven a cerrar y reabrir la conexión (simula reinicio de Hermes)", () => {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "persist-me",
    content_type: "ad",
    title: "Sobrevive al reinicio",
  });

  _resetConnectionForTests();

  const reloaded = getIntelligenceItemById(item.id);
  assert.ok(reloaded, "el item debe seguir existiendo tras reabrir la conexión");
  assert.equal(reloaded?.title, "Sobrevive al reinicio");
});
