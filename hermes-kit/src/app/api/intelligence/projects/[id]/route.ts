import { NextResponse } from "next/server";
import { getProjectByIdForSwitcher } from "@/lib/intelligence/dashboard/projectQueries";

export const dynamic = "force-dynamic";

/** Hidrata el proyecto activo por id directamente -- independiente de si aparece o no en la página actual del switcher (que solo trae los primeros N resultados de una búsqueda). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const projectId = Number(id);
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 200 });
    }
    const data = getProjectByIdForSwitcher(projectId);
    if (!data) {
      return NextResponse.json({ ok: false, error: "proyecto no encontrado" }, { status: 200 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
