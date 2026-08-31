// staleness.js — Marketing Intelligence: clasificación ACTIVE/STALE/ARCHIVED
// (sección 26 del encargo). Nunca borra señales -- solo etiqueta actualidad
// relativa a la fecha actual real (Date.now()), usando timeWindow como
// referencia de cuánto dura la "vigencia" de una señal antes de decaer.
//
// Umbrales deterministas y documentados, no un modelo de decaimiento
// "científico" -- señales con timeWindow='not_time_bound' (hechos
// estructurales: marco regulatorio, identidad de marca, fundación de la
// empresa) decaen mucho más lento que señales sociales de 30d/90d.

const DAY_MS = 24 * 60 * 60 * 1000;

const THRESHOLDS_DAYS = Object.freeze({
  '30d': { active: 45, stale: 180 },
  '90d': { active: 120, stale: 365 },
  not_time_bound: { active: 365, stale: 730 },
});

export function classifySignalStaleness(signal, now = Date.now()) {
  const captured = new Date(signal.capturedAt).getTime();
  if (Number.isNaN(captured)) return 'ACTIVE'; // capturedAt no parseable: no se inventa antigüedad, se trata como vigente.

  const thresholds = THRESHOLDS_DAYS[signal.timeWindow] ?? THRESHOLDS_DAYS.not_time_bound;
  const ageDays = (now - captured) / DAY_MS;

  if (ageDays <= thresholds.active) return 'ACTIVE';
  if (ageDays <= thresholds.stale) return 'STALE';
  return 'ARCHIVED';
}
