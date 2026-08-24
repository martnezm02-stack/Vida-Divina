// httpServer.js
// Endpoint HTTP mínimo para recibir el webhook de WhatsApp Cloud API —
// Node nativo (node:http, node:crypto), más graphApiSender.js para el
// envío saliente (también sin dependencias nuevas — usa el fetch global).
//
// Fase 4.4 — RECEPCIÓN + PROCESAMIENTO + ENVÍO REAL (opt-in). El envío
// real hacia Meta solo se intenta si WHATSAPP_ACCESS_TOKEN y
// WHATSAPP_PHONE_NUMBER_ID están definidas (ver graphApiSender.js); si
// falta cualquiera de las dos, el comportamiento es idéntico al de la
// fase anterior: se procesa el mensaje pero la respuesta trae siempre
// `envioReal: false` y no sale ninguna petición hacia Meta.
//
// Variables de entorno que este proceso necesita:
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN  (obligatoria) — valor arbitrario que
//     nosotros elegimos al registrar el webhook en Meta (App Dashboard →
//     WhatsApp → Configuration → Webhook). Meta lo reenvía tal cual en el
//     handshake GET (`hub.verify_token`) y este servidor lo compara. NO es
//     el token de acceso de producción — es un secreto propio, más simple,
//     que solo sirve para esta verificación.
//   WHATSAPP_APP_SECRET  (opcional, recomendada) — App Secret de Meta.
//     Si está definida, cada POST se valida contra el header
//     `x-hub-signature-256` (HMAC-SHA256 del cuerpo crudo) antes de tocar
//     el motor comercial; si no coincide, se responde 401 y no se procesa
//     nada. Si NO está definida, la verificación de firma se omite (modo
//     desarrollo) y se registra una advertencia en cada solicitud — no se
//     debe exponer el servidor a Internet sin definir esta variable.
//   PORT  (opcional) — puerto de escucha; por defecto 3000.
//
// Ninguna de estas variables se lee de un archivo del repositorio ni se
// hardcodea aquí — solo de process.env.

import crypto from 'node:crypto';
import { procesarEventoWebhook } from '../main.js';
import { envioHabilitado, enviarRecursos } from './graphApiSender.js';
import { persistOutboundReal } from './outboundPersistence.js';

const RUTA_WEBHOOK = '/webhook';

/**
 * Extrae solo los campos de diagnóstico autorizados a registrarse — nunca
 * el payload completo, nunca headers, nunca tokens.
 */
function extraerDiagnostico(payloadCrudo) {
  const value = payloadCrudo?.entry?.[0]?.changes?.[0]?.value;
  if (!value) return null;
  const mensaje = value.messages?.[0];
  return {
    waId: value.contacts?.[0]?.wa_id ?? null,
    from: mensaje?.from ?? null,
    messageId: mensaje?.id ?? null,
    phoneNumberId: value.metadata?.phone_number_id ?? null,
    tipoMensaje: mensaje?.type ?? (Array.isArray(value.statuses) ? 'statuses' : null),
    timestamp: mensaje?.timestamp ?? value.statuses?.[0]?.timestamp ?? null,
  };
}

function firmaValida(rawBody, header, appSecret) {
  if (!header || !header.startsWith('sha256=')) return false;
  const esperada = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const recibida = header.slice('sha256='.length);
  const bufEsperada = Buffer.from(esperada, 'hex');
  const bufRecibida = Buffer.from(recibida, 'hex');
  if (bufEsperada.length !== bufRecibida.length) return false;
  return crypto.timingSafeEqual(bufEsperada, bufRecibida);
}

function responderJson(res, status, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(texto) });
  res.end(texto);
}

function manejarVerificacion(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const modo = url.searchParams.get('hub.mode');
  const tokenRecibido = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const tokenEsperado = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!tokenEsperado) {
    console.warn('[whatsapp-adapter] WHATSAPP_WEBHOOK_VERIFY_TOKEN no está definida — no se puede verificar ninguna solicitud.');
  }

  if (modo === 'subscribe' && tokenEsperado && tokenRecibido === tokenEsperado && challenge) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(challenge);
    return;
  }

  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Verificación fallida.');
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    req.on('data', (trozo) => trozos.push(trozo));
    req.on('end', () => resolve(Buffer.concat(trozos)));
    req.on('error', reject);
  });
}

