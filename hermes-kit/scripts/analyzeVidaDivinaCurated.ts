// analyzeVidaDivinaCurated.ts — Ejecuta Analysis -> Patterns -> Insights ->
// Brief (MI-3..MI-5, sin tocar) sobre el subconjunto CURADO de items
// reales de project_id=3948 que genuinamente mencionan/pertenecen a Vida
// Divina.
//
// Por qué un subconjunto curado y no todos los items ingeridos: la
// búsqueda TikTok real (keyword "vidadivina.oficial", vía Monid,
// ingestVidaDivinaReal.ts) devolvió coincidencias por similitud difusa de
// texto/handle -- 8 items de @bibliadivina.oficial (contenido de
// oraciones/Biblia, sin relación con Vida Divina) y 1 item de
// @divina_oficial sobre una canción de Karol G. Ambos casos son
// exactamente lo que la tarea prohíbe asociar ("no asociar datos
// simplemente porque contengan las palabras Vida Divina"). El Intelligence
// Store es append-only por diseño (items.ts no expone delete/remove, ver
// researchService.ts: "nunca UPDATE/DELETE directo") -- esos 9 items
// permanecen como evidencia cruda real (nunca se fabricaron, son
// resultados reales del bridge), pero el ANÁLISIS/PATTERNS/INSIGHTS/BRIEF
// se ejecuta solo sobre los 18 items verificados manualmente como
// inequívocamente relacionados con Vida Divina (15 TikTok + 3 Meta Ads).
import "./env-loader";
import { analyzeItems, creativeAnalysisProvider } from "../src/lib/intelligence/analysis";
import { generateBrief } from "../src/lib/intelligence/synthesis";
import { getProjectBySlug } from "../src/lib/intelligence/projects";

const PROJECT_SLUG = "vida-divina";

// TikTok genuinamente relevante (hashtag/mención explícita de Vida Divina o
// Té Divina, verificado leyendo el texto completo de cada item) + los 3
// Meta Ads reales (page_name = "Vida Divina Durango" / "Alcino Vida
// Divina"). Excluidos explícitamente: 8 items de @bibliadivina.oficial y 1
// de @divina_oficial (Karol G) -- ver arriba.
const RELEVANT_ITEM_IDS = [
  7281, 7283, 7284, 7285, 7286, 7287, 7288, 7289, 7290, 7292, 7293, 7294, 7295, 7296, 7298, // TikTok (15)
  7299, 7300, 7301, // Meta Ads (3)
];

async function main(): Promise<void> {
  const project = getProjectBySlug(PROJECT_SLUG);
  if (!project) {
    console.error(JSON.stringify({ error: `proyecto '${PROJECT_SLUG}' no encontrado` }));
    process.exit(1);
  }

  const { run } = await analyzeItems(
    { project_id: project!.id, itemIds: RELEVANT_ITEM_IDS, analysisType: "creative_summary" },
    creativeAnalysisProvider
  );

  const briefOutcome = await generateBrief({
    project_id: project!.id,
    itemIds: RELEVANT_ITEM_IDS,
    language: "es",
  });

  console.log(
    JSON.stringify(
      {
        analysisRun: { id: run.id, analysis_type: run.analysis_type, item_ids: run.item_ids },
        briefOutcome,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
