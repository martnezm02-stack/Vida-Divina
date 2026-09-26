import { NextResponse } from "next/server";
import { getItemDetail } from "@/lib/intelligence/dashboard/marketIntelligenceQueries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isFinite(itemId)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 200 });
    }
    const data = getItemDetail(itemId);
    if (!data) {
      return NextResponse.json({ ok: false, error: "item no encontrado" }, { status: 200 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
