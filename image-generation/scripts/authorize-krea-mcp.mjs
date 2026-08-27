// authorize-krea-mcp.mjs — Integración Productiva Krea MCP Directo
// (2026-08-27). Script real de EJECUCIÓN MANUAL, HUMANA, UNA VEZ (Paso 13
// del encargo: "no pedir OAuth para cada imagen") -- completa el flujo
// real OAuth de Krea (dynamic client registration real RFC7591 + PKCE
// real, MISMO flujo ya validado real en
// experiments/krea-mcp-node-poc/) y persiste real los tokens reales vía
// kreaMcpAuthStore.js. Después de correr esto UNA vez, KreaMcpClient real
// (kreaMcpClient.js) puede generar imágenes reales sin volver a abrir un
// navegador real -- hasta que el token real expire y no pueda refrescarse
// real, en cuyo caso hay que correr esto de nuevo real.
//
// Conserva los DOS fixes reales encontrados en el POC:
//   A. el callback real solo se resuelve con "code"/"error" real presente.
//   B. un transport real nuevo para el reintento real tras el primer
//      connect() real fallido (nunca se reutiliza el que ya falló).
//
// Uso real: node image-generation/scripts/authorize-krea-mcp.mjs

import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { createKreaMcpOAuthProvider, KREA_MCP_REDIRECT_URL } from '../src/providers/kreaMcpOAuthProvider.js';
import { kreaMcpAuthFile } from '../src/kreaMcpAuthStore.js';

const KREA_MCP_URL = process.env.KREA_MCP_URL ?? 'https://api.krea.ai/mcp';
const callbackUrl = new URL(KREA_MCP_REDIRECT_URL);
const CALLBACK_PORT = Number(callbackUrl.port) || 8787;

function esperarCodigoDeAutorizacionReal() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${CALLBACK_PORT}`);
      if (url.pathname !== callbackUrl.pathname) { res.writeHead(404); res.end(); return; }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      // Fix A del POC (conservado): solo se cierra con code/error real presente.
      if (!code && !error) { res.writeHead(204); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><p>Autorización real de Krea recibida. Puedes cerrar esta pestaña.</p></body></html>');
      server.close();
      if (error) { reject(new Error(`autorización real rechazada/erró: ${error}`)); return; }
      resolve(code);
    });
    server.listen(CALLBACK_PORT, '127.0.0.1');
    server.on('error', reject);
  });
}

console.log('=== Vida Divina — Autorización real de Krea MCP (una sola vez) ===\n');

const esperaCodigo = esperarCodigoDeAutorizacionReal(); // arrancado ANTES del primer connect() -- sin ventana real de carrera (mismo fix del POC).

const authProvider = createKreaMcpOAuthProvider({
  interactive: true,
  onAuthorizationUrl: (url) => {
    console.log('Abre esta URL real en tu navegador y aprueba el acceso con tu cuenta Krea real:\n');
    console.log(url.toString());
    console.log(`\n(esperando el callback real en ${KREA_MCP_REDIRECT_URL} ...)\n`);
  },
});
const transport = new StreamableHTTPClientTransport(new URL(KREA_MCP_URL), { authProvider });
const client = new Client({ name: 'vida-divina-krea-mcp-setup', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  console.log('Ya había una sesión real autorizada y válida -- nada que hacer.');
  await client.close();
  process.exit(0);
} catch (err) {
  if (!(err instanceof UnauthorizedError) && !/401|unauthor|NonInteractive/i.test(err.message ?? '')) {
    console.error('BLOQUEO real (no es un problema de autorización):', err.message);
    process.exit(1);
  }
}

let code;
try {
  code = await esperaCodigo;
} catch (err) {
  console.error('BLOQUEO real en el callback real:', err.message);
  process.exit(1);
}

console.log('code real recibido, intercambiando por tokens reales...');
try {
  await transport.finishAuth(code);
} catch (err) {
  console.error('BLOQUEO real en el intercambio real de token:', err.message);
  process.exit(1);
}

// Fix B del POC (conservado): transport real NUEVO para el reintento real.
const transport2 = new StreamableHTTPClientTransport(new URL(KREA_MCP_URL), { authProvider });
try {
  await client.connect(transport2);
} catch (err) {
  console.error('BLOQUEO real al reconectar tras autorizar:', err.message);
  process.exit(1);
}

console.log('\n✔ Autorización real de Krea MCP completada y persistida real en:');
console.log(' ', kreaMcpAuthFile());
console.log('\nYa puedes generar imágenes reales vía KreaMcpImageProvider sin volver a abrir el navegador (hasta que el token real expire y no pueda refrescarse).');

await client.close();
