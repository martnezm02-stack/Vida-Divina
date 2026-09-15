// reportPeriods.ts — Resolución de periodos reales para reporting (FASE
// "Attribution + Reporting + Email MCP + Alerta WhatsApp", 2026-09-04).
// Puro, sin I/O. `until` es siempre EXCLUSIVO ([since, until)), mismo
// criterio ya usado por crm/repositories/*.js (ej.
// opportunityRepository.listCreatedBetween).

export type PeriodKeyword = "hoy" | "ayer" | "esta_semana" | "semana_pasada" | "este_mes" | "mes_pasado";

export interface ResolvedPeriod {
  since: Date;
  until: Date;
  label: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
  // Semana real inicia en lunes (convención de negocio en español).
  const dia = d.getDay(); // 0=domingo
  const diff = (dia === 0 ? -6 : 1) - dia;
  const lunes = new Date(d);
  lunes.setDate(d.getDate() + diff);
  return startOfDay(lunes);
}

/** Resuelve una palabra clave de periodo a [since, until) reales, en hora local. */
export function resolvePeriodKeyword(keyword: PeriodKeyword, ahora: Date = new Date()): ResolvedPeriod {
  const hoyInicio = startOfDay(ahora);

  switch (keyword) {
    case "hoy": {
      const until = new Date(hoyInicio);
      until.setDate(until.getDate() + 1);
      return { since: hoyInicio, until, label: "hoy" };
    }
    case "ayer": {
      const since = new Date(hoyInicio);
      since.setDate(since.getDate() - 1);
      return { since, until: hoyInicio, label: "ayer" };
    }
    case "esta_semana": {
      const since = startOfWeek(ahora);
      const until = new Date(hoyInicio);
      until.setDate(until.getDate() + 1);
      return { since, until, label: "esta semana" };
    }
    case "semana_pasada": {
      const inicioEstaSemana = startOfWeek(ahora);
      const since = new Date(inicioEstaSemana);
      since.setDate(since.getDate() - 7);
      return { since, until: inicioEstaSemana, label: "la semana pasada" };
    }
    case "este_mes": {
      const since = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      const until = new Date(hoyInicio);
      until.setDate(until.getDate() + 1);
      return { since, until, label: "este mes" };
    }
    case "mes_pasado": {
      const since = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const until = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { since, until, label: "el mes pasado" };
    }
    default:
      throw new Error(`reportPeriods: periodo desconocido "${keyword}".`);
  }
}

/** Rango de fechas explícito real (YYYY-MM-DD), `hasta` inclusivo en el input pero exclusivo internamente (+1 día). */
export function resolveDateRange(desde: string, hasta: string): ResolvedPeriod {
  const since = new Date(`${desde}T00:00:00`);
  const untilInclusivo = new Date(`${hasta}T00:00:00`);
  if (Number.isNaN(since.getTime()) || Number.isNaN(untilInclusivo.getTime())) {
    throw new Error(`reportPeriods: rango de fechas inválido ("${desde}" - "${hasta}"). Usa formato YYYY-MM-DD.`);
  }
  const until = new Date(untilInclusivo);
  until.setDate(until.getDate() + 1);
  return { since, until, label: `del ${desde} al ${hasta}` };
}
