// repositories.test.js
// Pruebas reales de integración de los 10 repositories contra
// TEST_DATABASE_URL — sin mocks. Cada test parte de una base vacía
// (resetDatabase en beforeEach) y construye exactamente los datos que
// necesita, en el orden que las foreign keys exigen.

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { getTestPool, resetDatabase, closeTestPool } from './helpers/db.js';

import * as customerRepository from '../repositories/customerRepository.js';
import * as customerChannelRepository from '../repositories/customerChannelRepository.js';
import * as conversationRepository from '../repositories/conversationRepository.js';
import * as messageRepository from '../repositories/messageRepository.js';
import * as stateTransitionRepository from '../repositories/stateTransitionRepository.js';
import * as opportunityRepository from '../repositories/opportunityRepository.js';
import * as offerLogRepository from '../repositories/offerLogRepository.js';
import * as followUpRepository from '../repositories/followUpRepository.js';
import * as handoffRepository from '../repositories/handoffRepository.js';
import * as productPricingRepository from '../repositories/productPricingRepository.js';

let pool;

before(async () => {
  pool = await getTestPool();
});

beforeEach(async () => {
  await resetDatabase(pool);
});

after(async () => {
  await closeTestPool();
});

/** Crea customer + channel + conversation encadenados — setup común a la mayoría de tests de abajo. */
async function crearConversacionDePrueba(waId = '5215500000001') {
  const customer = await customerRepository.createCustomer(pool, { nombre: null, email: null });
  const channel = await customerChannelRepository.createCustomerChannel(pool, {
    customerId: customer.customerId,
    tipoCanal: 'whatsapp',
    identificadorExterno: waId,
  });
  const conversation = await conversationRepository.createConversation(pool, {
    customerId: customer.customerId,
    customerChannelId: channel.customerChannelId,
    waIdConversacion: waId,
    estadoActual: 'MensajeInicialEnviado',
  });
  return { customer, channel, conversation };
}

describe('customerRepository', () => {
  test('crea un customer con nombre/email nulos por defecto', async () => {
    const customer = await customerRepository.createCustomer(pool);
    assert.ok(customer.customerId);
    assert.equal(customer.nombre, null);
    assert.equal(customer.email, null);
    assert.ok(customer.createdAt);
    assert.ok(customer.updatedAt);
  });

  test('findCustomerById devuelve null si no existe', async () => {
    const encontrado = await customerRepository.findCustomerById(pool, '00000000-0000-0000-0000-000000000000');
    assert.equal(encontrado, null);
  });

  test('updateCustomerProfile actualiza nombre/email sin tocar el resto', async () => {
    const customer = await customerRepository.createCustomer(pool);
    const actualizado = await customerRepository.updateCustomerProfile(pool, customer.customerId, { nombre: 'Ana' });
    assert.equal(actualizado.nombre, 'Ana');
    assert.equal(actualizado.customerId, customer.customerId);
  });
});

describe('customerChannelRepository', () => {
  test('crea un canal whatsapp y lo encuentra por (tipo_canal, identificador_externo)', async () => {
    const customer = await customerRepository.createCustomer(pool);
    const canal = await customerChannelRepository.createCustomerChannel(pool, {
      customerId: customer.customerId,
      tipoCanal: 'whatsapp',
      identificadorExterno: '5215500000002',
    });
    const encontrado = await customerChannelRepository.findByTipoAndIdentificador(pool, 'whatsapp', '5215500000002');
    assert.equal(encontrado.customerChannelId, canal.customerChannelId);
  });

  test('rechaza un tipo_canal distinto de whatsapp (CHECK constraint)', async () => {
    const customer = await customerRepository.createCustomer(pool);
    await assert.rejects(
      () =>
        customerChannelRepository.createCustomerChannel(pool, {
          customerId: customer.customerId,
          tipoCanal: 'instagram',
          identificadorExterno: 'algun_usuario',
        }),
      /check/i
    );
  });

  test('UNIQUE (tipo_canal, identificador_externo): dos customers no pueden compartir el mismo wa_id', async () => {
    const customerA = await customerRepository.createCustomer(pool);
    const customerB = await customerRepository.createCustomer(pool);
    await customerChannelRepository.createCustomerChannel(pool, {
      customerId: customerA.customerId,
      tipoCanal: 'whatsapp',
      identificadorExterno: '5215500000003',
    });

    await assert.rejects(
      () =>
        customerChannelRepository.createCustomerChannel(pool, {
          customerId: customerB.customerId,
          tipoCanal: 'whatsapp',
          identificadorExterno: '5215500000003',
        }),
      (error) => {
        assert.equal(error.code, '23505'); // unique_violation
        return true;
      }
    );
  });
});

