import { NextRequest, NextResponse } from "next/server";
import { listProjectsForSwitcher, getDefaultProject, countAllProjects } from "@/lib/intelligence/dashboard/projectQueries";

export const dynamic = "force-dynamic";

/**
 * Lista buscable DENTRO del workspace comercial (allowlist -- ver
 * commercialProjects.ts, nunca la tabla completa de proyectos) + el
 * proyecto por defecto calculado server-side, en una sola llamada para que
 * el switcher no tenga que hacer dos round-trips al abrir. `totalAllProjects`
 * es solo informativo (Configuración): cuenta TODOS los proyectos del
 * Intelligence Store, comerciales + internos/test, sin listarlos.
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
    const totalAllProjects = countAllProjects();

    return NextResponse.json({ ok: true, data: { ...list, defaultProject, totalAllProjects } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
