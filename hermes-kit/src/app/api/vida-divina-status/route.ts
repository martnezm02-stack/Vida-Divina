import { NextResponse } from "next/server";
import { getVidaDivinaSystemStatus } from "@/lib/vidaDivina/systemStatus";

// Estado real de las integraciones de la fase "Hermes end-to-end Vida
// Divina" -- lectura pura, nunca escribe ni envía nada. Reutiliza
// getVidaDivinaSystemStatus() (también usada por la tool administrativa
// adminEstadoSistema -- nunca una segunda forma de comprobar lo mismo).
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await getVidaDivinaSystemStatus());
}
