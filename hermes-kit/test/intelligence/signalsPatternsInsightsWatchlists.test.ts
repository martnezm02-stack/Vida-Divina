// signalsPatternsInsightsWatchlists.test.ts — MI-1: estructuras base para
// signal, pattern, insight y watchlist (sin motor de detección todavía).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertIntelligenceItem,
  createSignal,
  listSignalsByProject,
  createPattern,
  linkPatternItem,
  listItemsForPattern,
  listPatternsByProject,
  createInsight,
  linkInsightPattern,
  listInsightsByProject,
  createWatchlist,
  addWatchlistEntry,
  listWatchlistEntries,
  listWatchlistsByProject,
} from "../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

test("signal: se crea y se lista por proyecto", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "signal-item",
    content_type: "ad",
  });

  createSignal({
    project_id: project.id,
    item_id: item.id,
    signal_type: "unusual_growth",
    title: "Views x10 en 48h",
    strength: 0.87,
  });

  const signals = listSignalsByProject(project.id);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signal_type, "unusual_growth");
});

test("pattern: se crea, se le ligan items evidencia y se lista", () => {
  const { project, source } = setup();
  const { item: item1 } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "pattern-item-1",
    content_type: "ad",
  });
  const { item: item2 } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "pattern-item-2",
    content_type: "ad",
  });

  const pattern = createPattern({
    project_id: project.id,
    name: "Hook de transformación en 30 días",
    pattern_type: "hook_repetition",
  });
  linkPatternItem(pattern.id, item1.id);
  linkPatternItem(pattern.id, item2.id);

  const items = listItemsForPattern(pattern.id);
  assert.equal(items.length, 2);
  assert.ok(items.includes(item1.id));

  const patterns = listPatternsByProject(project.id);
  assert.equal(patterns.length, 1);
});

test("insight: se crea y se respalda con un pattern", () => {
  const { project } = setup();
  const pattern = createPattern({ project_id: project.id, name: "Patrón base" });
  const insight = createInsight({
    project_id: project.id,
    name: "Los hooks de transformación superan a los de ingredientes",
    insight_type: "creative_opportunity",
  });
  linkInsightPattern(insight.id, pattern.id);

  const insights = listInsightsByProject(project.id);
  assert.equal(insights.length, 1);
  assert.equal(insights[0].name, "Los hooks de transformación superan a los de ingredientes");
});

test("watchlist: se crea con entradas de tipo distinto (keyword, competitor...)", () => {
  const { project } = setup();
  const watchlist = createWatchlist(project.id, "Competidores control de peso", "competitor");
  addWatchlistEntry(watchlist.id, "@marca-competidora", "creator");
  addWatchlistEntry(watchlist.id, "tongkat ali", "keyword");

  const entries = listWatchlistEntries(watchlist.id);
  assert.equal(entries.length, 2);
  assert.ok(entries.some((e) => e.kind === "keyword" && e.value === "tongkat ali"));

  const watchlists = listWatchlistsByProject(project.id);
  assert.ok(watchlists.some((w) => w.id === watchlist.id));
});
