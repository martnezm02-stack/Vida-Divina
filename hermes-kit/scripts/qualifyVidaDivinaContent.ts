// qualifyVidaDivinaContent.ts — Corre Content Qualification
// (src/lib/intelligence/qualification/, nuevo pero SOLO reutiliza
// DecisionProvider + upsertSignal ya existentes) sobre TODOS los items
// reales de project_id=3948 (Vida Divina), y persiste cada decisión como
// signal QUALIFICATION_* (idempotente por item, ver qualificationRecorder.ts).
//
// Nunca borra ni modifica el item raw -- separa RAW EVIDENCE (la fila en
// intelligence_items, intacta) de QUALIFIED INTELLIGENCE (la signal
// QUALIFICATION_* asociada), tal como pide la corrección de este bloque.
//
// Ejecutar con: npx tsx scripts/qualifyVidaDivinaContent.ts
import "./env-loader";
import { getDb } from "../src/lib/intelligence/connection";
import { getProjectBySlug } from "../src/lib/intelligence/projects";
import { getActorById } from "../src/lib/intelligence/actors";
import { evaluateContentQualification, recordQualificationSignal } from "../src/lib/intelligence/qualification";
import type { BrandDescriptor, QualificationContext } from "../src/lib/intelligence/qualification";

const PROJECT_SLUG = "vida-divina";

// Tokens ANCLADOS (compuestos, sin espacios) -- nunca la palabra genérica
// "divina" sola, que es exactamente lo que produjo el falso positivo real
// (@bibliadivina.oficial, @divina_oficial) durante la ingestión.
const VIDA_DIVINA_BRAND: BrandDescriptor = {
  name: "Vida Divina",
  brandTokens: ["vidadivina", "tedivina"],
  lookalikeTokens: ["divina"],
};

interface ItemRow {
  id: number;
  actor_id: number | null;
  canonical_url: string | null;
  description: string | null;
  metadata_json: string | null;
}

function extractPageName(metadataJson: string | null): string | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { source_metadata?: { page_name?: string } };
    return parsed.source_metadata?.page_name ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const project = getProjectBySlug(PROJECT_SLUG);
  if (!project) {
    console.error(JSON.stringify({ error: `proyecto '${PROJECT_SLUG}' no encontrado` }));
    process.exit(1);
  }

  const items = getDb()
    .prepare<[number], ItemRow>(
      "SELECT id, actor_id, canonical_url, description, metadata_json FROM intelligence_items WHERE project_id = ?"
    )
    .all(project!.id);

  const results: Array<{ itemId: number; decision: string; confidence: number; rationale: string }> = [];

  for (const item of items) {
    const actor = item.actor_id !== null ? getActorById(item.actor_id) : null;
    const context: QualificationContext = {
      project: { id: project!.id, slug: project!.slug },
      brand: VIDA_DIVINA_BRAND,
      item: {
        id: item.id,
        canonical_url: item.canonical_url,
        // Sin truncar: a diferencia de relevance/types.ts (snippet corto solo
        // para dar contexto legible a un DecisionProvider), la qualification
        // determinista necesita escanear el texto COMPLETO buscando el token
        // de marca -- truncar produjo un falso UNCERTAIN real (item 7287: el
        // hashtag "#VidaDivina" aparecía después del carácter 300).
        description_snippet: item.description ?? null,
        source_metadata_page_name: extractPageName(item.metadata_json),
      },
      actor: actor ? { handle: actor.handle, display_name: actor.display_name } : null,
    };

    const decision = await evaluateContentQualification(context, null);
    recordQualificationSignal(context, decision);
    results.push({ itemId: item.id, decision: decision.decision, confidence: decision.confidence, rationale: decision.rationale });
  }

  const summary = {
    total: results.length,
    relevant: results.filter((r) => r.decision === "RELEVANT").length,
    irrelevant: results.filter((r) => r.decision === "IRRELEVANT").length,
    uncertain: results.filter((r) => r.decision === "UNCERTAIN").length,
  };

  console.log(JSON.stringify({ summary, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
