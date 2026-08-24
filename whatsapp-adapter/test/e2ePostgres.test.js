// e2ePostgres.test.js
// Prueba de integración end-to-end de la Fase C.2B — sin mocks, contra
// PostgreSQL real (TEST_DATABASE_URL). Demuestra los 8 puntos exigidos:
//
//   1. envía un webhook sintético;
//   2. ejecuta el flujo completo (webhookParser → conversationRouter →
//      flujoVentaReal → contextoStorage → crm/ → PostgreSQL);
//   3. espera correctamente todas las Promises (await de punta a punta,
//      sin ninguna llamada síncrona a una función que ahora es async);
//   4. confirma que el contexto terminó persistido en PostgreSQL —
//      verificado de dos formas independientes: vía contextoStorage.js
//      (la interfaz que usa el motor) y vía crm/index.js directamente
//      (la fuente de verdad real, sin pasar por la capa que se está
//      probando — para no validar el sistema contra sí mismo);
//   5. confirma que puede recuperarse desde PostgreSQL (segunda lectura,
//      "reiniciar el proceso" simulado igual que ya hacían
//      contextoStorage.test.js/flujoVentaRealPersistente.test.js);
//   6. confirma que data/conversaciones/ no recibió ningún archivo nuevo;
//   7. confirma que no hubo escritura dual (mismo punto que el 6, más una
//      verificación explícita de que el directorio completo, no solo el
//      id de esta prueba, permanece sin cambios);
//   8. confirma que el resultado comercial conserva la misma semántica de
//      siempre (mismos recursos, mismo estado, mismo productoId que ya
//      verificaban whatsappAdapter.test.js antes de esta migración).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { procesarEventoWebhook } from '../main.js';
import { loadCompiledKnowledge } from '../../simulator/src/knowledgeLoader.js';
import { CONTEXTOS_ROOT, existeContexto, recuperarContexto } from '../../simulator/src/contextoStorage.js';
import * as crm from '../../crm/index.js';
import { getTestPool, resetDatabase, closeTestPool } from '../../crm/test/helpers/db.js';

// El pool interno de crm/ es perezoso (getPool() se evalúa en cada llamada,
// nunca al importar — ver crm/index.js) y lee process.env.DATABASE_URL en
// ese momento. Sin esta línea, procesarEventoWebhook() escribe contra
// DATABASE_URL (la base real de desarrollo) mientras que las aserciones de
// abajo leen con getTestPool() contra TEST_DATABASE_URL — dos bases
// físicas distintas, por lo que la fila de `conversations` nunca aparece
// donde se busca. Esto también es lo que ya documentaba el encabezado de
// este archivo: la prueba está pensada para correr "sin mocks, contra
// PostgreSQL real (TEST_DATABASE_URL)" — es decir, TEST_DATABASE_URL debe
// ser la única base tocada, tanto en escritura como en lectura.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const kb = loadCompiledKnowledge();
// Fase Pre-E2E — mismo hallazgo que whatsappAdapter.test.js: id fijo
// reutilizado entre corridas contra DATABASE_URL real, sin limpieza.
const ID = `test-e2e-postgres-tedivina-${Date.now()}`;

let pool;

before(async () => {
  pool = await getTestPool();
  await resetDatabase(pool);
});

after(async () => {
  await crm.closePool();
  await closeTestPool();
});

