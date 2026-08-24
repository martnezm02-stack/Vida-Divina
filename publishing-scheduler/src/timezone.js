// timezone.js — combina fecha + hora + timezone IANA explícito en un
// instante UTC real (ISO 8601), sin asumir UTC y sin dependencias nuevas
// (usa Intl, nativo de Node >=18 -- mismo criterio zero-dependency del
// resto del proyecto, nunca se agrega date-fns/luxon/moment).
//
// Técnica estándar de "punto fijo" para resolver el offset de una zona
// horaria real en una fecha/hora concretas sin una tabla de zonas propia:
// 1) se interpreta la fecha/hora local como si fuera UTC (una primera
//    aproximación, "guessUtcMs");
// 2) se formatea esa marca de tiempo EN la zona horaria real pedida;
// 3) la diferencia entre lo que Intl reporta y la aproximación inicial ES
//    el offset real de esa zona en ese instante (incluye DST si aplica);
// 4) se resta ese offset de la aproximación para obtener el instante UTC real.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} dateStr — "YYYY-MM-DD"
 * @param {string} timeStr — "HH:mm" (24h)
 * @param {string} timeZone — identificador IANA real, ej. "America/Mexico_City"
 * @returns {string} instante UTC real en ISO 8601 (con "Z")
 */
export function zonedTimeToUtcIso(dateStr, timeStr, timeZone) {
  if (!DATE_RE.test(dateStr ?? '')) throw new Error(`zonedTimeToUtcIso: "date" inválida "${dateStr}" (formato esperado YYYY-MM-DD).`);
  if (!TIME_RE.test(timeStr ?? '')) throw new Error(`zonedTimeToUtcIso: "time" inválida "${timeStr}" (formato esperado HH:mm, 24h).`);
  if (!isValidTimeZone(timeZone)) throw new Error(`zonedTimeToUtcIso: "timeZone" inválida "${timeZone}" -- debe ser un identificador IANA real (ej. "America/Mexico_City").`);

  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guessUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(guessUtcMs)).map((p) => [p.type, p.value]));
  const renderedAsUtcMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offsetMs = renderedAsUtcMs - guessUtcMs;

  return new Date(guessUtcMs - offsetMs).toISOString();
}
