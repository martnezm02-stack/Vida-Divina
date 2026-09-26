// evidenceQueries.test.ts — Trazabilidad real Insight -> Pattern -> Items,
// usando solo IDs/relaciones reales ya persistidas -- nunca un item
// fabricado para "completar" la traza.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertIntelligenceItem,
  createPattern,
  linkPatternItem,
  createInsight,
} from "../../../src/lib/intelligence";
import { getDb } from "../../../src/lib/intelligence/connection";
import { traceInsight } from "../../../src/lib/intelligence/dashboard/evidenceQueries";

/** createInsight() no expone source_pattern_id (lo asigna internamente el pipeline de síntesis, MI-5) -- para fijarlo en un fixture de test se escribe directo, sin duplicar esa lógica de negocio en ningún caso real. */
function linkInsightToPatternForTest(insightId: number, patternId: number): void {
  getDb().prepare("UPDATE insights SET source_pattern_id = ? WHERE id = ?").run(patternId, insightId);
}

test("traceInsight: resuelve Insight -> Pattern -> Items reales a partir de relaciones ya persistidas", () => {
  const project = getOrCreateProject(`trace-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  const { item } = upsertIntelligenceItem({ project_id: project.id, source_id: source.id, content_type: "video" });

  const pattern = createPattern({ project_id: project.id, name: "patrón de prueba", pattern_type: "creative_cta_repetition" });
  linkPatternItem(pattern.id, item.id);

  const insight = createInsight({ project_id: project.id, name: "insight de prueba" });
  linkInsightToPatternForTest(insight.id, pattern.id);

  const trace = traceInsight(insight.id);
  assert.ok(trace);
  assert.equal(trace!.pattern?.id, pattern.id);
  assert.equal(trace!.items.length, 1);
  assert.equal(trace!.items[0].id, item.id);
});

test("traceInsight: insight inexistente -> null, nunca una traza fabricada", () => {
  assert.equal(traceInsight(999999999), null);
});

test("traceInsight: insight sin source_pattern_id -> pattern null e items vacíos, nunca inventados", () => {
  const project = getOrCreateProject(`trace-nopattern-${randomUUID()}`);
  const insight = createInsight({ project_id: project.id, name: "insight sin pattern" });

  const trace = traceInsight(insight.id);
  assert.ok(trace);
  assert.equal(trace!.pattern, null);
  assert.deepEqual(trace!.items, []);
});
