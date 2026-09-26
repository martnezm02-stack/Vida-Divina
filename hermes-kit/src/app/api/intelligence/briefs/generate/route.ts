import { NextRequest, NextResponse } from "next/server";
import { generateBrief } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

/**
 * Intelligence Briefs no se persisten (ver synthesis/briefBuilder.ts --
 * "sin tabla propia"): esta ruta genera un brief EN VIVO bajo demanda,
 * nunca lee un historial que no existe.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { projectId?: number; market?: string; language?: string };
    const projectId = Number(body.projectId);
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ ok: false, error: "projectId es requerido" }, { status: 200 });
    }

    const outcome = await generateBrief({
      project_id: projectId,
      query: { project_id: projectId, limit: 50 },
      market: body.market ?? null,
      language: body.language ?? null,
    });

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
