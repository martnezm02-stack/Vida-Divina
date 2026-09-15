// gmailClient.js — Cliente real de Gmail API (OAuth2) para la cuenta real
// tienda.vivevidadivina@gmail.com (FASE "Hermes ADMIN + Gmail MCP completo",
// 2026-09-04).
//
// SCOPES REALES solicitados (documentados, mínimos posibles con la API real
// de Gmail -- nunca el scope máximo "https://mail.google.com/"):
//   - https://www.googleapis.com/auth/gmail.readonly
//       Lectura: searchEmails, readEmail, summarizeEmails.
//   - https://www.googleapis.com/auth/gmail.modify
//       Gestión: createDraft, updateDraft, trashEmail (mover a papelera,
//       NUNCA borrado permanente -- gmail.modify explícitamente excluye
//       "immediate, permanent deletion... bypassing Trash").
//
// NOTA HONESTA sobre el scope de envío: Gmail NO ofrece un scope granular
// "modificar pero nunca enviar" -- gmail.modify técnicamente SÍ permite
// invocar drafts.send/messages.send a nivel de API. La separación real
// entre "modificación" y "envío" que pide esta fase se aplica aquí a nivel
// de APLICACIÓN (código), no de scope: ninguna función de este archivo
// distinta de sendApprovedGmailDraft llama jamás a un método de envío real
// de la API. No se solicita el scope gmail.send por separado porque no
// reduce el acceso ya concedido por gmail.modify -- pedirlo además sería
// más superficie de permiso, no menos.
//
// Credenciales reales SOLO por variables de entorno (nunca hardcodeadas,
// nunca logueadas): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REDIRECT_URI, GOOGLE_REFRESH_TOKEN (generado una única vez con
// scripts/authorize.js, ver ese archivo).

import { google } from 'googleapis';

export const GMAIL_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
]);

export function gmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

/** Cliente OAuth2 real -- credenciales leídas en cada llamada (nunca cacheadas en un const de módulo), mismo criterio ya usado en dashboard/server/lib/voiceEngineClient.js. */
export function buildOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

let _gmail = null;
export function getGmailApi() {
  if (!gmailConfigured()) {
    throw new Error('Gmail no está configurado en este entorno (falta GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI/GOOGLE_REFRESH_TOKEN). Ejecuta scripts/authorize.js una vez para generarlas.');
  }
  if (!_gmail) {
    _gmail = google.gmail({ version: 'v1', auth: buildOAuth2Client() });
  }
  return _gmail;
}
