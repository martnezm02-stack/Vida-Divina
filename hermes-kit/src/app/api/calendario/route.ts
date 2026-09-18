import { NextRequest, NextResponse } from "next/server";
import { listCalendarioEventos } from "@/lib/vidaDivina/calendarioView";
import { agendarSeguimiento, type TipoSeguimiento } from "@/lib/vidaDivina/seguimientoService";

// GET /api/calendario?since=ISO&until=ISO -- seguimientos reales (CRM,
// fuente de verdad) en el rango pedido, con cliente/pedido/producto reales
// cuando existan. POST crea/reutiliza un seguimiento real (mismo núcleo
// real que la tool adminAgendarSeguimiento -- ver seguimientoService.ts,
// nunca una segunda implementación). El Dashboard es la propia superficie
// administrativa (mismo criterio de confianza que /api/settings, sin una
// segunda capa de identidad por teléfono) -- FASE "Rediseño Dashboard
// Hermes Ventas", 2026-09-18.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get("since");
  const untilParam = searchParams.get("until");

  // Por defecto: mes actual completo (vista "Mes" del Calendario).
  const ahora = new Date();
  const since = sinceParam ? new Date(sinceParam) : new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const until = untilParam ? new Date(untilParam) : new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);

  try {
    const eventos = await listCalendarioEventos(since, until);
    return NextResponse.json({ ok: true, eventos });
  } catch (err) {
    return NextResponse.json({ ok: false, eventos: [], error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { orderId?: string; tipo?: TipoSeguimiento; notas?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (!body.orderId || !body.tipo) {
    return NextResponse.json({ ok: false, error: "Falta orderId/tipo real." }, { status: 400 });
  }

  const res = await agendarSeguimiento({ orderId: body.orderId, tipo: body.tipo, notas: body.notas });
  return NextResponse.json(res);
}