describe('conversationRepository', () => {
  test('crea una conversación ligada a customer + channel', async () => {
    const { conversation, customer, channel } = await crearConversacionDePrueba();
    assert.equal(conversation.customerId, customer.customerId);
    assert.equal(conversation.customerChannelId, channel.customerChannelId);
    assert.equal(conversation.estadoActual, 'MensajeInicialEnviado');
    assert.equal(conversation.handoffPendienteId, null);
  });

  // Fase 16, Parte 4 -- separación estructural REAL/SIMULATED/TEST/FIXTURE/UNKNOWN.
  test('source por defecto es UNKNOWN -- nunca se asume REAL si quien llama no lo declara', async () => {
    const { conversation } = await crearConversacionDePrueba('5215500000099');
    assert.equal(conversation.source, 'UNKNOWN');
  });

  test('acepta un source real explícito (REAL/SIMULATED/TEST/FIXTURE)', async () => {
    const customer = await customerRepository.createCustomer(pool, { nombre: null, email: null });
    const channel = await customerChannelRepository.createCustomerChannel(pool, { customerId: customer.customerId, tipoCanal: 'whatsapp', identificadorExterno: '5215500000098' });
    const conversation = await conversationRepository.createConversation(pool, {
      customerId: customer.customerId, customerChannelId: channel.customerChannelId, waIdConversacion: '5215500000098', source: 'TEST',
    });
    assert.equal(conversation.source, 'TEST');
  });

  test('rechaza un source fuera del vocabulario real -- nunca inventa uno nuevo', async () => {
    const customer = await customerRepository.createCustomer(pool, { nombre: null, email: null });
    const channel = await customerChannelRepository.createCustomerChannel(pool, { customerId: customer.customerId, tipoCanal: 'whatsapp', identificadorExterno: '5215500000097' });
    await assert.rejects(() => conversationRepository.createConversation(pool, {
      customerId: customer.customerId, customerChannelId: channel.customerChannelId, waIdConversacion: '5215500000097', source: 'PRODUCTION',
    }), /source/);
  });

  test('updateEstadoActual cambia el estado y refresca ultima_interaccion', async () => {
    const { conversation } = await crearConversacionDePrueba();
    const antes = conversation.ultimaInteraccion;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const actualizada = await conversationRepository.updateEstadoActual(pool, conversation.conversationId, 'IntencionClasificada');
    assert.equal(actualizada.estadoActual, 'IntencionClasificada');
    assert.notEqual(new Date(actualizada.ultimaInteraccion).getTime(), new Date(antes).getTime());
  });

  test('listStartedBetween: solo trae conversaciones dentro del rango [since, until)', async () => {
    const { conversation: dentro } = await crearConversacionDePrueba('5215500000010');
    const fuera = await conversationRepository.listStartedBetween(pool, {
      since: new Date(Date.now() + 60_000), // ventana futura -- ninguna conversación real cae dentro
      until: new Date(Date.now() + 120_000),
    });
    assert.equal(fuera.length, 0);

    const resultado = await conversationRepository.listStartedBetween(pool, {
      since: new Date(Date.now() - 60_000),
      until: new Date(Date.now() + 60_000),
    });
    assert.ok(resultado.some((c) => c.conversationId === dentro.conversationId));
  });
});

