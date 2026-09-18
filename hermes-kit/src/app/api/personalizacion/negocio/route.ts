import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

// GET /api/personalizacion/negocio -- lectura real de prompts/negocio.md,
// el ÚNICO backend real existente del guion de negocio (editado hoy vía el
// flujo /personaliza de Claude Code). Solo lectura deliberada: esta ruta
// NUNCA escribe -- reescribir el guion comercial completo desde un textarea
// del Dashboard sin ninguna validación es un cambio de alto riesgo/negocio
// real, fuera del alcance de esta fase. Editar el guion sigue haciéndose
// con /personaliza (ver hermes-kit/CLAUDE.md) -- nunca una segunda fuente.
export const dynamic = "force-dynamic";

const NEGOCIO_PATH = path.join(process.cwd(), "prompts", "negocio.md");

export async function GET(): Promise<NextResponse> {
  try {
    const contenido = fs.readFileSync(NEGOCIO_PATH, "utf-8");
    const sinRellenar = /\[[A-ZÁÉÍÓÚÑ_]{3,}\]/.test(contenido);
    return NextResponse.json({ ok: true, contenido, sinRellenar });
  } catch (err) {
    return NextResponse.json(
      { ok: false, contenido: "", sinRellenar: true, error: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}
