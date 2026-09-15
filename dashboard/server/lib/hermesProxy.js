// hermesProxy.js — reverse proxy real de /hermes* hacia el proceso Next.js
// del kit de WhatsApp/Hermes (hermes-kit/, puerto propio -- ver
// hermes-kit/.env.local#PORT). Integración "WhatsApp / Hermes" (2026-09-04).
//
// NUNCA reimplementa el dashboard del kit: reenvía la petición HTTP tal cual
// (método, headers, body) al proceso Next.js real que ya sirve TODO bajo
// basePath "/hermes" (páginas + /hermes/api/* + /hermes/_next/* estáticos,
// ver hermes-kit/next.config.ts) y devuelve su respuesta tal cual. Cero
// dependencias nuevas (mismo criterio node:http del resto del proyecto).
//
// Aislamiento real de la integración Meta/Cloud API existente (routes/whatsapp.js,
// namespace /api/whatsapp/*): este proxy SOLO intercepta pathname que empieza
// por "/hermes" -- nunca toca /api/whatsapp/*, crm/, ni whatsapp-adapter/.

import http from 'node:http';

const HERMES_PORT = Number(process.env.HERMES_PORT) || 4311;
const HERMES_HOST = process.env.HERMES_HOST || 'localhost';

/**
 * true si pathname pertenece al kit Hermes (páginas o API bajo basePath
 * "/hermes") -- única condición que dashboard/server/index.js necesita para
 * decidir si reenviar la petición aquí.
 */
export function isHermesPath(pathname) {
  return pathname === '/hermes' || pathname.startsWith('/hermes/');
}

/**
 * Reenvía `req` completo (método, headers, body streamed) al proceso Next.js
 * de hermes-kit/ y hace streaming de vuelta de su respuesta real (status,
 * headers, body) a `res` -- proxy transparente, sin reescribir nada (el
 * basePath del propio Next.js ya alinea las rutas 1:1).
 */
export function proxyToHermes(req, res) {
  const upstreamReq = http.request(
    {
      host: HERMES_HOST,
      port: HERMES_PORT,
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on('error', (err) => {
    if (res.headersSent) { res.end(); return; }
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: `WhatsApp / Hermes no está disponible (${err.code ?? err.message}). ` +
        `¿Está corriendo "npm run dev" en hermes-kit/ (puerto ${HERMES_PORT})?`,
    }));
  });

  req.pipe(upstreamReq);
}

/**
 * Reenvía una petición Upgrade (WebSocket) real de /hermes* al mismo proceso
 * Next.js -- sin esto, el cliente HMR de Turbopack (que Next.js necesita para
 * completar el arranque/hidratación en modo desarrollo) nunca abre su socket
 * a través del proxy, y React nunca hidrata cuando se accede vía :4310
 * (aunque el HTML llegue bien por SSR y las rutas HTTP normales -- fetch(),
 * /hermes/api/* -- funcionen). Mismo criterio que proxyToHermes(): reenvío
 * transparente (método, headers, body binario crudo) hacia el socket TCP
 * real de hermes-kit/, nunca reimplementa el protocolo WebSocket.
 */
export function proxyUpgradeToHermes(req, socket, head) {
  const upstreamReq = http.request({
    host: HERMES_HOST,
    port: HERMES_PORT,
    method: req.method,
    path: req.url,
    headers: req.headers,
  });

  upstreamReq.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    const statusLine = `HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage}\r\n`;
    const headerLines = Object.entries(upstreamRes.headers)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join('\r\n');
    socket.write(`${statusLine}${headerLines}\r\n\r\n`);

    if (upstreamHead?.length) upstreamSocket.unshift(upstreamHead);
    if (head?.length) socket.unshift(head);

    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  upstreamReq.on('error', () => socket.destroy());
  socket.on('error', () => upstreamReq.destroy());

  upstreamReq.end();
}