describe('messageRepository (append-only)', () => {
  test('inserta un mensaje entrante y otro saliente', async () => {
    const { conversation } = await crearConversacionDePrueba();
    const entrante = await messageRepository.insertMessage(pool, {
      conversationId: conversation.conversationId,
      direccion: 'entrante',
      texto: 'Hola, quiero información del Té Divina',
      timestamp: new Date(),
    });
    const saliente = await messageRepository.insertMessage(pool, {
      conversationId: conversation.conversationId,
      direccion: 'saliente',
      texto: null,
      recursoTipo: 'audio',
      fuenteRecurso: 'docs/proceso_de_venta/recursos/audio_explicacion.md',
      timestamp: new Date(),
    });
    assert.equal(entrante.direccion, 'entrante');
    assert.equal(saliente.direccion, 'saliente');
    assert.equal(saliente.texto, null);

    const historial = await messageRepository.listByConversationId(pool, conversation.conversationId);
    assert.equal(historial.length, 2);
  });

  test('rechaza una direccion fuera de (entrante, saliente)', async () => {
    const { conversation } = await crearConversacionDePrueba();
    await assert.rejects(() =>
      messageRepository.insertMessage(pool, {
        conversationId: conversation.conversationId,
        direccion: 'lateral',
        timestamp: new Date(),
      })
    );
  });

  test('protección contra duplicados: mismo canal_message_id en la misma conversación se rechaza', async () => {
    const { conversation } = await crearConversacionDePrueba();
    await messageRepository.insertMessage(pool, {
      conversationId: conversation.conversationId,
      direccion: 'entrante',
      texto: 'primer intento de webhook',
      canalMessageId: 'wamid.ABC123',
      timestamp: new Date(),
    });
    await assert.rejects(
      () =>
        messageRepository.insertMessage(pool, {
          conversationId: conversation.conversationId,
          direccion: 'entrante',
          texto: 'reintento del mismo webhook',
          canalMessageId: 'wamid.ABC123',
          timestamp: new Date(),
        }),
      (error) => {
        assert.equal(error.code, '23505');
        return true;
      }
    );
  });

  test('permite múltiples mensajes con canal_message_id NULL (índice único es parcial)', async () => {
    const { conversation } = await crearConversacionDePrueba();
    await messageRepository.insertMessage(pool, {
      conversationId: conversation.conversationId, direccion: 'saliente', texto: 'a', timestamp: new Date(),
    });
    await messageRepository.insertMessage(pool, {
      conversationId: conversation.conversationId, direccion: 'saliente', texto: 'b', timestamp: new Date(),
    });
    const historial = await messageRepository.listByConversationId(pool, conversation.conversationId);
    assert.equal(historial.length, 2);
  });
});

describe('stateTransitionRepository (append-only)', () => {
  test('inserta y lista transiciones en orden cronológico', async () => {
    const { conversation } = await crearConversacionDePrueba();
    await stateTransitionRepository.insertTransition(pool, {
      conversationId: conversation.conversationId,
      estadoAnterior: null,
      estadoNuevo: 'MensajeInicialEnviado',
      timestamp: new Date('2026-08-08T10:00:00Z'),
      fuenteFuncion: 'iniciarConversacionPersistente',
    });
    await stateTransitionRepository.insertTransition(pool, {
      conversationId: conversation.conversationId,
      estadoAnterior: 'MensajeInicialEnviado',
      estadoNuevo: 'IntencionClasificada',
      timestamp: new Date('2026-08-08T10:01:00Z'),
      fuenteFuncion: 'clasificarPrimeraRespuestaPersistente',
      metadata: { intencion: 'consumo' },
    });
    const historial = await stateTransitionRepository.listByConversationId(pool, conversation.conversationId);
    assert.equal(historial.length, 2);
    assert.equal(historial[0].estadoNuevo, 'MensajeInicialEnviado');
    assert.equal(historial[1].estadoNuevo, 'IntencionClasificada');
    assert.deepEqual(historial[1].metadata, { intencion: 'consumo' });
  });
});

describe('opportunityRepository', () => {
  test('crea una oportunidad con total NULL cuando no hay precio real', async () => {
    const { customer, conversation } = await crearConversacionDePrueba();
    const oportunidad = await opportunityRepository.createOpportunity(pool, {
      customerId: customer.customerId,
      conversationId: conversation.conversationId,
      productoId: 'productos/02-cafe-divina/te-divina',
      estado: 'ProductoIdentificado',
    });
    assert.equal(oportunidad.total, null);
    assert.equal(oportunidad.intencionCompra, false);
  });

  test('updateOpportunity hace merge parcial sin descartar campos no mencionados', async () => {
    const { customer, conversation } = await crearConversacionDePrueba();
    const oportunidad = await opportunityRepository.createOpportunity(pool, {
      customerId: customer.customerId,
      conversationId: conversation.conversationId,
      productoId: 'productos/02-cafe-divina/te-divina',
      necesidadId: 'estrenimiento',
      estado: 'NecesidadIdentificada',
    });
    const actualizada = await opportunityRepository.updateOpportunity(pool, oportunidad.opportunityId, {
      estado: 'PrecioEnviado',
    });
    assert.equal(actualizada.estado, 'PrecioEnviado');
    assert.equal(actualizada.necesidadId, 'estrenimiento'); // no se pierde
  });

  test('listCreatedBetween: solo trae oportunidades dentro del rango [since, until)', async () => {
    const { customer, conversation } = await crearConversacionDePrueba();
    const dentro = await opportunityRepository.createOpportunity(pool, {
      customerId: customer.customerId, conversationId: conversation.conversationId,
      productoId: 'productos/02-cafe-divina/te-divina', total: 450.0, estado: 'PedidoProcesado',
    });
    const vacio = await opportunityRepository.listCreatedBetween(pool, {
      since: new Date(Date.now() + 60_000), until: new Date(Date.now() + 120_000),
    });
    assert.equal(vacio.length, 0);

    const resultado = await opportunityRepository.listCreatedBetween(pool, {
      since: new Date(Date.now() - 60_000), until: new Date(Date.now() + 60_000),
    });
    assert.ok(resultado.some((o) => o.opportunityId === dentro.opportunityId));
    assert.equal(resultado.find((o) => o.opportunityId === dentro.opportunityId).total, '450.00');
  });
});

