// contextProjection.test.js
// Pruebas reales de integración de CRM Context Projection (Fase C.1)
// contra TEST_DATABASE_URL — sin mocks. Cubre los 16 escenarios exigidos
// por la Fase C.1. No importa simulator/src/contextoStorage.js ni
// crearContextoConversacion() — construye directamente los objetos de
// contexto de prueba con la misma forma de 33 campos, para no acoplar
// este archivo a simulator/ (crm/ debe poder probarse sin él).

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { getTestPool, resetDatabase, closeTestPool } from './helpers/db.js';
import { contextExists, projectContext, persistContext, updateContext } from '../context/contextProjection.js';
import { getTestConfig } from '../config/env.js';

import * as customerRepository from '../repositories/customerRepository.js';
import * as customerChannelRepository from '../repositories/customerChannelRepository.js';
import * as conversationRepository from '../repositories/conversationRepository.js';
import * as stateTransitionRepository from '../repositories/stateTransitionRepository.js';
import * as opportunityRepository from '../repositories/opportunityRepository.js';
import * as offerLogRepository from '../repositories/offerLogRepository.js';
import * as followUpRepository from '../repositories/followUpRepository.js';
import * as handoffRepository from '../repositories/handoffRepository.js';

let pool;

// contextExists/projectContext/persistContext/updateContext usan
// internamente getPool() (DATABASE_URL) — se apunta DATABASE_URL a la
// misma base de TEST_DATABASE_URL, igual que ya hace crm/test/transaction.test.js,
// para poder probar la API pública real sin tocar la base de desarrollo.
before(async () => {
  pool = await getTestPool();
  process.env.DATABASE_URL = getTestConfig().databaseUrl;
});

beforeEach(async () => {
  await resetDatabase(pool);
});

after(async () => {
  const { closePool } = await import('../db/pool.js');
  await closePool();
  await closeTestPool();
  delete process.env.DATABASE_URL;
});

/** Mismo shape de 33 campos que crearContextoConversacion() — reconstruido
 * aquí a propósito, sin importar simulator/, para que crm/test/ no dependa
 * de simulator/. */
function contextoVacio(id) {
  return {
    id,
    telefono: null,
    nombre: null,
    productoId: null,
    paquete: null,
    cantidad: null,
    total: null,
    intencionCompra: null,
    resultado: null,
    necesidadId: null,
    testimonioEnviado: false,
    precioEnviado: false,
    ofertaEnviada: false,
    cierreEnviado: false,
    precioUtilizado: null,
    ofertaUtilizada: null,
    cierreUtilizado: null,
    estado: null,
    ultimaInteraccion: null,
    ultimaIntencion: null,
    respuestaCliente: null,
    fechaEntrega: null,
    seguimientoDia3Enviado: false,
    resultadoSeguimientoDia3: null,
    fechaSiguienteSeguimiento: null,
    estadoFinalSeguimiento: null,
    recuperacionPendiente: false,
    fechaActivacionRecuperacion: null,
    ramaRecuperacionEjecutada: null,
    resultadoRecuperacion: null,
    handoffPendiente: false,
    motivoHandoff: null,
    fechaHandoff: null,
  };
}

const WA_ID = '5215500001111';

describe('1-2. Crear customer/channel y conversation', () => {
  test('persistContext sobre un id nuevo crea customer, customer_channel y conversation', async () => {
    const contexto = { ...contextoVacio(WA_ID), estado: 'MensajeInicialEnviado' };
    await persistContext(WA_ID, contexto);

    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    assert.ok(channel, 'debe existir un customer_channel');

    const customer = await customerRepository.findCustomerById(pool, channel.customerId);
    assert.ok(customer, 'debe existir un customer');

    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    assert.ok(conversation, 'debe existir una conversation');
    assert.equal(conversation.estadoActual, 'MensajeInicialEnviado');
  });

  // Fase 16, Parte 4 -- separación estructural REAL/SIMULATED/TEST/FIXTURE/UNKNOWN.
  test('persistContext sin "source" explícito crea la conversation con source UNKNOWN (nunca REAL por defecto)', async () => {
    await persistContext(WA_ID, { ...contextoVacio(WA_ID), estado: 'MensajeInicialEnviado' });
    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    assert.equal(conversation.source, 'UNKNOWN');
  });

  test('persistContext con "source" explícito lo persiste tal cual en la conversation nueva', async () => {
    const otroId = '5215500001112';
    await persistContext(otroId, { ...contextoVacio(otroId), estado: 'MensajeInicialEnviado' }, 'TEST');
    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', otroId);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    assert.equal(conversation.source, 'TEST');
  });

  test('un source explícito en una llamada posterior NUNCA reescribe el source de una conversation ya existente', async () => {
    await persistContext(WA_ID, { ...contextoVacio(WA_ID), estado: 'MensajeInicialEnviado' }, 'TEST');
    await persistContext(WA_ID, { ...contextoVacio(WA_ID), estado: 'IntencionClasificada' }, 'REAL');
    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    assert.equal(conversation.source, 'TEST', 'el origen se fija solo al crear -- no se reescribe el histórico');
  });
});

