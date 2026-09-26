import { NextRequest, NextResponse } from "next/server";
import { getOverviewData } from "@/lib/intelligence/dashboard/overviewQueries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const projectIdRaw = request.nextUrl.searchParams.get("projectId");
    const projectId = projectIdRaw ? Number(projectIdRaw) : NaN;
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ ok: false, error: "projectId es requerido" }, { status: 200 });
    }
    const sinceDaysRaw = request.nextUrl.searchParams.get("sinceDays");
    const sinceDays = sinceDaysRaw ? Number(sinceDaysRaw) : undefined;

    const data = getOverviewData({ projectId, sinceDays });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
