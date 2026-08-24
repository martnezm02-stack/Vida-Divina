// attributionWindow.js — Fase 10. La ventana SOLO acota qué eventos
// comerciales son candidatos (conversations/opportunities creadas dentro
// de [publishedAt, publishedAt + N días]) -- nunca decide, por sí sola,
// que la publicación causó el evento. La clasificación real vive en
// evidenceModel.js y nunca recibe la ventana como argumento.

export const ATTRIBUTION_WINDOWS = Object.freeze({ '1d': 1, '7d': 7, '28d': 28 });
export const DEFAULT_ATTRIBUTION_WINDOW = '7d';

/** @returns {{since: Date, until: Date}} */
export function windowRange(publishedAt, windowKey = DEFAULT_ATTRIBUTION_WINDOW) {
  if (!(windowKey in ATTRIBUTION_WINDOWS)) {
    throw new Error(`windowRange: ventana inválida "${windowKey}" (válidas: ${Object.keys(ATTRIBUTION_WINDOWS).join(', ')}).`);
  }
  if (!publishedAt) throw new Error('windowRange: "publishedAt" es obligatorio.');
  const since = new Date(publishedAt);
  if (Number.isNaN(since.getTime())) throw new Error(`windowRange: "publishedAt" inválido "${publishedAt}".`);
  const until = new Date(since.getTime() + ATTRIBUTION_WINDOWS[windowKey] * 24 * 60 * 60 * 1000);
  return { since, until };
}
