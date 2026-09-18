// webhookParser.referral.test.js — FASE "Attribution + Reporting + Email
// MCP + Alerta WhatsApp" (2026-09-04). clasificarEvento() es una función
// pura (sin I/O) -- se prueba con un payload CONSTRUIDO siguiendo el
// esquema REAL y documentado de Meta Cloud API (el webhook real todavía no
// está conectado, ver nota de cabecera de webhookParser.js), nunca contra
// datos simulados de negocio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasificarEvento } from '../src/webhookParser.js';

function payloadConMensaje(mensajeExtra = {}) {
  return {
    entry: [{
      changes: [{
        value: {
          metadata: { display_phone_number: '5215500000000' },
          contacts: [{ wa_id: '5215599990000' }],
          messages: [{
            from: '5215599990000',
            type: 'text',
            text: { body: 'Hola' },
            timestamp: '1700000000',
            ...mensajeExtra,
          }],
        },
      }],
    }],
  };
}

test('mensaje con referral real de Meta (click-to-WhatsApp) se preserva completo', () => {
  const referralReal = {
    source_url: 'https://www.instagram.com/reel/xyz/',
    source_type: 'ad',
    source_id: 'ig_reel_tongkat_07',
    ctwa_clid: 'clid_abc123',
  };
  const evento = clasificarEvento(payloadConMensaje({ referral: referralReal }));
  assert.equal(evento.tipo, 'mensaje_entrante');
  assert.deepEqual(evento.referral, referralReal);
});

test('mensaje normal sin referral -> referral:null, nunca inventado', () => {
  const evento = clasificarEvento(payloadConMensaje());
  assert.equal(evento.tipo, 'mensaje_entrante');
  assert.equal(evento.referral, null);
});
