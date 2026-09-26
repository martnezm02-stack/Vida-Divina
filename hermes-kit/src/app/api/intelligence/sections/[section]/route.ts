import { NextRequest, NextResponse } from "next/server";
import { getAllSignals, getAllInsights, getAllActors, getAllPatterns, getAllWatchlists } from "@/lib/intelligence/dashboard/sectionQueries";

export const dynamic = "force-dynamic";

const HANDLERS: Record<string, (projectId: number) => unknown> = {
  signals: getAllSignals,
  insights: getAllInsights,
  actors: getAllActors,
  patterns: getAllPatterns,
  watchlists: getAllWatchlists,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ section: string }> }
): Promise<NextResponse> {
  try {
    const { section } = await params;
    const handler = HANDLERS[section];
    if (!handler) {
      return NextResponse.json({ ok: false, error: `sección desconocida: ${section}` }, { status: 200 });
    }
    const projectIdRaw = request.nextUrl.searchParams.get("projectId");
    const projectId = projectIdRaw ? Number(projectIdRaw) : NaN;
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ ok: false, error: "projectId es requerido" }, { status: 200 });
    }
    const data = handler(projectId);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
