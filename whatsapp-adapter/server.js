#!/usr/bin/env node
// server.js — Punto de entrada del webhook real (Fase 4.4).
//
// Levanta el servidor HTTP nativo (src/httpServer.js) que recibe eventos
// de WhatsApp Cloud API. Fase 4.4: RECEPCIÓN + PROCESAMIENTO + ENVÍO REAL
// opt-in (ver src/graphApiSender.js) — el envío hacia Meta solo ocurre si
// WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID están definidas; si
// faltan, el proceso sigue funcionando exactamente como en la fase
// anterior (recibe y procesa, pero no envía nada).
//
// Este archivo NO conecta nada en el Meta App Dashboard por sí mismo —
// eso requiere que el usuario registre manualmente, en Meta, la URL
// pública donde corra este proceso (localmente no es pública; requiere
// exponerlo, ej. un túnel, o desplegarlo) junto con el mismo valor de
// WHATSAPP_WEBHOOK_VERIFY_TOKEN definido abajo. Ese paso es una acción en
// la cuenta de Meta del usuario, fuera del alcance de este proceso.
//
// Variables de entorno (ver src/httpServer.js y src/graphApiSender.js
// para el detalle de cada una):
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN  (obligatoria para la verificación GET)
//   WHATSAPP_APP_SECRET            (opcional, recomendada — firma HMAC)
//   WHATSAPP_ACCESS_TOKEN          (opcional — habilita el envío real)
//   WHATSAPP_PHONE_NUMBER_ID       (opcional — habilita el envío real)
//   WHATSAPP_GRAPH_API_VERSION     (opcional, por defecto 'v21.0')
//   PORT                           (opcional, por defecto 3000)
//
// Uso: node --env-file=.env server.js
// (o exportando las variables directamente en la shell — ver .env.example)

import http from 'node:http';
import { crearManejador, RUTA_WEBHOOK } from './src/httpServer.js';
import { envioHabilitado } from './src/graphApiSender.js';
import { loadCompiledKnowledge } from '../simulator/src/knowledgeLoader.js';

function main() {
  if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.warn(
      'ADVERTENCIA: WHATSAPP_WEBHOOK_VERIFY_TOKEN no está definida. ' +
        'La verificación GET de Meta fallará siempre hasta que la definas.'
    );
  }
  if (!process.env.WHATSAPP_APP_SECRET) {
    console.warn(
      'ADVERTENCIA: WHATSAPP_APP_SECRET no está definida. La firma de las ' +
        'solicitudes POST no se verificará (modo desarrollo) — no expongas ' +
        'este servidor a Internet sin definirla.'
    );
  }

  const kb = loadCompiledKnowledge();
  const puerto = Number(process.env.PORT) || 3000;
  const servidor = http.createServer(crearManejador(kb));

  servidor.listen(puerto, () => {
    console.log(`[whatsapp-adapter] escuchando en http://localhost:${puerto}${RUTA_WEBHOOK} (GET verificación, POST eventos)`);
    console.log(
      envioHabilitado()
        ? '[whatsapp-adapter] envío real hacia Meta: HABILITADO (WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID definidas).'
        : '[whatsapp-adapter] envío real hacia Meta: deshabilitado (falta WHATSAPP_ACCESS_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID).'
    );
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  main();
}
