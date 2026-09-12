import { NextRequest, NextResponse } from "next/server";
import { resolveHandoffAlert } from "@/lib/vidaDivina/alertas";

// POST /api/alertas/resolve -- marca un handoff real como resuelto (FASE
// "Hacer operativo resolveHandoff", 2026-09-11). Ruta exclusiva del
// Dashboard: nunca se expone como tool de Hermes ni es alcanzable desde
// una conversación de WhatsApp -- un cliente no tiene forma de invocarla.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { handoffId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const { handoffId } = body;
  if (!handoffId || typeof handoffId !== "string") {
    return NextResponse.json({ ok: false, error: "Falta handoffId" }, { status: 400 });
  }

  const resultado = await resolveHandoffAlert(handoffId);
  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
