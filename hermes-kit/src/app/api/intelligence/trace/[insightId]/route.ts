import { NextResponse } from "next/server";
import { traceInsight } from "@/lib/intelligence/dashboard/evidenceQueries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ insightId: string }> }
): Promise<NextResponse> {
  try {
    const { insightId } = await params;
    const id = Number(insightId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "insightId inválido" }, { status: 200 });
    }
    const data = traceInsight(id);
    if (!data) {
      return NextResponse.json({ ok: false, error: "insight no encontrado" }, { status: 200 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
