// calendarService.js — Acciones reales de Google Calendar (FASE "Hermes
// Ventas: Gmail + Google Calendar", 2026-09-18). Una sola función real,
// parametrizada e IDEMPOTENTE: crea un evento de seguimiento solo si no
// existe ya uno vinculado al mismo follow_up_id real del CRM (nunca un
// segundo identificador inventado) -- la vinculación vive en
// extendedProperties.private del propio evento de Google, sin requerir
// ninguna columna nueva en el CRM.

import { getCalendarApi } from './calendarClient.js';

const EXT_PROP_KEY = 'vidaDivinaFollowUpId';

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID || 'primary';
}

/**
 * Crea (o reutiliza si ya existe) el evento real de Calendar asociado a un
 * follow-up real del CRM. Idempotente: una segunda llamada con el mismo
 * followUpId nunca crea un evento duplicado -- devuelve el ya existente.
 *
 * @param {{followUpId: string, titulo: string, descripcion: string, inicioISO: string, finISO: string}} datos
 * @returns {Promise<{eventId: string, reutilizado: boolean, htmlLink: string|null}>}
 */
export async function upsertFollowUpCalendarEvent({ followUpId, titulo, descripcion, inicioISO, finISO }) {
  const calendar = getCalendarApi();
  const cal = calendarId();

  const existentes = await calendar.events.list({
    calendarId: cal,
    privateExtendedProperty: [`${EXT_PROP_KEY}=${followUpId}`],
    maxResults: 1,
    singleEvents: true,
  });
  const yaExiste = existentes.data.items?.[0];
  if (yaExiste) {
    return { eventId: yaExiste.id, reutilizado: true, htmlLink: yaExiste.htmlLink ?? null };
  }

  const { data } = await calendar.events.insert({
    calendarId: cal,
    requestBody: {
      summary: titulo,
      description: descripcion,
      start: { dateTime: inicioISO },
      end: { dateTime: finISO },
      extendedProperties: { private: { [EXT_PROP_KEY]: followUpId } },
    },
  });
  return { eventId: data.id, reutilizado: false, htmlLink: data.htmlLink ?? null };
}
