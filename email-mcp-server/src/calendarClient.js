// calendarClient.js — Cliente real de Google Calendar API (OAuth2) para el
// mismo proyecto/cuenta de Google ya autorizados para Gmail (FASE "Hermes
// Ventas: Gmail + Google Calendar", 2026-09-18). Reutiliza EXACTAMENTE el
// cliente OAuth2 y las credenciales reales de gmailClient.js
// (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI/REFRESH_TOKEN) -- mismo refresh
// token real sirve para ambos servicios en cuanto se autoriza con el scope
// combinado (ver scripts/authorize.js), nunca un segundo flujo OAuth ni una
// segunda credencial paralela.
//
// SCOPE REAL solicitado (mínimo posible): calendar.events (crear/leer
// eventos, nunca administrar calendarios completos).

import { google } from 'googleapis';
import { buildOAuth2Client, gmailConfigured } from './gmailClient.js';

export const CALENDAR_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/calendar.events',
]);

// Mismas 4 variables reales que ya valida gmailConfigured() (mismo cliente
// OAuth2, mismo proyecto de Google Cloud) -- se reutiliza el chequeo en vez
// de repetirlo.
export const calendarConfigured = gmailConfigured;

let _calendar = null;
export function getCalendarApi() {
  if (!calendarConfigured()) {
    throw new Error('Google Calendar no está configurado en este entorno (falta GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI/GOOGLE_REFRESH_TOKEN). Ejecuta scripts/authorize.js una vez para generarlas.');
  }
  if (!_calendar) {
    _calendar = google.calendar({ version: 'v3', auth: buildOAuth2Client() });
  }
  return _calendar;
}
