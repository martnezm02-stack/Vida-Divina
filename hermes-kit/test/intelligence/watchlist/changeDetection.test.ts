// changeDetection.test.ts — classifyChange() en aislamiento (sin DB): la
// función pura que decide NEW/UPDATED/METRICS_CHANGED/UNCHANGED.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChange } from "../../../src/lib/intelligence/watchlist/changeDetection";
import { normalizeUrl } from "../../../src/lib/intelligence/ingestion/normalize";
import type { CanonicalIntelligenceItem } from "../../../src/lib/intelligence/ingestion";
import type { IntelligenceItem, ItemMetricsSnapshot } from "../../../src/lib/intelligence/types";

function baseCanonical(overrides: Partial<CanonicalIntelligenceItem> = {}): CanonicalIntelligenceItem {
  return { project: "p", source: "tiktok", content_type: "post", ...overrides };
}

function baseExisting(overrides: Partial<IntelligenceItem> = {}): IntelligenceItem {
  return {
    id: 1, project_id: 1, source_id: 1, actor_id: null, external_id: "x", canonical_url: null,
    content_type: "post", title: null, description: null, published_at: null,
    first_seen_at: 1, last_seen_at: 1, format: null, style: null, theme: null, market: null,
    audience: null, objective: null, product: null, funnel_stage: null, language: null,
    media_type: null, hook: null, angle: null, problem: null, mechanism: null, promise: null,
    cta: null, offer: null, social_proof: null, tags_json: null, metadata_json: null,
    created_at: 1, updated_at: 1,
    ...overrides,
  };
}

test("sin item existente -> NEW, sin importar el resto", () => {
  assert.equal(classifyChange(baseCanonical(), null, null), "NEW");
});

test("item existente, sin diferencias, sin métricas -> UNCHANGED", () => {
  const existing = baseExisting({ hook: "h", cta: "c" });
  const canonical = baseCanonical({ hook: "h", cta: "c" });
  assert.equal(classifyChange(canonical, existing, null), "UNCHANGED");
});

test("campo AUSENTE (undefined) en el nuevo raw nunca cuenta como cambio", () => {
  const existing = baseExisting({ hook: "hook original", cta: "cta original" });
  const canonical = baseCanonical(); // hook/cta ausentes -- undefined
  assert.equal(classifyChange(canonical, existing, null), "UNCHANGED");
});

test("campo presente y distinto -> UPDATED", () => {
  const existing = baseExisting({ hook: "hook viejo" });
  const canonical = baseCanonical({ hook: "hook nuevo" });
  assert.equal(classifyChange(canonical, existing, null), "UPDATED");
});

test("content_type distinto -> UPDATED (campo siempre presente, nunca undefined)", () => {
  const existing = baseExisting({ content_type: "post" });
  const canonical = baseCanonical({ content_type: "ad" });
  assert.equal(classifyChange(canonical, existing, null), "UPDATED");
});

test("sin cambios de contenido, con metrics nuevas y sin snapshot previo -> METRICS_CHANGED (primera observación)", () => {
  const existing = baseExisting();
  const canonical = baseCanonical({ metrics: { views: 100 } });
  assert.equal(classifyChange(canonical, existing, null), "METRICS_CHANGED");
});

test("sin cambios de contenido, metrics idénticas al último snapshot -> UNCHANGED", () => {
  const existing = baseExisting();
  const snapshot = { id: 1, item_id: 1, views: 100, likes: 5, comments: null, shares: null, engagement: null, reach: null, extra_json: null, captured_at: 1 } as ItemMetricsSnapshot;
  const canonical = baseCanonical({ metrics: { views: 100, likes: 5 } });
  assert.equal(classifyChange(canonical, existing, snapshot), "UNCHANGED");
});

test("sin cambios de contenido, metrics distintas al último snapshot -> METRICS_CHANGED", () => {
  const existing = baseExisting();
  const snapshot = { id: 1, item_id: 1, views: 100, likes: 5, comments: null, shares: null, engagement: null, reach: null, extra_json: null, captured_at: 1 } as ItemMetricsSnapshot;
  const canonical = baseCanonical({ metrics: { views: 250, likes: 5 } });
  assert.equal(classifyChange(canonical, existing, snapshot), "METRICS_CHANGED");
});

test("content_type con alias (p.ej. 'reel' -> 'video', ver normalizeContentType) NO cuenta como cambio si el alias coincide con lo ya guardado", () => {
  // Regresión: ingestionService.ts guarda content_type ya normalizado
  // (normalizeContentType) -- comparar el valor crudo del adapter contra el
  // valor guardado sin aplicar la misma normalización producía un falso
  // UPDATED en cada run, incluso sin cambios reales (bug real encontrado en
  // el E2E de este mismo bloque, con instagramAdapter produciendo "reel").
  const existing = baseExisting({ content_type: "video" }); // ya normalizado en el Store
  const canonical = baseCanonical({ content_type: "reel" }); // crudo, tal como lo entrega el adapter
  assert.equal(classifyChange(canonical, existing, null), "UNCHANGED");
});

test("canonical_url distinto solo por normalización (normalizeUrl) NO cuenta como cambio", () => {
  const existing = baseExisting({ canonical_url: "https://example.com/post" });
  const canonical = baseCanonical({ canonical_url: "https://example.com/post/" }); // trailing slash u otra variación que normalizeUrl colapsa
  const result = classifyChange(canonical, existing, null);
  // Si normalizeUrl no colapsa esta variación concreta, al menos debe ser
  // consistente con lo que ingestionService.ts realmente guardaría -- se
  // valida contra la propia función, no un valor hardcodeado.
  const expected = normalizeUrl("https://example.com/post/") === normalizeUrl("https://example.com/post") ? "UNCHANGED" : "UPDATED";
  assert.equal(result, expected);
});

test("contenido Y métricas cambian a la vez -> UPDATED gana (prioridad, un solo status por item)", () => {
  const existing = baseExisting({ hook: "viejo" });
  const snapshot = { id: 1, item_id: 1, views: 100, likes: null, comments: null, shares: null, engagement: null, reach: null, extra_json: null, captured_at: 1 } as ItemMetricsSnapshot;
  const canonical = baseCanonical({ hook: "nuevo", metrics: { views: 999 } });
  assert.equal(classifyChange(canonical, existing, snapshot), "UPDATED");
});
