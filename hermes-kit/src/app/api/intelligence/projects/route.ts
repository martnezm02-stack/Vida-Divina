import { NextRequest, NextResponse } from "next/server";
import { listProjectsForSwitcher, getDefaultProject } from "@/lib/intelligence/dashboard/projectQueries";

export const dynamic = "force-dynamic";

/**
 * Lista paginada/buscable (no listProjects() completo -- en la BD real hay
 * miles de proyectos de test acumulados) + el proyecto por defecto
 * calculado server-side, en una sola llamada para que el switcher no tenga
 * que hacer dos round-trips al abrir.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const search = params.get("search") ?? undefined;
    const limitRaw = params.get("limit");
    const offsetRaw = params.get("offset");

    const list = listProjectsForSwitcher({
      search,
      limit: limitRaw ? Number(limitRaw) : undefined,
      offset: offsetRaw ? Number(offsetRaw) : undefined,
    });
    const defaultProject = getDefaultProject();

    return NextResponse.json({ ok: true, data: { ...list, defaultProject } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