describe('3. Reconstruir contexto', () => {
  test('projectContext devuelve null si no existe', async () => {
    assert.equal(await projectContext('no-existe-todavia'), null);
    assert.equal(await contextExists('no-existe-todavia'), false);
  });

  test('projectContext reconstruye el contexto ya persistido', async () => {
    const contexto = { ...contextoVacio(WA_ID), estado: 'IntencionClasificada', nombre: null };
    await persistContext(WA_ID, contexto);

    const recuperado = await projectContext(WA_ID);
    assert.ok(recuperado);
    assert.equal(recuperado.id, WA_ID);
    assert.equal(recuperado.estado, 'IntencionClasificada');
    assert.equal(await contextExists(WA_ID), true);
  });
});

describe('4. Persistir contexto completo', () => {
  test('productoId, necesidadId, cantidad, intencionCompra quedan reconstruibles', async () => {
    const contexto = {
      ...contextoVacio(WA_ID),
      estado: 'NecesidadIdentificada',
      productoId: 'productos/02-cafe-divina/te-divina',
      necesidadId: 'estrenimiento',
      cantidad: 2,
      intencionCompra: true,
    };
    await persistContext(WA_ID, contexto);

    const recuperado = await projectContext(WA_ID);
    assert.equal(recuperado.productoId, 'productos/02-cafe-divina/te-divina');
    assert.equal(recuperado.necesidadId, 'estrenimiento');
    assert.equal(recuperado.cantidad, 2);
    assert.equal(recuperado.intencionCompra, true);
    assert.equal(recuperado.total, null, 'total nunca se inventa');
  });

  test('intencionCompra nunca se reconstruye como false explícito (solo null o true)', async () => {
    const contexto = { ...contextoVacio(WA_ID), estado: 'IntencionClasificada', productoId: 'productos/02-cafe-divina/te-divina' };
    await persistContext(WA_ID, contexto); // intencionCompra: null en el objeto de entrada
    const recuperado = await projectContext(WA_ID);
    assert.equal(recuperado.intencionCompra, null);
  });
});

describe('5-6. Actualizar contexto y conservar campos no modificados', () => {
  test('updateContext hace merge parcial sin perder campos previos', async () => {
    await persistContext(WA_ID, {
      ...contextoVacio(WA_ID),
      estado: 'ProductoIdentificado',
      productoId: 'productos/02-cafe-divina/te-divina',
    });

    const actualizado = await updateContext(WA_ID, { necesidadId: 'estrenimiento', estado: 'NecesidadIdentificada' });

    assert.equal(actualizado.necesidadId, 'estrenimiento');
    assert.equal(actualizado.estado, 'NecesidadIdentificada');
    // Campo previo, no mencionado en `cambios`, debe conservarse.
    assert.equal(actualizado.productoId, 'productos/02-cafe-divina/te-divina');

    const recuperado = await projectContext(WA_ID);
    assert.equal(recuperado.productoId, 'productos/02-cafe-divina/te-divina');
    assert.equal(recuperado.necesidadId, 'estrenimiento');
  });

  test('updateContext sobre un id inexistente usa crearVacio()', async () => {
    const idNuevo = 'test-update-sin-previo';
    const actualizado = await updateContext(idNuevo, { estado: 'MensajeInicialEnviado', productoId: null }, () => contextoVacio(idNuevo));
    assert.equal(actualizado.estado, 'MensajeInicialEnviado');
    assert.equal(await contextExists(idNuevo), true);
  });
});

