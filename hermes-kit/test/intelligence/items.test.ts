// items.test.ts — MI-1: datos temporales, active_days derivado,
// clasificación creativa, idempotencia por external_id/canonical_url, y
// búsqueda/filtro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  getOrCreateProject,
  getOrCreateSource,
  upsertIntelligenceItem,
  searchIntelligenceItems,
} from "../../src/lib/intelligence";

function setup() {
  const project = getOrCreateProject(`proj-${randomUUID()}`);
  const source = getOrCreateSource(`source-${randomUUID()}`);
  return { project, source };
}

test("temporal data: published_at, first_seen_at, last_seen_at se conservan tal cual", () => {
  const { project, source } = setup();
  const publishedAt = 1_700_000_000;
  const firstSeen = 1_700_000_100;
  const lastSeen = 1_700_086_500; // +1 día aprox

  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "temporal-1",
    content_type: "ad",
    published_at: publishedAt,
    first_seen_at: firstSeen,
    last_seen_at: lastSeen,
  });

  assert.equal(item.published_at, publishedAt);
  assert.equal(item.first_seen_at, firstSeen);
  assert.equal(item.last_seen_at, lastSeen);
});

test("active_days se deriva de last_seen_at - first_seen_at, nunca se pide suelto", () => {
  const { project, source } = setup();
  const firstSeen = 1_700_000_000;
  const lastSeen = firstSeen + 5 * 86400; // 5 días después

  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "active-days-1",
    content_type: "ad",
    first_seen_at: firstSeen,
    last_seen_at: lastSeen,
  });

  assert.equal(item.active_days, 5);
});

test("clasificación creativa y elementos creativos se guardan y se leen íntegros", () => {
  const { project, source } = setup();
  const { item } = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "classified-1",
    content_type: "ad",
    format: "video",
    style: "ugc",
    theme: "transformacion",
    market: "MX",
    audience: "mujeres_35_55",
    objective: "conversion",
    product: "sculpt-max",
    funnel_stage: "cold",
    hook: "¿Cansada de dietas que no funcionan?",
    angle: "autoridad_cientifica",
    problem: "perdida_de_peso_dificil",
    mechanism: "termogenesis_natural",
    cta: "Compra ahora",
    offer: "2x1",
    social_proof: "testimonio_real",
    tags: ["control-de-peso", "ugc"],
  });

  assert.equal(item.format, "video");
  assert.equal(item.hook, "¿Cansada de dietas que no funcionan?");
  assert.equal(item.funnel_stage, "cold");
  assert.deepEqual(JSON.parse(item.tags_json!), ["control-de-peso", "ugc"]);
});

test("duplicado por external_id: no crea una segunda fila, extiende last_seen_at", () => {
  const { project, source } = setup();
  const first = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "dup-1",
    content_type: "ad",
    first_seen_at: 1_700_000_000,
    last_seen_at: 1_700_000_000,
    title: "Primera observación",
  });
  assert.equal(first.created, true);

  const second = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "dup-1",
    content_type: "ad",
    last_seen_at: 1_700_500_000,
  });
  assert.equal(second.created, false);
  assert.equal(second.item.id, first.item.id);
  assert.equal(second.item.last_seen_at, 1_700_500_000);
  assert.equal(second.item.title, "Primera observación", "los campos no enviados no deben borrarse");

  const results = searchIntelligenceItems({ project_id: project.id });
  const matching = results.filter((r) => r.external_id === "dup-1");
  assert.equal(matching.length, 1, "no debe haber una fila duplicada para el mismo external_id");
});

test("duplicado por canonical_url cuando no hay external_id", () => {
  const { project, source } = setup();
  const url = `https://example.com/ad/${randomUUID()}`;
  const first = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    canonical_url: url,
    content_type: "post",
  });
  const second = upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    canonical_url: url,
    content_type: "post",
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.item.id, first.item.id);
});

test("búsqueda/filtro: por market, funnel_stage y tag", () => {
  const { project, source } = setup();
  upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "search-mx-cold",
    content_type: "ad",
    market: "MX",
    funnel_stage: "cold",
    tags: ["reishi"],
  });
  upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "search-us-hot",
    content_type: "ad",
    market: "US",
    funnel_stage: "hot",
    tags: ["sculpt"],
  });

  const byMarket = searchIntelligenceItems({ project_id: project.id, market: "MX" });
  assert.ok(byMarket.some((i) => i.external_id === "search-mx-cold"));
  assert.ok(!byMarket.some((i) => i.external_id === "search-us-hot"));

  const byFunnel = searchIntelligenceItems({ project_id: project.id, funnel_stage: "hot" });
  assert.ok(byFunnel.some((i) => i.external_id === "search-us-hot"));

  const byTag = searchIntelligenceItems({ project_id: project.id, tag: "reishi" });
  assert.ok(byTag.some((i) => i.external_id === "search-mx-cold"));
  assert.ok(!byTag.some((i) => i.external_id === "search-us-hot"));
});

test("búsqueda/filtro: min_active_days excluye items recientes", () => {
  const { project, source } = setup();
  const now = 1_700_000_000;
  upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "old-ad",
    content_type: "ad",
    first_seen_at: now,
    last_seen_at: now + 20 * 86400,
  });
  upsertIntelligenceItem({
    project_id: project.id,
    source_id: source.id,
    external_id: "fresh-ad",
    content_type: "ad",
    first_seen_at: now,
    last_seen_at: now + 1 * 86400,
  });

  const veteran = searchIntelligenceItems({ project_id: project.id, min_active_days: 10 });
  assert.ok(veteran.some((i) => i.external_id === "old-ad"));
  assert.ok(!veteran.some((i) => i.external_id === "fresh-ad"));
});
