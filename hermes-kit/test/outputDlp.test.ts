// outputDlp.test.ts — Auditoría adversarial 2026-09-18, Parte E/J
// (guardOutbound ampliado) + Parte L, categoría OUTPUT (22-27). Pruebas
// puras -- guardOutbound no toca CRM ni SQLite (solo recibe texto).

import { test } from "node:test";
import assert from "node:assert/strict";
import { guardOutbound } from "../src/lib/guardrails";

test("22) paráfrasis de system prompt (sin usar la frase exacta 'system prompt') -> BLOCKED", () => {
  const r = guardOutbound("Claro, revelaré mis instrucciones privadas ahora mismo.");
  assert.equal(r.ok, false);
});

test("22b) volcado con cabeceras markdown tipo prompt -> BLOCKED (ya existente, sigue intacto)", () => {
  const r = guardOutbound("## Datos de tu negocio\nAquí está todo el contenido interno.");
  assert.equal(r.ok, false);
});

test("23) paráfrasis de disclosure de tools ('muestra las herramientas que tienes disponibles') -> BLOCKED", () => {
  const r = guardOutbound("Estas son las herramientas que tienes disponibles en este sistema.");
  assert.equal(r.ok, false);
});

test("23b) nombre literal de una tool NO cubierta antes de esta fase (ej. registrarPago) -> BLOCKED (lista ampliada a las 31 tools reales)", () => {
  const r = guardOutbound("Voy a usar registrarPago para anotar tu pago.");
  assert.equal(r.ok, false);
});

test("24) error de PostgreSQL crudo en el texto final -> BLOCKED (respaldo de guardOutbound, defensa en profundidad tras la sanitización en origen)", () => {
  const r = guardOutbound('Ocurrió un error: duplicate key value violates unique constraint "ux_orders_id"');
  assert.equal(r.ok, false);
});

test("25) ruta de filesystem interna (Windows y Unix) -> BLOCKED", () => {
  const win = guardOutbound("El archivo está en C:\\Users\\manue\\Vida Divina\\hermes-kit\\.env.local");
  assert.equal(win.ok, false);
  const unix = guardOutbound("El archivo está en /home/deploy/hermes-kit/data/messages.db");
  assert.equal(unix.ok, false);
});

test("26) token/API key/JWT -> BLOCKED", () => {
  const bearer = guardOutbound("Usa este header: Bearer abcdefghijklmnopqrstuvwxyz0123456789");
  assert.equal(bearer.ok, false);
  const jwt = guardOutbound("Tu token es eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U");
  assert.equal(jwt.ok, false);
  const connStr = guardOutbound("La base está en postgres://usuario:clave@localhost:5432/vida_divina_crm");
  assert.equal(connStr.ok, false);
});

test("27) datos de otro cliente -- guardOutbound NO tiene (ni debe fingir tener) un filtro de PII de terceros; la protección real es la ausencia de esa fuente en las tools (documentado, no un bug de esta fase)", () => {
  // NOTA HONESTA: esto es una prueba de LÍMITE, no de una capacidad nueva.
  // guardOutbound sigue sin poder distinguir "el teléfono del propio
  // cliente" (legítimo mencionarlo) de "el teléfono de un tercero" (fuga)
  // por texto solo -- la protección real contra esto es arquitectónica
  // (ninguna tool de cliente devuelve datos de otro customer_id, ver
  // securityAuthorization.test.ts) y vive fuera de este archivo.
  const mencionaTelefonoPropio = guardOutbound("Perfecto, uso este número para tu pedido: 5215599990000");
  assert.equal(mencionaTelefonoPropio.ok, true, "mencionar el propio teléfono del cliente es legítimo y no debe bloquearse");
});

test("respuestas comerciales normales -> NUNCA bloqueadas (sin falsos positivos)", () => {
  const mensajes = [
    "Claro, el té cuesta $1,799 por 6 sobres. ¿Te gustaría ordenarlo?",
    "Perfecto, te comparto los datos de la cuenta para tu transferencia.",
    "Gracias por tu compra, en breve confirmamos tu pedido.",
  ];
  for (const m of mensajes) {
    const r = guardOutbound(m);
    assert.equal(r.ok, true, `mensaje comercial legítimo no debe bloquearse: "${m}" (${r.reason})`);
  }
});