describe('7-8. State transitions', () => {
  test('un cambio real de estado produce una fila histórica', async () => {
    await persistContext(WA_ID, { ...contextoVacio(WA_ID), estado: 'MensajeInicialEnviado' });
    await updateContext(WA_ID, { estado: 'IntencionClasificada' });

    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    const historial = await stateTransitionRepository.listByConversationId(pool, conversation.conversationId);

    assert.equal(historial.length, 2);
    assert.equal(historial[0].estadoNuevo, 'MensajeInicialEnviado');
    assert.equal(historial[1].estadoAnterior, 'MensajeInicialEnviado');
    assert.equal(historial[1].estadoNuevo, 'IntencionClasificada');
  });

  test('persistir el mismo estado dos veces NO crea una transición nueva', async () => {
    await persistContext(WA_ID, { ...contextoVacio(WA_ID), estado: 'MensajeInicialEnviado' });
    await persistContext(WA_ID, { ...contextoVacio(WA_ID), id: WA_ID, estado: 'MensajeInicialEnviado' });

    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    const historial = await stateTransitionRepository.listByConversationId(pool, conversation.conversationId);

    assert.equal(historial.length, 1, 'no debe haber una segunda transición con el mismo estado');
  });
});

describe('9. Persistir opportunity', () => {
  test('productoId presente crea una opportunity; ausente no crea ninguna', async () => {
    await persistContext(WA_ID, { ...contextoVacio(WA_ID), estado: 'MensajeInicialEnviado' });
    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    assert.equal(await opportunityRepository.findLatestByConversationId(pool, conversation.conversationId), null);

    await updateContext(WA_ID, { estado: 'ProductoIdentificado', productoId: 'productos/02-cafe-divina/te-divina' });
    const oportunidad = await opportunityRepository.findLatestByConversationId(pool, conversation.conversationId);
    assert.ok(oportunidad);
    assert.equal(oportunidad.productoId, 'productos/02-cafe-divina/te-divina');
  });
});

describe('10. Persistir offer', () => {
  test('ofertaUtilizada se registra en offers_log y no se duplica en llamadas repetidas', async () => {
    const ofertaUtilizada = { disponible: true, texto: 'Oferta Té Divina de prueba', fuente: 'SPRINT_5_PROCESO_COMERCIAL.md §8' };
    const base = {
      ...contextoVacio(WA_ID),
      estado: 'OfertaEnviada',
      productoId: 'productos/02-cafe-divina/te-divina',
      ofertaEnviada: true,
      ofertaUtilizada,
    };
    await persistContext(WA_ID, base);
    await persistContext(WA_ID, { ...base }); // repetido a propósito

    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    const oportunidad = await opportunityRepository.findLatestByConversationId(pool, conversation.conversationId);
    const registros = await offerLogRepository.listByOpportunityId(pool, oportunidad.opportunityId);

    assert.equal(registros.length, 1, 'no debe duplicarse si ofertaUtilizada no cambió');
    assert.equal(registros[0].ofertaFuente, ofertaUtilizada.fuente);
    assert.equal(registros[0].snapshotTexto, ofertaUtilizada.texto);
  });
});

describe('11. Persistir recuperación', () => {
  test('recuperacionPendiente crea un follow_up; false + resultado lo cierra', async () => {
    await persistContext(WA_ID, {
      ...contextoVacio(WA_ID),
      estado: 'MensajeRecuperacionEnviado',
      productoId: 'productos/02-cafe-divina/te-divina',
      recuperacionPendiente: true,
    });

    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    let followUps = await followUpRepository.listByConversationId(pool, conversation.conversationId);
    assert.equal(followUps.length, 1);
    assert.equal(followUps[0].tipo, 'recuperacion_dia5');
    assert.equal(followUps[0].estado, 'pendiente');

    await updateContext(WA_ID, {
      estado: 'RecuperacionFinalizada',
      recuperacionPendiente: false,
      ramaRecuperacionEjecutada: 'sin_respuesta',
      resultadoRecuperacion: 'sin_respuesta',
    });

    followUps = await followUpRepository.listByConversationId(pool, conversation.conversationId);
    assert.equal(followUps.length, 1, 'se cierra el mismo registro, no se crea uno nuevo');
    assert.equal(followUps[0].estado, 'ejecutado');
    assert.equal(followUps[0].resultado, 'sin_respuesta');

    const recuperado = await projectContext(WA_ID);
    assert.equal(recuperado.recuperacionPendiente, false);
    assert.equal(recuperado.resultadoRecuperacion, 'sin_respuesta');
  });

  test('resultadoRecuperacion fuera del CHECK aprobado (ej. duda_no_autorizada) se guarda como null, sin fallar', async () => {
    await persistContext(WA_ID, {
      ...contextoVacio(WA_ID),
      estado: 'MensajeRecuperacionEnviado',
      recuperacionPendiente: true,
    });
    await updateContext(WA_ID, {
      estado: 'EscaladoHumano',
      recuperacionPendiente: false,
      resultadoRecuperacion: 'duda_no_autorizada',
    });

    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    const followUps = await followUpRepository.listByConversationId(pool, conversation.conversationId);
    assert.equal(followUps[0].estado, 'ejecutado');
    assert.equal(followUps[0].resultado, null, 'valor no soportado por el CHECK se guarda como null, no rompe la escritura');
  });
});

