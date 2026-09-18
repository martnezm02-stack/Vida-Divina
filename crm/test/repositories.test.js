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
import * as inventoryRepository from '../repositories/inventoryRepository.js';
import * as inventoryMovementRepository from '../repositories/inventoryMovementRepository.js';
import * as orderRepository from '../repositories/orderRepository.js';
import * as paymentRepository from '../repositories/paymentRepository.js';
import * as reportingRepository from '../repositories/reportingRepository.js';

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

// FASE "Attribution + Reporting + Email MCP + Alerta WhatsApp" (2026-09-04)
describe('customerRepository — attribution', () => {
  test('4) sin metadata real -> first_touch queda NULL, nunca se inventa un origen', async () => {
    const customer = await customerRepository.createCustomer(pool, { nombre: 'Sin atribución' });
    assert.equal(customer.firstTouchPlatform, null);
    assert.equal(customer.firstTouchSource, null);
    assert.equal(customer.firstTouchAt, null);
  });

  test('1) first_touch real se persiste al crear el customer', async () => {
    const customer = await customerRepository.createCustomer(pool, {
      firstTouch: {
        platform: 'instagram', source: 'organic', contentId: 'ig_reel_tongkat_07',
      },
    });
    assert.equal(customer.firstTouchPlatform, 'instagram');
    assert.equal(customer.firstTouchSource, 'organic');
    assert.equal(customer.firstTouchContentId, 'ig_reel_tongkat_07');
    assert.ok(customer.firstTouchAt, 'first_touch_at debe quedar registrado cuando hay atribución real');
  });

  test('1) first_touch se conserva -- una segunda "atribución" en la creación no aplica (ya existe el customer, no se puede recrear)', async () => {
    // La garantía real de inmutabilidad es de diseño: createCustomer solo
    // escribe first_touch UNA vez (al INSERT); no existe ninguna función
    // "updateFirstTouch" en este repository -- verificado también por
    // ausencia de esa función en el módulo.
    assert.equal(customerRepository.updateFirstTouch, undefined);
  });

  test('2) last_touch se actualiza correctamente sin tocar first_touch', async () => {
    const customer = await customerRepository.createCustomer(pool, {
      firstTouch: { platform: 'instagram', source: 'organic', contentId: 'ig_reel_tongkat_07' },
    });
    const actualizado = await customerRepository.updateLastTouch(pool, customer.customerId, {
      platform: 'facebook', source: 'paid', campaign: 'tongkat-septiembre', creativeId: 'creative_12',
    });
    assert.equal(actualizado.lastTouchPlatform, 'facebook');
    assert.equal(actualizado.lastTouchSource, 'paid');
    assert.equal(actualizado.lastTouchCampaign, 'tongkat-septiembre');
    assert.equal(actualizado.lastTouchCreativeId, 'creative_12');
    assert.ok(actualizado.lastTouchAt);
    // first_touch real, del ejemplo del encargo, sigue intacto.
    assert.equal(actualizado.firstTouchPlatform, 'instagram');
    assert.equal(actualizado.firstTouchContentId, 'ig_reel_tongkat_07');
  });

  test('5) campaign/content se conservan tal cual (ningún campo se trunca ni se reescribe)', async () => {
    const customer = await customerRepository.createCustomer(pool, {
      firstTouch: {
        platform: 'facebook', source: 'paid', medium: 'cpc',
        campaign: 'tongkat-septiembre', campaignId: 'camp_998', content: 'Video testimonio',
        contentId: 'fb_post_123', adId: 'ad_456', creativeId: 'creative_12',
      },
    });
    assert.equal(customer.firstTouchCampaign, 'tongkat-septiembre');
    assert.equal(customer.firstTouchCampaignId, 'camp_998');
    assert.equal(customer.firstTouchContent, 'Video testimonio');
    assert.equal(customer.firstTouchContentId, 'fb_post_123');
    assert.equal(customer.firstTouchAdId, 'ad_456');
    assert.equal(customer.firstTouchCreativeId, 'creative_12');
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

  test('listByDateRange devuelve solo los follow-ups reales dentro de [since, until), cualquier estado', async () => {
    const { conversation } = await crearConversacionDePrueba();
    const dentro = await followUpRepository.createFollowUp(pool, {
      conversationId: conversation.conversationId,
      tipo: 'postventa_dia3',
      fechaProgramada: new Date('2027-05-10T10:00:00Z'),
    });
    const fuera = await followUpRepository.createFollowUp(pool, {
      conversationId: conversation.conversationId,
      tipo: 'postventa_semana',
      fechaProgramada: new Date('2027-06-01T10:00:00Z'),
    });

    const rango = await followUpRepository.listByDateRange(pool, {
      since: new Date('2027-05-01T00:00:00Z'),
      until: new Date('2027-05-31T00:00:00Z'),
    });
    const ids = rango.map((f) => f.followUpId);
    assert.ok(ids.includes(dentro.followUpId));
    assert.ok(!ids.includes(fuera.followUpId));
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

  test('listPendientes: trae handoffs sin resolver de CUALQUIER conversación, más recientes primero (FASE "Alerta interna de handoff")', async () => {
    const { conversation: conv1 } = await crearConversacionDePrueba('5215500000010');
    const { conversation: conv2 } = await crearConversacionDePrueba('5215500000011');

    const h1 = await handoffRepository.insertHandoff(pool, { conversationId: conv1.conversationId, motivo: 'primero' });
    const h2 = await handoffRepository.insertHandoff(pool, { conversationId: conv2.conversationId, motivo: 'segundo' });

    const pendientes = await handoffRepository.listPendientes(pool);
    assert.equal(pendientes.length, 2);
    assert.deepEqual(pendientes.map((p) => p.handoffId), [h2.handoffId, h1.handoffId]);

    // Un handoff resuelto ya no aparece en la bandeja de alertas.
    await handoffRepository.resolveHandoff(pool, h1.handoffId, { resueltoPor: 'asesor_manual' });
    const pendientesTrasResolver = await handoffRepository.listPendientes(pool);
    assert.equal(pendientesTrasResolver.length, 1);
    assert.equal(pendientesTrasResolver[0].handoffId, h2.handoffId);
  });

  test('listPendientes respeta el límite', async () => {
    const { conversation } = await crearConversacionDePrueba('5215500000012');
    await handoffRepository.insertHandoff(pool, { conversationId: conversation.conversationId, motivo: 'a' });
    await handoffRepository.insertHandoff(pool, { conversationId: conversation.conversationId, motivo: 'b' });
    const pendientes = await handoffRepository.listPendientes(pool, { limit: 1 });
    assert.equal(pendientes.length, 1);
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

// FASE "Sistema de Inventario" (2026-09-15)
describe('inventoryRepository', () => {
  test('upsert crea la fila si no existe', async () => {
    const fila = await inventoryRepository.upsertInventory(pool, {
      productoId: 'productos/01-control-de-peso/tedivina',
      cantidadActual: 11,
      minimo: 6,
      costoUnitario: 1020,
      monedaCosto: 'MXN',
      actualizadoPor: 'test',
    });
    assert.equal(fila.cantidadActual, 11);
    assert.equal(fila.minimo, 6);
    assert.equal(Number(fila.costoUnitario), 1020);
  });

  test('upsert actualiza sin duplicar la fila (PK = producto_id)', async () => {
    await inventoryRepository.upsertInventory(pool, {
      productoId: 'productos/01-control-de-peso/sculpt-max',
      cantidadActual: 1,
      minimo: 1,
    });
    const actualizada = await inventoryRepository.upsertInventory(pool, {
      productoId: 'productos/01-control-de-peso/sculpt-max',
      cantidadActual: 0,
    });
    assert.equal(actualizada.cantidadActual, 0);
    assert.equal(actualizada.minimo, 1); // preservado -- no se tocó en el segundo upsert

    const todas = await inventoryRepository.findByProductoIds(pool, ['productos/01-control-de-peso/sculpt-max']);
    assert.equal(todas.length, 1);
  });

  test('findLowStock devuelve solo productos en o bajo su mínimo real', async () => {
    await inventoryRepository.upsertInventory(pool, { productoId: 'a', cantidadActual: 0, minimo: 1 }); // OUT_OF_STOCK
    await inventoryRepository.upsertInventory(pool, { productoId: 'b', cantidadActual: 1, minimo: 1 }); // LOW_STOCK
    await inventoryRepository.upsertInventory(pool, { productoId: 'c', cantidadActual: 11, minimo: 6 }); // NORMAL
    await inventoryRepository.upsertInventory(pool, { productoId: 'd', cantidadActual: 0, minimo: null }); // sin mínimo -- nunca se evalúa

    const bajos = await inventoryRepository.findLowStock(pool);
    const ids = bajos.map((r) => r.productoId).sort();
    assert.deepEqual(ids, ['a', 'b']);
  });
});

describe('inventoryMovementRepository (append-only)', () => {
  test('insertMovement crea un movimiento y reconcilia con inventory.cantidad_actual', async () => {
    await inventoryRepository.upsertInventory(pool, {
      productoId: 'productos/01-control-de-peso/tedivina',
      cantidadActual: 11,
      minimo: 6,
    });
    await inventoryMovementRepository.insertMovement(pool, {
      productoId: 'productos/01-control-de-peso/tedivina',
      tipo: 'INITIAL_BALANCE',
      cantidad: 12,
      timestamp: '2026-09-14T00:00:00Z',
      motivo: 'Carga inicial',
    });
    await inventoryMovementRepository.insertMovement(pool, {
      productoId: 'productos/01-control-de-peso/tedivina',
      tipo: 'ADJUSTMENT',
      cantidad: -1,
      timestamp: '2026-09-14T00:00:00Z',
      motivo: 'Salida sin naturaleza confirmada',
    });

    const suma = await inventoryMovementRepository.sumCantidadByProductoId(pool, 'productos/01-control-de-peso/tedivina');
    assert.equal(suma, 11);

    const fila = await inventoryRepository.findByProductoId(pool, 'productos/01-control-de-peso/tedivina');
    assert.equal(fila.cantidadActual, suma); // reconciliado con el saldo real

    const historial = await inventoryMovementRepository.listByProductoId(pool, 'productos/01-control-de-peso/tedivina');
    assert.equal(historial.length, 2);
    assert.equal(historial[0].tipo, 'INITIAL_BALANCE');
  });

  test('rechaza un movimiento de un producto sin fila de inventory (integridad referencial real)', async () => {
    await assert.rejects(() =>
      inventoryMovementRepository.insertMovement(pool, {
        productoId: 'producto-inexistente',
        tipo: 'ADJUSTMENT',
        cantidad: -1,
        timestamp: '2026-09-14T00:00:00Z',
      })
    );
  });

  test('tipo fuera del vocabulario cerrado es rechazado por el CHECK del schema', async () => {
    await inventoryRepository.upsertInventory(pool, { productoId: 'x', cantidadActual: 0 });
    await assert.rejects(() =>
      inventoryMovementRepository.insertMovement(pool, {
        productoId: 'x',
        tipo: 'RETURN', // no es INITIAL_BALANCE/ADJUSTMENT/SALE
        cantidad: 1,
        timestamp: '2026-09-14T00:00:00Z',
      })
    );
  });
});

// FASE "Núcleo Comercial: orders -> payments -> SALE -> inventory" (2026-09-15)
describe('orderRepository', () => {
  test('insertOrder crea la orden y sus líneas, con total y precios congelados', async () => {
    const customer = await customerRepository.createCustomer(pool, { nombre: null, email: null });
    const { order, items } = await orderRepository.insertOrder(pool, {
      customerId: customer.customerId,
      items: [
        { productoId: 'productos/01-control-de-peso/tedivina', cantidad: 2, precioUnitario: 1799 },
        { productoId: 'productos/02-cafe-divina/cappuccino', cantidad: 1, precioUnitario: 899 },
      ],
    });
    assert.equal(order.estado, 'pendiente');
    assert.equal(Number(order.total), 2 * 1799 + 899);
    assert.equal(items.length, 2);
    assert.equal(Number(items[0].subtotal), 2 * 1799);
  });

  test('insertOrder rechaza una orden sin líneas', async () => {
    const customer = await customerRepository.createCustomer(pool, { nombre: null, email: null });
    await assert.rejects(() => orderRepository.insertOrder(pool, { customerId: customer.customerId, items: [] }));
  });

  test('markConfirmed es un no-op a nivel SQL si la orden ya no está pendiente', async () => {
    const customer = await customerRepository.createCustomer(pool, { nombre: null, email: null });
    const { order } = await orderRepository.insertOrder(pool, {
      customerId: customer.customerId,
      items: [{ productoId: 'x', cantidad: 1, precioUnitario: 100 }],
    });
    await orderRepository.markConfirmed(pool, order.orderId);
    const segundaVez = await orderRepository.markConfirmed(pool, order.orderId);
    assert.equal(segundaVez, null); // ya no estaba 'pendiente' -- 0 filas afectadas
  });
});

describe('paymentRepository', () => {
  test('insertPayment nace pendiente y markConfirmed/markRejected transicionan una sola vez', async () => {
    const customer = await customerRepository.createCustomer(pool, { nombre: null, email: null });
    const { order } = await orderRepository.insertOrder(pool, {
      customerId: customer.customerId,
      items: [{ productoId: 'x', cantidad: 1, precioUnitario: 100 }],
    });
    const payment = await paymentRepository.insertPayment(pool, {
      orderId: order.orderId,
      metodo: 'transferencia',
      importe: 100,
    });
    assert.equal(payment.estado, 'pendiente');

    const confirmado = await paymentRepository.markConfirmed(pool, payment.paymentId);
    assert.equal(confirmado.estado, 'confirmado');

    const segundaVez = await paymentRepository.markRejected(pool, payment.paymentId);
    assert.equal(segundaVez, null); // ya no estaba 'pendiente'
  });

  test('listPending devuelve solo pagos reales en estado pendiente, nunca confirmados/rechazados', async () => {
    const customer = await customerRepository.createCustomer(pool, { nombre: null, email: null });
    const { order } = await orderRepository.insertOrder(pool, {
      customerId: customer.customerId,
      items: [{ productoId: 'x', cantidad: 1, precioUnitario: 200 }],
    });
    const pendiente = await paymentRepository.insertPayment(pool, { orderId: order.orderId, metodo: 'transferencia', importe: 200 });

    const { order: order2 } = await orderRepository.insertOrder(pool, {
      customerId: customer.customerId,
      items: [{ productoId: 'x', cantidad: 1, precioUnitario: 300 }],
    });
    const confirmadoInicial = await paymentRepository.insertPayment(pool, { orderId: order2.orderId, metodo: 'mercadopago', importe: 300 });
    await paymentRepository.markConfirmed(pool, confirmadoInicial.paymentId);

    const pendientes = await paymentRepository.listPending(pool);
    const ids = pendientes.map((p) => p.paymentId);
    assert.ok(ids.includes(pendiente.paymentId));
    assert.ok(!ids.includes(confirmadoInicial.paymentId));
  });
});

// FASE "Attribution + Reporting + Email MCP + Alerta WhatsApp" (2026-09-04)
describe('reportingRepository (solo lectura, sobre datos reales del CRM)', () => {
  const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const MANANA = new Date(Date.now() + 24 * 60 * 60 * 1000);

  test('6) countNewCustomers: cuenta clientes reales creados en el rango', async () => {
    await customerRepository.createCustomer(pool);
    await customerRepository.createCustomer(pool);
    const n = await reportingRepository.countNewCustomers(pool, { since: AYER, until: MANANA });
    assert.equal(n, 2);
  });

  test('9) countLeads / countQualifiedLeads: sobre oportunidades reales', async () => {
    const { conversation } = await crearConversacionDePrueba('5215500000020');
    await opportunityRepository.createOpportunity(pool, {
      customerId: conversation.customerId, conversationId: conversation.conversationId,
      productoId: 'productos/01-control-de-peso/tongkat-ali', estado: 'ProductoIdentificado', intencionCompra: false,
    });
    await opportunityRepository.createOpportunity(pool, {
      customerId: conversation.customerId, conversationId: conversation.conversationId,
      productoId: 'productos/01-control-de-peso/tongkat-ali', estado: 'PrecioEnviado', intencionCompra: true,
    });
    const leads = await reportingRepository.countLeads(pool, { since: AYER, until: MANANA });
    const calificados = await reportingRepository.countQualifiedLeads(pool, { since: AYER, until: MANANA });
    assert.equal(leads, 2);
    assert.equal(calificados, 1);
  });

  test('10) countHandoffs: sobre handoffs reales del rango', async () => {
    const { conversation } = await crearConversacionDePrueba('5215500000021');
    await handoffRepository.insertHandoff(pool, { conversationId: conversation.conversationId, motivo: 'prueba reporting' });
    const n = await reportingRepository.countHandoffs(pool, { since: AYER, until: MANANA });
    assert.equal(n, 1);
  });

  test('7-8) topProductsByPurchaseIntent: nunca "ventas", solo intención real de compra', async () => {
    const { conversation } = await crearConversacionDePrueba('5215500000022');
    await opportunityRepository.createOpportunity(pool, {
      customerId: conversation.customerId, conversationId: conversation.conversationId,
      productoId: 'productos/01-control-de-peso/tongkat-ali', estado: 'PrecioEnviado', intencionCompra: true,
    });
    await opportunityRepository.createOpportunity(pool, {
      customerId: conversation.customerId, conversationId: conversation.conversationId,
      productoId: 'productos/01-control-de-peso/tongkat-ali', estado: 'PrecioEnviado', intencionCompra: true,
    });
    const top = await reportingRepository.topProductsByPurchaseIntent(pool, { since: AYER, until: MANANA });
    assert.equal(top[0].productoId, 'productos/01-control-de-peso/tongkat-ali');
    assert.equal(top[0].intentos, 2);
  });

  test('11-12) attributionBreakdown: first_touch y last_touch reales, "unknown" para quienes no tienen atribución', async () => {
    await customerRepository.createCustomer(pool, { firstTouch: { platform: 'instagram', source: 'organic' } });
    await customerRepository.createCustomer(pool); // sin atribución real -- debe caer en "unknown"

    const first = await reportingRepository.attributionBreakdown(pool, { since: AYER, until: MANANA, dimension: 'platform', touch: 'first' });
    const porValor = Object.fromEntries(first.map((r) => [r.valor, r.n]));
    assert.equal(porValor['instagram'], 1);
    assert.equal(porValor['unknown'], 1, 'ausencia real de atribución debe agruparse como unknown, nunca omitirse ni inventarse');
  });

  test('13-14) contentAttributionForProduct: cruce real customer(first_touch_content_id) x opportunity(producto_id, intencion_compra)', async () => {
    const customer = await customerRepository.createCustomer(pool, {
      firstTouch: { platform: 'instagram', source: 'organic', contentId: 'ig_reel_tongkat_07' },
    });
    const channel = await customerChannelRepository.createCustomerChannel(pool, {
      customerId: customer.customerId, tipoCanal: 'whatsapp', identificadorExterno: '5215500000023',
    });
    const conversation = await conversationRepository.createConversation(pool, {
      customerId: customer.customerId, customerChannelId: channel.customerChannelId, waIdConversacion: '5215500000023',
    });
    await opportunityRepository.createOpportunity(pool, {
      customerId: customer.customerId, conversationId: conversation.conversationId,
      productoId: 'productos/01-control-de-peso/tongkat-ali', estado: 'PrecioEnviado', intencionCompra: true,
    });

    const cruce = await reportingRepository.contentAttributionForProduct(pool, {
      productoId: 'productos/01-control-de-peso/tongkat-ali', since: AYER, until: MANANA,
    });
    assert.equal(cruce[0].contentId, 'ig_reel_tongkat_07');
    assert.equal(cruce[0].platform, 'instagram');
    assert.equal(cruce[0].intentos, 1);
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

  test('crear una order con customer_id inexistente falla (FK)', async () => {
    await assert.rejects(
      () =>
        orderRepository.insertOrder(pool, {
          customerId: '00000000-0000-0000-0000-000000000000',
          items: [{ productoId: 'x', cantidad: 1, precioUnitario: 100 }],
        }),
      (error) => {
        assert.equal(error.code, '23503');
        return true;
      }
    );
  });

  test('crear un payment con order_id inexistente falla (FK)', async () => {
    await assert.rejects(
      () =>
        paymentRepository.insertPayment(pool, {
          orderId: '00000000-0000-0000-0000-000000000000',
          metodo: 'transferencia',
          importe: 100,
        }),
      (error) => {
        assert.equal(error.code, '23503');
        return true;
      }
    );
  });

  test('un SALE sin order_id es rechazado por el CHECK real del schema (trazabilidad obligatoria)', async () => {
    await inventoryRepository.upsertInventory(pool, { productoId: 'x', cantidadActual: 5 });
    await assert.rejects(
      () =>
        inventoryMovementRepository.insertMovement(pool, {
          productoId: 'x',
          tipo: 'SALE',
          cantidad: -1,
          timestamp: '2026-09-14T00:00:00Z',
          // orderId omitido a propósito
        }),
      (error) => {
        assert.equal(error.code, '23514'); // check_violation
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
