import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

// GET/POST /api/personalizacion/horarios -- Horarios de atención (FASE
// "Rediseño Dashboard Hermes Ventas", 2026-09-18).
//
// CONTRATO / FUENTE DE VERDAD (documentado explícitamente, tal como pide el
// encargo, antes de escribir ninguna lógica adicional): no existía NINGÚN
// backend real de horarios de atención en todo el proyecto antes de esto
// (búsqueda dirigida confirmada). Se reutiliza el ÚNICO almacén genérico
// clave/valor YA existente (la tabla `settings` de hermes-kit/src/lib/db.ts,
// el mismo que ya usa /api/settings para paused/model/temperature/etc.) --
// nunca una tabla ni persistencia nueva. La clave real es
// "business_hours", con un valor JSON real por día de la semana
// (lunes..domingo -> {abierto, desde, hasta}).
//
// ALCANCE DELIBERADAMENTE LIMITADO: esta ruta solo GUARDA y DEVUELVE el
// horario real que el administrador configure -- NO existe todavía ninguna
// lógica que lea este valor para pausar/activar al agente automáticamente
// fuera de esas horas (eso sería comportamiento nuevo no pedido
// explícitamente, y el encargo pide no inventar comportamiento). Si se
// quiere que el agente respete el horario real, es un paso aparte
// (consultar este mismo setting desde el flujo de mensajes real).
export const dynamic = "force-dynamic";

const SETTING_KEY = "business_hours";
const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;
type Dia = (typeof DIAS)[number];
type HorarioDia = { abierto: boolean; desde: string; hasta: string };
type Horarios = Record<Dia, HorarioDia>;

function horarioVacio(): Horarios {
  const out = {} as Horarios;
  for (const d of DIAS) out[d] = { abierto: false, desde: "09:00", hasta: "18:00" };
  return out;
}

function esHorarioDiaValido(v: unknown): v is HorarioDia {
  if (!v || typeof v !== "object") return false;
  const h = v as Record<string, unknown>;
  return typeof h.abierto === "boolean" && typeof h.desde === "string" && typeof h.hasta === "string";
}

export async function GET(): Promise<NextResponse> {
  const raw = getSetting(SETTING_KEY);
  if (!raw) return NextResponse.json({ ok: true, horarios: horarioVacio(), configurado: false });
  try {
    const parsed = JSON.parse(raw);
    return NextResponse.json({ ok: true, horarios: parsed, configurado: true });
  } catch {
    return NextResponse.json({ ok: true, horarios: horarioVacio(), configurado: false });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Horarios;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  for (const d of DIAS) {
    if (!esHorarioDiaValido(body[d])) {
      return NextResponse.json({ ok: false, error: `Horario inválido para "${d}".` }, { status: 400 });
    }
  }

  setSetting(SETTING_KEY, JSON.stringify(body));
  return NextResponse.json({ ok: true, horarios: body, configurado: true });
}