function payloadMensaje(waId, texto) {
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
              contacts: [{ profile: { name: 'Cliente E2E' }, wa_id: waId }],
              messages: [
                { from: waId, id: `wamid.${waId}.${Date.now()}`, timestamp: String(Date.now()), type: 'text', text: { body: texto } },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('End-to-end: webhook sintético → PostgreSQL (Fase C.2B)', () => {
  test('un turno completo de conversación queda persistido en PostgreSQL, no en JSON', async () => {
    // --- Snapshot ANTES: ningún archivo JSON existe para este id, y el
    //     directorio completo de contextos legacy se registra para
    //     comparar después (puntos 6-7: sin escritura dual).
    assert.equal(fs.existsSync(path.join(CONTEXTOS_ROOT, `${ID}.json`)), false);
    const archivosAntes = fs.existsSync(CONTEXTOS_ROOT) ? new Set(fs.readdirSync(CONTEXTOS_ROOT)) : new Set();

    // 1-3. Webhook sintético, flujo completo, await de punta a punta.
    const turno1 = await procesarEventoWebhook(payloadMensaje(ID, 'Hola, buenas tardes'), kb);
    assert.equal(turno1 instanceof Promise, false); // ya resuelto por el await de arriba
    assert.equal(turno1.procesado, true);

    const turno2 = await procesarEventoWebhook(payloadMensaje(ID, 'Quiero comprar Té Divina'), kb);
    assert.equal(turno2.procesado, true);

    // 8. Semántica comercial preservada — mismas aserciones que ya
    //    verificaba whatsappAdapter.test.js (caso B) antes de la migración.
    assert.equal(turno2.enviar, true);
    assert.equal(turno2.handoff, null);
    assert.deepEqual(turno2.recursos.map((r) => r.tipo), ['audio']);

    // 4. Persistido en PostgreSQL — verificado por DOS vías independientes.

    // 4a. Vía contextoStorage.js (la interfaz que usa el motor real).
    assert.equal(await existeContexto(ID), true);
    const contextoViaMotor = await recuperarContexto(ID);
    assert.equal(contextoViaMotor.estado, 'AudioExplicacionEnviado');
    assert.equal(contextoViaMotor.productoId, 'productos/01-control-de-peso/tedivina');

    // 4b. Vía crm/index.js directamente — sin pasar por contextoStorage.js,
    //     para confirmar que el dato está realmente en las tablas del CRM
    //     y no es un artefacto de la capa que se está probando.
    const canal = await crm.customerChannels.findByTipoAndIdentificador('whatsapp', ID);
    assert.ok(canal, 'debe existir un customer_channel real en PostgreSQL');
    const conversaciones = await pool.query('SELECT * FROM conversations WHERE customer_channel_id = $1', [canal.customerChannelId]);
    assert.equal(conversaciones.rows.length, 1);
    assert.equal(conversaciones.rows[0].estado_actual, 'AudioExplicacionEnviado');

    const oportunidad = await crm.opportunities.findLatestByConversationId(conversaciones.rows[0].conversation_id);
    assert.ok(oportunidad);
    assert.equal(oportunidad.productoId, 'productos/01-control-de-peso/tedivina');

    const transiciones = await pool.query(
      'SELECT estado_anterior, estado_nuevo FROM state_transitions WHERE conversation_id = $1 ORDER BY "timestamp" ASC',
      [conversaciones.rows[0].conversation_id]
    );
    // 3 transiciones, no 2: el segundo turno pasa por
    // iniciarConversacionPersistente (MensajeInicialEnviado, ya cubierto
    // en el turno 1) — el mismo mensaje entrante también dispara
    // clasificarPrimeraRespuestaPersistente (IntencionClasificada) antes
    // de encadenar a procesarFlujoConsumoPersistente
    // (AudioExplicacionEnviado) — ver conversationRouter.js#enrutarContactoNuevo.
    assert.deepEqual(
      transiciones.rows.map((r) => r.estado_nuevo),
      ['MensajeInicialEnviado', 'IntencionClasificada', 'AudioExplicacionEnviado']
    );

    // 5. Recuperable desde PostgreSQL en una lectura completamente nueva
    //    (mismo criterio que "reiniciar el proceso": ninguna caché en
    //    memoria — cada llamada vuelve a consultar la base).
    const segundaLectura = await recuperarContexto(ID);
    assert.deepEqual(segundaLectura, contextoViaMotor);

    // 6-7. data/conversaciones/ no recibió NADA nuevo — ni el archivo de
    //      este id ni ningún otro (sin escritura dual, en ningún sentido).
    assert.equal(fs.existsSync(path.join(CONTEXTOS_ROOT, `${ID}.json`)), false);
    const archivosDespues = fs.existsSync(CONTEXTOS_ROOT) ? new Set(fs.readdirSync(CONTEXTOS_ROOT)) : new Set();
    assert.deepEqual([...archivosDespues], [...archivosAntes], 'ningún archivo nuevo debe aparecer en data/conversaciones/');
  });
});
