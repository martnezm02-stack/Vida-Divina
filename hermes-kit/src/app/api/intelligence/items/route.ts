import { NextRequest, NextResponse } from "next/server";
import { listMarketIntelligenceItems } from "@/lib/intelligence/dashboard/marketIntelligenceQueries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const projectIdRaw = params.get("projectId");
    const projectId = projectIdRaw ? Number(projectIdRaw) : NaN;
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ ok: false, error: "projectId es requerido" }, { status: 200 });
    }

    const limitRaw = params.get("limit");
    const offsetRaw = params.get("offset");
    const actorIdRaw = params.get("actorId");

    const data = listMarketIntelligenceItems({
      projectId,
      sourceSlug: params.get("source") ?? undefined,
      actorId: actorIdRaw ? Number(actorIdRaw) : undefined,
      contentType: params.get("contentType") ?? undefined,
      market: params.get("market") ?? undefined,
      format: params.get("format") ?? undefined,
      style: params.get("style") ?? undefined,
      funnelStage: params.get("funnelStage") ?? undefined,
      search: params.get("search") ?? undefined,
      limit: limitRaw ? Number(limitRaw) : undefined,
      offset: offsetRaw ? Number(offsetRaw) : undefined,
    });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