async function manejarEvento(req, res, kb) {
  let rawBody;
  try {
    rawBody = await leerCuerpo(req);
  } catch {
    responderJson(res, 400, { error: 'No se pudo leer el cuerpo de la solicitud.' });
    return;
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const firma = req.headers['x-hub-signature-256'];
    if (!firmaValida(rawBody, firma, appSecret)) {
      responderJson(res, 401, { error: 'Firma inválida.' });
      return;
    }
  } else {
    console.warn('[whatsapp-adapter] WHATSAPP_APP_SECRET no está definida — la firma de la solicitud NO se verifica (modo desarrollo).');
  }

  let payloadCrudo;
  try {
    payloadCrudo = JSON.parse(rawBody.toString('utf8'));
  } catch {
    responderJson(res, 400, { error: 'Cuerpo no es JSON válido.' });
    return;
  }

  const diagnostico = extraerDiagnostico(payloadCrudo);
  if (diagnostico) {
    // Solo los 6 campos autorizados — nunca el payload completo, nunca headers.
    console.log('[whatsapp-adapter] evento recibido:', diagnostico);
  } else {
    console.log('[whatsapp-adapter] evento recibido: estructura no reconocida (sin messages/contacts).');
  }

  // Fase C.2B: procesarEventoWebhook ahora es async (persiste en
  // PostgreSQL vía crm/) — manejarEvento ya era async por sí misma (ver
  // los await de arriba), así que este es el único cambio necesario aquí.
  const resultado = await procesarEventoWebhook(payloadCrudo, kb);

  // Envío real opt-in: solo se intenta si el mensaje produjo algo que
  // enviar (resultado.enviar) y las variables de entorno de Graph API
  // están definidas (envioHabilitado()). En cualquier otro caso el
  // comportamiento es el mismo de la fase anterior: envioReal: false y
  // ninguna petición saliente hacia Meta.
  let envios = null;
  let envioReal = false;
  if (resultado.procesado && resultado.enviar && envioHabilitado()) {
    envios = await enviarRecursos(resultado);
    envioReal = true;
    // Fase 16, Parte 7 -- corrige el hallazgo real de la Fase 15: hasta
    // ahora el OUTBOUND real llegaba a Meta pero nunca se persistía en
    // crm/messages. Solo se guarda lo que Meta confirmó (envio.enviado),
    // nunca un mensaje fabricado; un fallo aquí (ej. Postgres no
    // disponible) se registra pero no revierte el envío ya hecho ni
    // rompe la respuesta HTTP -- el mensaje real ya salió, no se puede
    // "des-enviar".
    try {
      await persistOutboundReal(resultado.id, envios);
    } catch (error) {
      console.error('[whatsapp-adapter] no se pudo persistir el OUTBOUND real en crm/ (el mensaje ya se envió a Meta):', error.message);
    }
  }

  responderJson(res, 200, { ...resultado, envioReal, ...(envios ? { envios } : {}) });
}

/**
 * @param {Object} kb - resultado de loadCompiledKnowledge(), cargado una
 *   sola vez por quien inicia el servidor (ver server.js), no por request.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function crearManejador(kb) {
  return function manejador(req, res) {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname !== RUTA_WEBHOOK) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado.');
      return;
    }

    if (req.method === 'GET') {
      manejarVerificacion(req, res);
      return;
    }

    if (req.method === 'POST') {
      manejarEvento(req, res, kb).catch((error) => {
        console.error('[whatsapp-adapter] error procesando el evento:', error.message);
        responderJson(res, 500, { error: 'Error interno procesando el evento.' });
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, POST' });
    res.end('Método no permitido.');
  };
}

export { RUTA_WEBHOOK };
