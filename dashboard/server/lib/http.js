// http.js — helpers mínimos sobre node:http, mismo criterio zero-dependency
// que whatsapp-adapter/src/httpServer.js. Sin Express, sin body-parser.

export function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export function notFound(res, message = 'No encontrado.') {
  sendJson(res, 404, { error: message });
}

export function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

export function serverError(res, err) {
  // Nunca se envía el stack completo al cliente (podría filtrar rutas
  // internas del servidor) -- solo el mensaje real del error.
  sendJson(res, 500, { error: err?.message ?? 'Error interno.' });
}

/** Lee y parsea el body JSON real de una request -- límite de 5MB, nunca confía en Content-Length del cliente sin verificar. */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let recibido = 0;
    const trozos = [];
    const LIMITE = 5 * 1024 * 1024;
    req.on('data', (chunk) => {
      recibido += chunk.length;
      if (recibido > LIMITE) {
        req.destroy();
        reject(new Error('Cuerpo de la solicitud demasiado grande.'));
        return;
      }
      trozos.push(chunk);
    });
    req.on('end', () => {
      if (trozos.length === 0) { resolve({}); return; }
      try {
        resolve(JSON.parse(Buffer.concat(trozos).toString('utf8')));
      } catch {
        reject(new Error('Cuerpo de la solicitud no es JSON válido.'));
      }
    });
    req.on('error', reject);
  });
}
