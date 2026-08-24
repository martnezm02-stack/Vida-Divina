#!/usr/bin/env node
// main.js — Adaptador WhatsApp (Fase 4.2, implementación local).
//
// Traduce eventos de webhook de WhatsApp Cloud API al motor comercial
// existente (simulator/src/flujoVentaReal.js) y de vuelta a una respuesta
// estructurada. NO conecta a Meta todavía — esta fase solo procesa
// payloads sintéticos localmente (ver docs/WHATSAPP_INTEGRATION_STATE.md,
// Fase 4.2). No hay servidor HTTP, no hay URL de callback, no hay token.
//
// Política SOLO_RESPUESTAS: procesarEventoWebhook() es el ÚNICO punto de
// entrada que puede tocar el motor comercial, y solo lo hace cuando el
// evento clasificado por webhookParser.js es "mensaje_entrante". Ningún
// scheduler, cron ni temporizador existe en este módulo ni en ninguno de
// whatsapp-adapter/src/ — todo envío es reacción a un mensaje real.
//
// Uso: node main.js   (corre un lote de payloads sintéticos de ejemplo)

import { clasificarEvento } from './src/webhookParser.js';
import { enrutarMensajeEntrante } from './src/conversationRouter.js';
import { construirSalida } from './src/outboundBuilder.js';
import { loadCompiledKnowledge } from '../simulator/src/knowledgeLoader.js';

/**
 * Punto de entrada único del adaptador. `kb` se recibe inyectado (no se
 * carga aquí por mensaje) para no repetir I/O de disco en cada evento.
 *
 * Fase C.2B: async — enrutarMensajeEntrante ahora persiste en PostgreSQL
 * (vía crm/) en vez de JSON, y ese acceso es asíncrono. construirSalida
 * (outboundBuilder.js) no cambia: sigue siendo una transformación pura y
 * síncrona sobre el resultado ya resuelto del router.
 */
export async function procesarEventoWebhook(payloadCrudo, kb) {
  const evento = clasificarEvento(payloadCrudo);

  if (evento.tipo !== 'mensaje_entrante') {
    return { procesado: false, tipoEvento: evento.tipo, motivo: evento.motivo ?? null };
  }

  const resultadoRouter = await enrutarMensajeEntrante(evento.id, evento.mensaje, kb);
  const salida = construirSalida(evento.id, resultadoRouter);

  return { procesado: true, tipoEvento: evento.tipo, ...salida };
}

function payloadMensaje(waId, texto, { numeroPropio = '15550001111' } = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID_EJEMPLO',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: numeroPropio, phone_number_id: 'PHONE_ID_EJEMPLO' },
              contacts: [{ profile: { name: 'Cliente de ejemplo' }, wa_id: waId }],
              messages: [
                { from: waId, id: `wamid.${waId}`, timestamp: String(Date.now()), type: 'text', text: { body: texto } },
              ],
            },
          },
        ],
      },
    ],
  };
}

function payloadStatus() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID_EJEMPLO',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550001111', phone_number_id: 'PHONE_ID_EJEMPLO' },
              statuses: [
                { id: 'wamid.EJEMPLO', status: 'delivered', timestamp: String(Date.now()), recipient_id: '5215500000001' },
              ],
            },
          },
        ],
      },
    ],
  };
}

function ejemplos() {
  return [
    { nombre: 'Saludo simple (contacto nuevo)', payload: payloadMensaje('5215500000001', 'Hola, buenas tardes') },
    {
      nombre: 'Intención explícita (contacto nuevo)',
      payload: payloadMensaje('5215500000002', 'Hola, quiero información del Té Divina'),
    },
    { nombre: 'Evento de estado (statuses) — no debe activar el motor', payload: payloadStatus() },
  ];
}

// Fase C.2B: async — procesarEventoWebhook ahora devuelve una Promise.
// Único consumidor real de esta función es la ejecución manual de este
// script (`node main.js`); ningún test del repositorio la invoca (ver
// docs/CRM_FASE_C2A_PREFLIGHT... auditoría de consumidores).
async function main() {
  const kb = loadCompiledKnowledge();
  for (const caso of ejemplos()) {
    console.log('\n' + '='.repeat(70));
    console.log(caso.nombre);
    console.log('='.repeat(70));
    console.log(JSON.stringify(await procesarEventoWebhook(caso.payload, kb), null, 2));
  }
}

if (process.argv[1] && process.argv[1].endsWith('main.js')) {
  main().catch((error) => {
    console.error('[whatsapp-adapter/main.js]', error.message);
    process.exitCode = 1;
  });
}