describe('12. Persistir handoff', () => {
  test('handoffPendiente crea un handoff y actualiza el puntero de la conversación', async () => {
    await persistContext(WA_ID, {
      ...contextoVacio(WA_ID),
      estado: 'AudioExplicacionEnviado',
      handoffPendiente: true,
      motivoHandoff: 'No fue posible identificar el producto de interés.',
      fechaHandoff: new Date().toISOString(),
    });

    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', WA_ID);
    const conversation = await conversationRepository.findLatestByCustomerChannelId(pool, channel.customerChannelId);
    assert.ok(conversation.handoffPendienteId);

    const handoff = await handoffRepository.findById(pool, conversation.handoffPendienteId);
    assert.equal(handoff.motivo, 'No fue posible identificar el producto de interés.');

    const recuperado = await projectContext(WA_ID);
    assert.equal(recuperado.handoffPendiente, true);
    assert.equal(recuperado.motivoHandoff, handoff.motivo);
  });

  test('handoffPendiente es monótono: no se limpia automáticamente al persistir handoffPendiente:false', async () => {
    await persistContext(WA_ID, {
      ...contextoVacio(WA_ID),
      estado: 'AudioExplicacionEnviado',
      handoffPendiente: true,
      motivoHandoff: 'Motivo original.',
    });
    await persistContext(WA_ID, {
      ...contextoVacio(WA_ID),
      estado: 'NecesidadIdentificada',
      handoffPendiente: false, // el sistema original nunca produce esto, pero se prueba que no rompe nada
    });

    const recuperado = await projectContext(WA_ID);
    assert.equal(recuperado.handoffPendiente, true, 'el puntero no se limpia solo porque el contexto de entrada diga false');
    assert.equal(recuperado.motivoHandoff, 'Motivo original.');
  });
});

describe('13. Rollback completo ante fallo', () => {
  test('una violación de constraint a mitad de la escritura revierte TODO, incluido el customer recién creado', async () => {
    const idFallido = 'test-rollback-cantidad-invalida';
    await assert.rejects(() =>
      persistContext(idFallido, {
        ...contextoVacio(idFallido),
        estado: 'ProductoPaqueteDefinido',
        productoId: 'productos/02-cafe-divina/te-divina',
        cantidad: -1, // viola CHECK (cantidad IS NULL OR cantidad > 0)
      })
    );

    assert.equal(await contextExists(idFallido), false, 'no debe quedar ni conversation...');
    const channel = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', idFallido);
    assert.equal(channel, null, '...ni customer_channel...');
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM customers');
    // No hay forma directa de filtrar "customers creados en este test" salvo
    // por ausencia total: como resetDatabase() corrió en beforeEach, 0
    // customers en la tabla prueba que el rollback deshizo también la
    // creación del customer (paso 1 de disassembleContext), no solo la
    // oportunidad que falló (paso 4).
    assert.equal(rows[0].n, 0, '...ni el customer creado en el paso 1, pese a que el fallo ocurrió en el paso 4');
  });
});

describe('14-16. Reutilización e idempotencia', () => {
  test('dos persistContext seguidos para el mismo id reutilizan la misma conversation, sin duplicar customer ni channel', async () => {
    await persistContext(WA_ID, { ...contextoVacio(WA_ID), estado: 'MensajeInicialEnviado' });
    await persistContext(WA_ID, { ...contextoVacio(WA_ID), estado: 'IntencionClasificada' });

    const { rows: canales } = await pool.query(
      'SELECT customer_channel_id FROM customer_channels WHERE tipo_canal = $1 AND identificador_externo = $2',
      ['whatsapp', WA_ID]
    );
    assert.equal(canales.length, 1, 'no debe duplicarse customer_channel');

    const { rows: customersDelCanal } = await pool.query('SELECT COUNT(*)::int AS n FROM customers');
    assert.equal(customersDelCanal[0].n, 1, 'no debe duplicarse customer');

    const { rows: conversaciones } = await pool.query(
      'SELECT conversation_id FROM conversations WHERE customer_channel_id = $1',
      [canales[0].customer_channel_id]
    );
    assert.equal(conversaciones.length, 1, 'debe reutilizarse la misma conversation (Decisión C1)');
  });
});