describe('offerLogRepository (append-only)', () => {
  test('registra qué oferta se envió para una oportunidad', async () => {
    const { customer, conversation } = await crearConversacionDePrueba();
    const oportunidad = await opportunityRepository.createOpportunity(pool, {
      customerId: customer.customerId,
      conversationId: conversation.conversationId,
      productoId: 'productos/02-cafe-divina/te-divina',
      estado: 'OfertaEnviada',
    });
    const registro = await offerLogRepository.insertOfferLog(pool, {
      opportunityId: oportunidad.opportunityId,
      productoId: 'productos/02-cafe-divina/te-divina',
      ofertaFuente: 'SPRINT_5_PROCESO_COMERCIAL.md §8',
      enviadaEn: new Date(),
    });
    assert.ok(registro.offerLogId);
    const lista = await offerLogRepository.listByOpportunityId(pool, oportunidad.opportunityId);
    assert.equal(lista.length, 1);
  });
});

describe('followUpRepository', () => {
  test('crea un follow-up postventa_dia3 pendiente y lo marca ejecutado', async () => {
    const { conversation } = await crearConversacionDePrueba();
    const followUp = await followUpRepository.createFollowUp(pool, {
      conversationId: conversation.conversationId,
      tipo: 'postventa_dia3',
      fechaProgramada: new Date(Date.now() - 1000),
      requiereIntervencionHumana: true,
    });
    assert.equal(followUp.estado, 'pendiente');

    const pendientes = await followUpRepository.listPendingDueBy(pool, new Date());
    assert.ok(pendientes.some((f) => f.followUpId === followUp.followUpId));

    const ejecutado = await followUpRepository.marcarEjecutado(pool, followUp.followUpId, { resultado: 'sin_respuesta' });
    assert.equal(ejecutado.estado, 'ejecutado');
    assert.equal(ejecutado.resultado, 'sin_respuesta');
  });

  test('rechaza un tipo fuera de los 3 vigentes', async () => {
    const { conversation } = await crearConversacionDePrueba();
    await assert.rejects(() =>
      followUpRepository.createFollowUp(pool, {
        conversationId: conversation.conversationId,
        tipo: 'seguimiento_24h', // modelo histórico no vigente (seguimiento.md) — no debe existir en el schema
        fechaProgramada: new Date(),
      })
    );
  });

  test('marcarCancelado registra el motivo', async () => {
    const { conversation } = await crearConversacionDePrueba();
    const followUp = await followUpRepository.createFollowUp(pool, {
      conversationId: conversation.conversationId,
      tipo: 'recuperacion_dia5',
      fechaProgramada: new Date(),
    });
    const cancelado = await followUpRepository.marcarCancelado(pool, followUp.followUpId, 'cliente recontactó antes de la ventana');
    assert.equal(cancelado.estado, 'cancelado');
    assert.equal(cancelado.motivoCancelacion, 'cliente recontactó antes de la ventana');
  });
});

