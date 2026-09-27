import { NextRequest, NextResponse } from "next/server";
import { generateBrief, getQualificationByItemId } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

/**
 * Intelligence Briefs no se persisten (ver synthesis/briefBuilder.ts --
 * "sin tabla propia"): esta ruta genera un brief EN VIVO bajo demanda,
 * nunca lee un historial que no existe.
 *
 * Filtra SIEMPRE por Content Qualification (RELEVANT) antes de generar el
 * brief -- defecto real detectado en validación: sin este filtro, el brief
 * usaba `query: { project_id, limit: 50 }` (TODO el raw evidence, incluidos
 * los items marcados IRRELEVANT por qualification), contradiciendo la
 * separación RAW evidence vs. evidencia estratégica calificada. Si un
 * proyecto no tiene ningún item calificado todavía (qualification nunca
 * corrió), se degrada al comportamiento anterior (todos los items) en vez
 * de bloquear -- para no romper proyectos sin qualification configurada.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { projectId?: number; market?: string; language?: string };
    const projectId = Number(body.projectId);
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ ok: false, error: "projectId es requerido" }, { status: 200 });
    }

    const qualification = getQualificationByItemId(projectId);
    const relevantItemIds = [...qualification.entries()]
      .filter(([, decision]) => decision === "RELEVANT")
      .map(([itemId]) => itemId);

    const outcome = await generateBrief(
      relevantItemIds.length > 0
        ? {
            project_id: projectId,
            itemIds: relevantItemIds,
            market: body.market ?? null,
            language: body.language ?? null,
          }
        : {
            // Sin qualification calculada todavía para este proyecto -- se
            // conserva el comportamiento previo (todo el raw evidence) en
            // vez de devolver insufficient_evidence artificialmente.
            project_id: projectId,
            query: { project_id: projectId, limit: 50 },
            market: body.market ?? null,
            language: body.language ?? null,
          }
    );

    if (outcome.status !== "ok") {
      return NextResponse.json({ ok: true, data: { status: "insufficient_evidence", reason: outcome.reason } });
    }
    return NextResponse.json({ ok: true, data: { status: "ok", brief: outcome.brief } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
