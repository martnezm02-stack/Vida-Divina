// generate_brief.mts — Primer Intelligence Brief REAL de Vida Divina.
// Usa exclusivamente los módulos existentes (qualification -> analysis ->
// patterns -> signals -> insights -> Intelligence Brief) sobre evidencia
// YA existente en el Intelligence Store. No hace ingesta nueva, no cambia
// qualification, no modifica el Store.
import { getOrCreateProject } from "./src/lib/intelligence/projects";
import { generateInsights } from "./src/lib/intelligence/synthesis";
import { buildIntelligenceBrief, buildCreativeIntelligenceBrief } from "./src/lib/intelligence/synthesis/briefBuilder";
import { getQualificationByItemId } from "./src/lib/intelligence/qualification";
import { getDb } from "./src/lib/intelligence/connection";
import { writeFileSync } from "node:fs";

const PROJECT_SLUG = "vida-divina";
const MARKET = "MX";

// 1. Resolver el proyecto ya existente (NO crea uno nuevo -- ya existe con id 3948)
const project = getOrCreateProject(PROJECT_SLUG);
console.log(`Project: id=${project.id} slug=${project.slug}`);
if (project.id !== 3948) {
  console.error(`ADVERTENCIA: project.id (${project.id}) no coincide con el esperado (3948).`);
}

// 2. Leer qualification ya calculada -- vía la API canónica del módulo
//    qualification (MI-2/relevance), NO SQL crudo. Solo LECTURA: no se
//    recalcula ni se modifica ningún signal existente.
const qualMap = getQualificationByItemId(project.id);
const relevantItemIds = [...qualMap.entries()].filter(([, d]) => d === "RELEVANT").map(([id]) => id);
const irrelevantItemIds = [...qualMap.entries()].filter(([, d]) => d === "IRRELEVANT").map(([id]) => id);
console.log(`Relevant items (qualification): ${relevantItemIds.length}`);
console.log(`Irrelevant items (qualification): ${irrelevantItemIds.length}`);

const db = getDb();

if (relevantItemIds.length !== 18) {
  console.warn(`ADVERTENCIA: se esperaban 18 relevant, se encontraron ${relevantItemIds.length}`);
}
if (irrelevantItemIds.length !== 9) {
  console.warn(`ADVERTENCIA: se esperaban 9 irrelevant, se encontraron ${irrelevantItemIds.length}`);
}

// 3. Ejecutar MI-3 (analysis, ya corrido)  -> MI-4 (patterns/signals, vía detectPatterns
//    idempotente dentro de generateInsights) -> MI-5 (insights + brief), usando
//    EXCLUSIVAMENTE los 18 item_ids relevantes como evidencia estratégica.
//    generateInsights() resuelve items por id directamente del Store (sin ingesta,
//    sin llamar a ningún adapter) -- ver insightService.ts:resolveItems().
const objective =
  "Generar el primer Intelligence Brief real de Vida Divina a partir de la evidencia ya calificada como relevante en el Intelligence Store (TikTok + Meta Ads).";

console.log(`\nEjecutando generateInsights() con ${relevantItemIds.length} items relevantes...`);
const outcome = await generateInsights({
  project_id: project.id,
  itemIds: relevantItemIds,
  minSupport: 1,
});

if (outcome.status === "insufficient_evidence") {
  console.error(`INSUFFICIENT_EVIDENCE: ${outcome.reason}`);
  console.error(`Items examinados: ${JSON.stringify(outcome.itemsExamined)}`);
  process.exit(1);
}

console.log(`Outcome: ok`);
console.log(`Items considerados: ${outcome.items.length}`);
console.log(`Patterns detectados: ${outcome.patterns.length}`);
console.log(`Insights generados/reutilizados: ${outcome.insights.length}`);

// 4. Construir el Intelligence Brief (MI-5, puro, sin tabla propia)
const brief = buildIntelligenceBrief(
  outcome,
  { query: { itemIds: relevantItemIds }, market: MARKET, language: "es" },
  { objective }
);

writeFileSync("data/tmp/vida_divina_brief.json", JSON.stringify(brief, null, 2));
console.log(`\nBrief completo guardado en data/tmp/vida_divina_brief.json`);

// 5. Creative Intelligence Contract derivado (no publica anuncios)
const creativeBrief = buildCreativeIntelligenceBrief(brief, { objective });
writeFileSync("data/tmp/vida_divina_creative_brief.json", JSON.stringify(creativeBrief, null, 2));

// 6. Imprimir el brief completo para inspección
console.log("\n=== BRIEF ===");
console.log(JSON.stringify(brief, null, 2));

// 7. VALIDACIONES
console.log("\n=== VALIDACIONES ===");

// 7.1 project_id=3948
console.log(`[1] project_id usado: ${project.id} (esperado 3948) -> ${project.id === 3948 ? "OK" : "FALLA"}`);

// 7.2 Solo evidencia RELEVANT
const relevantSet = new Set(relevantItemIds);
const irrelevantSet = new Set(irrelevantItemIds);
const briefItemIds = brief.provenance.item_ids;
const allInRelevant = briefItemIds.every((id) => relevantSet.has(id));
const anyIrrelevant = briefItemIds.filter((id) => irrelevantSet.has(id));
console.log(
  `[2] Todos los item_ids del brief (${briefItemIds.length}) pertenecen a RELEVANT -> ${allInRelevant ? "OK" : "FALLA"}`
);
console.log(`[6] Items IRRELEVANT colados en el brief: ${anyIrrelevant.length} -> ${anyIrrelevant.length === 0 ? "OK" : "FALLA (" + anyIrrelevant.join(",") + ")"}`);

// 7.3 provenance/traceability
console.log(
  `[3] Provenance: item_ids=${brief.provenance.item_ids.length}, evidence_ids=${brief.provenance.evidence_ids.length}, pattern_ids=${brief.provenance.pattern_ids.length}, actor_ids=${brief.provenance.actor_ids.length}`
);

// 7.4 Los 3 insights existentes
const allInsightsForProject = db
  .prepare<[number], { id: number }>("SELECT id FROM insights WHERE project_id = ?")
  .all(project.id);
console.log(`[4] Insights totales en el proyecto (Store): ${allInsightsForProject.length} (esperado 3)`);
console.log(`[4] Insights incluidos en este brief: ${brief.insights.length}`);

// 7.5 Signal FORMAT_FREQUENCY representada
const formatFreqPatterns = outcome.patterns.filter((p) => p.pattern_type === "creative_format_repetition");
console.log(`[5] Patterns creative_format_repetition detectados: ${formatFreqPatterns.length}`);
console.log(`[5] Patterns incluidos en el brief (post context-optimization): ${brief.patterns.length}`);
if (brief.patterns.length > 0) {
  console.log(`[5] Detalle: ${JSON.stringify(brief.patterns.map((p) => ({ id: p.id, name: p.name, type: p.pattern_type, confidence: p.confidence })))}`);
}

console.log("\n=== FIN ===");
process.exit(0);