describe('handoffRepository', () => {
  test('crea un handoff y lo resuelve una sola vez', async () => {
    const { conversation } = await crearConversacionDePrueba();
    const handoff = await handoffRepository.insertHandoff(pool, {
      conversationId: conversation.conversationId,
      motivo: 'No fue posible identificar el producto de interés a partir del mensaje del cliente.',
      fuente: 'simulator/src/ventaRealRules.js#identificarProducto',
    });
    assert.equal(handoff.resueltoEn, null);

    const pendientes = await handoffRepository.listPendientesByConversationId(pool, conversation.conversationId);
    assert.equal(pendientes.length, 1);

    const resuelto = await handoffRepository.resolveHandoff(pool, handoff.handoffId, { resueltoPor: 'asesor_manual' });
    assert.ok(resuelto.resueltoEn);
    assert.equal(resuelto.resueltoPor, 'asesor_manual');

    // Segunda resolución no pisa la primera (WHERE resuelto_en IS NULL en el repository).
    const segundoIntento = await handoffRepository.resolveHandoff(pool, handoff.handoffId, { resueltoPor: 'otro' });
    assert.equal(segundoIntento, null);
  });

  test('conversations.handoff_pendiente_id puede apuntar a un handoff real', async () => {
    const { conversation } = await crearConversacionDePrueba();
    const handoff = await handoffRepository.insertHandoff(pool, {
      conversationId: conversation.conversationId,
      motivo: 'Duda sin conocimiento autorizado.',
    });
    const actualizada = await conversationRepository.setHandoffPendiente(pool, conversation.conversationId, handoff.handoffId);
    assert.equal(actualizada.handoffPendienteId, handoff.handoffId);
  });
});

describe('productPricingRepository', () => {
  test('upsert crea la fila si no existe', async () => {
    const fila = await productPricingRepository.upsertProductPricing(pool, {
      productoId: 'productos/02-cafe-divina/te-divina',
      precio: null,
      disponibleStock: null,
      actualizadoPor: 'manual',
    });
    assert.equal(fila.precio, null);
    assert.equal(fila.disponibleStock, null);
  });

  test('upsert actualiza precio/stock sin duplicar la fila (PK = producto_id)', async () => {
    await productPricingRepository.upsertProductPricing(pool, {
      productoId: 'productos/02-cafe-divina/te-divina',
      precio: null,
      disponibleStock: null,
    });
    const actualizada = await productPricingRepository.upsertProductPricing(pool, {
      productoId: 'productos/02-cafe-divina/te-divina',
      precio: 899.0,
      disponibleStock: true,
      actualizadoPor: 'inventario_manual',
    });
    assert.equal(Number(actualizada.precio), 899);
    assert.equal(actualizada.disponibleStock, true);

    const todas = await productPricingRepository.findByProductoIds(pool, ['productos/02-cafe-divina/te-divina']);
    assert.equal(todas.length, 1);
  });
});

describe('Foreign keys', () => {
  test('crear un customer_channel con customer_id inexistente falla (FK)', async () => {
    await assert.rejects(
      () =>
        customerChannelRepository.createCustomerChannel(pool, {
          customerId: '00000000-0000-0000-0000-000000000000',
          tipoCanal: 'whatsapp',
          identificadorExterno: '5215500000099',
        }),
      (error) => {
        assert.equal(error.code, '23503'); // foreign_key_violation
        return true;
      }
    );
  });

  test('ON DELETE RESTRICT: no se puede borrar un customer con conversaciones (historial protegido)', async () => {
    const { customer } = await crearConversacionDePrueba();
    await assert.rejects(
      () => pool.query('DELETE FROM customers WHERE customer_id = $1', [customer.customerId]),
      (error) => {
        // 23001 = restrict_violation — el código específico que PostgreSQL usa
        // cuando ON DELETE RESTRICT bloquea un DELETE del lado referenciado.
        // 23503 (foreign_key_violation, ya cubierto arriba en "crear un
        // customer_channel con customer_id inexistente falla") es el código
        // para INSERT/UPDATE con una FK que no existe — un caso distinto.
        assert.equal(error.code, '23001');
        return true;
      }
    );
  });

  test('ON DELETE SET NULL: borrar un handoff limpia conversations.handoff_pendiente_id en vez de bloquear', async () => {
    const { conversation } = await crearConversacionDePrueba();
    const handoff = await handoffRepository.insertHandoff(pool, {
      conversationId: conversation.conversationId,
      motivo: 'motivo de prueba',
    });
    await conversationRepository.setHandoffPendiente(pool, conversation.conversationId, handoff.handoffId);

    await pool.query('DELETE FROM handoffs WHERE handoff_id = $1', [handoff.handoffId]);

    const recargada = await conversationRepository.findConversationById(pool, conversation.conversationId);
    assert.equal(recargada.handoffPendienteId, null);
  });
});
