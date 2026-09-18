import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

// GET /api/personalizacion/general -- lectura real de docs/09-personalizar-dashboard.md
// (la documentación real YA existente de branding/identidad: nombre, colores,
// logo, fondo -- ver Logo.tsx/globals.css/AmbientBackground.tsx). Solo
// lectura: esos archivos son código fuente, se editan con Claude Code
// (/personaliza o pidiéndolo directo), nunca desde un formulario nuevo que
// dupliraría esa fuente de verdad.
export const dynamic = "force-dynamic";

const DOC_PATH = path.join(process.cwd(), "docs", "09-personalizar-dashboard.md");

export async function GET(): Promise<NextResponse> {
  try {
    const contenido = fs.readFileSync(DOC_PATH, "utf-8");
    return NextResponse.json({ ok: true, contenido });
  } catch (err) {
    return NextResponse.json({ ok: false, contenido: "", error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}
