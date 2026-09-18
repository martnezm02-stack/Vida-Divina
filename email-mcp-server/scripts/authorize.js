#!/usr/bin/env node
// authorize.js — Flujo OAuth2 real, ÚNICO paso manual necesario para
// autorizar Gmail API sobre tienda.vivevidadivina@gmail.com (FASE "Hermes
// ADMIN + Gmail MCP completo", 2026-09-04).
//
// Requiere que YA existan en .env (de este mismo directorio):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
// (creados a mano en Google Cloud Console -- OAuth Client ID tipo "Web
// application", con GOOGLE_REDIRECT_URI = http://localhost:53999/oauth2callback
// añadido como "Authorized redirect URI"; ese paso NO se puede automatizar,
// requiere la cuenta real de Google del negocio).
//
// Puerto 53999 (no 53682): Windows reserva/excluye el rango TCP
// 53614-53713 (`netsh interface ipv4 show excludedportrange protocol=tcp`),
// por lo que 53682 devolvía EACCES al intentar escuchar -- no era un
// conflicto de proceso. 53999 está fuera de todos los rangos excluidos
// confirmados en este entorno. El servidor de este script escucha
// EXPLÍCITAMENTE solo en 127.0.0.1 (loopback), nunca en 0.0.0.0.
//
// Uso: node scripts/authorize.js
//   1. Abre la URL real que imprime en un navegador.
//   2. Inicia sesión con tienda.vivevidadivina@gmail.com y autoriza.
//   3. Este script captura el código real en un servidor local temporal,
//      lo intercambia por un refresh_token real, y lo escribe DIRECTO en
//      .env -- nunca lo imprime en la terminal.

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { GMAIL_SCOPES } from '../src/gmailClient.js';
import { CALENDAR_SCOPES } from '../src/calendarClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '..', '.env');
const CALLBACK_PORT = 53999;
const CALLBACK_HOST = '127.0.0.1';

function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const texto = readFileSync(ENV_PATH, 'utf8');
  const valores = {};
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('=');
    if (eq < 0) continue;
    valores[l.slice(0, eq).trim()] = l.slice(eq + 1).trim();
  }
  return valores;
}

/** Escribe/actualiza UNA clave en .env sin tocar el resto -- nunca imprime el valor real. */
function upsertEnvKey(key, value) {
  const actual = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const lineas = actual.split(/\r?\n/).filter(Boolean);
  const idx = lineas.findIndex((l) => l.startsWith(`${key}=`));
  const nuevaLinea = `${key}=${value}`;
  if (idx >= 0) lineas[idx] = nuevaLinea;
  else lineas.push(nuevaLinea);
  writeFileSync(ENV_PATH, lineas.join('\n') + '\n', 'utf8');
}

async function main() {
  const env = loadEnv();
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_REDIRECT_URI || `http://localhost:${CALLBACK_PORT}/oauth2callback`;

  if (!clientId || !clientSecret) {
    console.error('Faltan GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET reales en email-mcp-server/.env -- créalos primero en Google Cloud Console (OAuth Client ID, tipo "Web application").');
    process.exitCode = 1;
    return;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // necesario para recibir un refresh_token real
    prompt: 'consent', // fuerza a Google a reemitir refresh_token aunque ya se haya autorizado antes
    // Gmail + Calendar en un solo consentimiento real -- mismo refresh_token
    // real sirve para ambos servicios (FASE "Hermes Ventas: Gmail + Google
    // Calendar", 2026-09-18), nunca un segundo flujo OAuth.
    scope: [...GMAIL_SCOPES, ...CALENDAR_SCOPES],
  });

  console.log('Abre esta URL real en tu navegador e inicia sesión con tienda.vivevidadivina@gmail.com:\n');
  console.log(authUrl);
  console.log(`\nEsperando la autorización real en ${redirectUri} ...`);

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== '/oauth2callback') { res.writeHead(404); res.end(); return; }
      const codigoReal = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(error ? `<h1>Autorización cancelada: ${error}</h1>` : '<h1>Listo. Ya puedes cerrar esta pestaña.</h1>');
      server.close();
      if (error) reject(new Error(`Google devolvió un error real: ${error}`));
      else if (codigoReal) resolve(codigoReal);
      else reject(new Error('Google no devolvió ningún "code" real.'));
    });
    // Bind explícito a loopback -- NUNCA 0.0.0.0 (nunca expuesto a la red).
    server.listen(CALLBACK_PORT, CALLBACK_HOST);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error('Google no devolvió un refresh_token real esta vez (puede pasar si ya se autorizó antes sin revocar el acceso). Revoca el acceso en https://myaccount.google.com/permissions y vuelve a ejecutar este script.');
    process.exitCode = 1;
    return;
  }

  upsertEnvKey('GOOGLE_REDIRECT_URI', redirectUri);
  upsertEnvKey('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
  console.log('\nListo -- refresh_token real guardado en email-mcp-server/.env (nunca impreso aquí).');
}

main().catch((err) => {
  console.error('[authorize] fallo real:', err.message);
  process.exitCode = 1;
});
