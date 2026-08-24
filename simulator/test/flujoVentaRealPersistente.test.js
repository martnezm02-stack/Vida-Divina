// flujoVentaRealPersistente.test.js
// Prueba de integración: el flujo comercial ya implementado en la Fase 3
// (funciones puras de flujoVentaReal.js) sigue funcionando igual cuando
// se invoca a través de los envoltorios persistentes de la Fase 3.2 —
// mismo resultado de negocio, con la diferencia de que ahora el contexto
// sobrevive entre llamadas en PostgreSQL (Fase C.2B — antes JSON en disco;
// ver docs/CRM_FASE_C2_ASYNC_MIGRATION.md).
//
// Fase C.2B: archivo adaptado agregando async/await en cada test — ninguna
// aserción de negocio cambió.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCompiledKnowledge } from '../src/knowledgeLoader.js';
import { CONTEXTOS_ROOT, recuperarContexto, guardarContexto } from '../src/contextoStorage.js';
import {
  clasificarPrimeraRespuestaPersistente,
  procesarFlujoConsumoPersistente,
  procesarNecesidadYPrecioPersistente,
  procesarRespuestaClientePersistente,
  procesarOfertaYCierrePersistente,
  procesarRespuestaRecuperacionPersistente,
  crearContextoConversacion,
} from '../src/flujoVentaReal.js';
// Ver nota equivalente en contextoStorage.test.js — reutiliza la
// infraestructura de test de crm/ para limpiar PostgreSQL entre corridas
// (el import de `pg` sigue viviendo dentro de crm/, no aquí).
import { getTestPool, resetDatabase, closeTestPool } from '../../crm/test/helpers/db.js';
// Ver nota en contextoStorage.test.js — contextoStorage.js usa el pool de
// crm/index.js (DATABASE_URL), una instancia distinta del pool de test
// (TEST_DATABASE_URL) — hay que cerrar ambas explícitamente.
import { closePool as closeCrmPool } from '../../crm/index.js';

before(async () => {
  const pool = await getTestPool();
  await resetDatabase(pool);
});

after(async () => {
  await closeCrmPool();
  await closeTestPool();
});

const kb = loadCompiledKnowledge();
const ID = 'test-flujo-persistente-tedivina';
const ID_OFERTA_TEDIVINA = 'test-oferta-cierre-tedivina';
const ID_OFERTA_PENDIENTE = 'test-oferta-cierre-pendiente';
const ID_RECUPERACION = `test-recuperacion-persistente-${Date.now()}`;

describe('Flujo comercial completo a través de los envoltorios persistentes', () => {
  test('clasificación → producto/audio → necesidad/precio, acumulando el mismo contexto en PostgreSQL', async () => {
    const paso1 = await clasificarPrimeraRespuestaPersistente(ID, 'Hola, quiero comprar Té Divina.');
    assert.equal(paso1.resultado.intencion, 'consumo');
    assert.equal(paso1.contexto.id, ID);

    const paso2 = await procesarFlujoConsumoPersistente(ID, kb, 'Hola, quiero comprar Té Divina.');
    assert.equal(paso2.resultado.handoff, null);
    assert.equal(paso2.contexto.productoId, 'productos/01-control-de-peso/tedivina');
    // El estado del paso 1 (IntencionClasificada) no se perdió al re-abrir
    // el contexto en el paso 2 — se sobrescribe solo el campo `estado`
    // hacia el siguiente paso, el resto del contexto se conserva.
    assert.equal(paso2.contexto.ultimaIntencion, 'consumo');

    const paso3 = await procesarNecesidadYPrecioPersistente(ID, 'Me interesa para el estreñimiento.');
    assert.equal(paso3.resultado.necesidadId, 'estrenimiento');
    // Fase Pre-E2E: Té Divina ya tiene precio real en el catálogo del
    // piloto (docs/proceso_de_venta/recursos/precios.md) — el flujo ya no
    // se detiene aquí.
    assert.equal(paso3.resultado.handoff, null);
    assert.equal(paso3.contexto.necesidadId, 'estrenimiento');
    assert.equal(paso3.contexto.handoffPendiente, false);
    assert.equal(paso3.contexto.precioEnviado, true);
    assert.equal(paso3.contexto.precioUtilizado.precio, 1600);
    // El producto identificado en el paso 2 sigue presente en el paso 3.
    assert.equal(paso3.contexto.productoId, 'productos/01-control-de-peso/tedivina');

    const paso4 = await procesarOfertaYCierrePersistente(ID);
    assert.equal(paso4.resultado.handoff, null);
    assert.equal(paso4.contexto.ofertaEnviada, true);
    assert.equal(paso4.contexto.cierreEnviado, true);
    assert.equal(paso4.contexto.estado, 'CierreEnviado');

    // Verificación final: lo que quedó persistido es exactamente la suma
    // acumulada de los cuatro pasos, no solo el último.
    const enDisco = await recuperarContexto(ID);
    assert.equal(enDisco.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(enDisco.necesidadId, 'estrenimiento');
    assert.equal(enDisco.handoffPendiente, false);
    assert.equal(enDisco.estado, 'CierreEnviado');
  });

  test('una duda documentada ("Está caro.") no destruye el contexto acumulado', async () => {
    const resultado = await procesarRespuestaClientePersistente(ID, 'Está caro.');
    assert.equal(resultado.resultado.tipo, 'duda_documentada');
    // El producto y la necesidad de los pasos anteriores siguen ahí.
    assert.equal(resultado.contexto.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(resultado.contexto.necesidadId, 'estrenimiento');
  });
});

describe('Producto fuera del catálogo del piloto — el precio PENDIENTE sigue generando handoff (persistente)', () => {
  const ID_PENDIENTE = 'test-flujo-persistente-precio-pendiente';

  test('necesidad identificada, precio PENDIENTE: handoff persistido correctamente', async () => {
    await guardarContexto(ID_PENDIENTE, {
      ...crearContextoConversacion(),
      id: ID_PENDIENTE,
      productoId: 'productos/01-control-de-peso/atom-capsules',
    });

    const resultado = await procesarNecesidadYPrecioPersistente(ID_PENDIENTE, 'Me interesa para el estreñimiento.');
    assert.equal(resultado.resultado.necesidadId, 'estrenimiento');
    assert.ok(resultado.resultado.handoff);
    assert.equal(resultado.contexto.handoffPendiente, true);
    assert.ok(resultado.contexto.motivoHandoff.length > 0);

    const enDisco = await recuperarContexto(ID_PENDIENTE);
    assert.equal(enDisco.handoffPendiente, true);
  });
});

describe('procesarOfertaYCierrePersistente', () => {
  test('Té Divina: oferta y cierre disponibles, se registran en el contexto sin perder lo previo', async () => {
    await guardarContexto(ID_OFERTA_TEDIVINA, {
      ...crearContextoConversacion(),
      id: ID_OFERTA_TEDIVINA,
      // Fase C.2B — hallazgo real: precioUtilizado (y el resto de los
      // campos "transportados", ver docs/CRM_FASE_C1_CONTEXT_PROJECTION.md
      // §6) solo se capturan cuando acompañan un cambio real de estado —
      // exactamente como ocurre en el código real de flujoVentaReal.js
      // (procesarNecesidadYPrecioPersistente fija precioUtilizado y estado
      // en la misma llamada, siempre). El fixture original (JSON) no
      // necesitaba fijar estado para que precioUtilizado sobreviviera; el
      // backend de PostgreSQL sí, así que se agrega aquí para que el
      // fixture sea fiel a cómo el motor real produce este dato.
      estado: 'PrecioEnviado',
      productoId: 'productos/01-control-de-peso/tedivina',
      necesidadId: 'estrenimiento',
      precioUtilizado: { disponible: true, texto: 'placeholder-de-prueba' },
    });

    const { contexto, resultado } = await procesarOfertaYCierrePersistente(ID_OFERTA_TEDIVINA);

    assert.equal(resultado.handoff, null);
    assert.equal(resultado.oferta.disponible, true);
    assert.equal(resultado.cierre.tipo, 'audio');
    assert.equal(contexto.estado, 'CierreEnviado');
    assert.equal(contexto.ofertaEnviada, true);
    assert.ok(contexto.ofertaUtilizada.texto.length > 0);
    assert.equal(contexto.cierreEnviado, true);
    assert.equal(contexto.cierreUtilizado.tipo, 'audio');
    // Producto, necesidad y precio de pasos anteriores se conservan.
    assert.equal(contexto.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(contexto.necesidadId, 'estrenimiento');
    assert.equal(contexto.precioUtilizado.disponible, true);

    const enDisco = await recuperarContexto(ID_OFERTA_TEDIVINA);
    assert.equal(enDisco.cierreUtilizado.tipo, 'audio');
  });

  test('Producto sin oferta documentada: handoff, sin inventar el recurso', async () => {
    await guardarContexto(ID_OFERTA_PENDIENTE, {
      ...crearContextoConversacion(),
      id: ID_OFERTA_PENDIENTE,
      productoId: 'productos/01-control-de-peso/sculpt-max',
    });

    const { contexto, resultado } = await procesarOfertaYCierrePersistente(ID_OFERTA_PENDIENTE);

    assert.ok(resultado.handoff);
    assert.equal(resultado.handoff.requiereHumano, true);
    assert.equal(resultado.handoff.mensajeParaCliente, null);
    assert.equal(contexto.ofertaEnviada, false);
    assert.equal(contexto.ofertaUtilizada, null);
    assert.equal(contexto.handoffPendiente, true);
    assert.equal(contexto.productoId, 'productos/01-control-de-peso/sculpt-max');
  });
});

describe('procesarRespuestaRecuperacionPersistente', () => {
  function contextoBaseRecuperacion() {
    return {
      ...crearContextoConversacion(),
      id: ID_RECUPERACION,
      productoId: 'productos/01-control-de-peso/tedivina',
      necesidadId: 'estrenimiento',
      recuperacionPendiente: true,
    };
  }

  test('rama "sin respuesta": termina la recuperación y conserva el resto del contexto', async () => {
    await guardarContexto(ID_RECUPERACION, contextoBaseRecuperacion());
    const { contexto, resultado } = await procesarRespuestaRecuperacionPersistente(ID_RECUPERACION, null);

    assert.equal(resultado.tipo, 'sin_respuesta');
    assert.equal(contexto.estado, 'RecuperacionFinalizada');
    assert.equal(contexto.ramaRecuperacionEjecutada, 'sin_respuesta');
    assert.equal(contexto.recuperacionPendiente, false);
    assert.equal(contexto.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(contexto.necesidadId, 'estrenimiento');
    assert.ok(contexto.ultimaInteraccion);
  });

  test('rama "lo voy a pensar": termina la recuperación', async () => {
    await guardarContexto(ID_RECUPERACION, contextoBaseRecuperacion());
    const { contexto, resultado } = await procesarRespuestaRecuperacionPersistente(ID_RECUPERACION, 'Lo voy a pensar.');

    assert.equal(resultado.tipo, 'lo_voy_a_pensar');
    assert.equal(resultado.mensajeRespuesta.length > 0, true);
    assert.equal(contexto.ramaRecuperacionEjecutada, 'lo_voy_a_pensar');
    assert.equal(contexto.recuperacionPendiente, false);
  });

  test('rama duda/objeción: NO termina la recuperación, queda esperando, sin handoff', async () => {
    await guardarContexto(ID_RECUPERACION, contextoBaseRecuperacion());
    const { contexto, resultado } = await procesarRespuestaRecuperacionPersistente(ID_RECUPERACION, 'Está caro.');

    assert.equal(resultado.tipo, 'duda_documentada');
    assert.equal(resultado.objecionId, 'esta_caro');
    assert.equal(contexto.ramaRecuperacionEjecutada, 'duda_documentada');
    // A diferencia de las otras ramas, esta NO cierra la recuperación.
    assert.equal(contexto.recuperacionPendiente, true);
    assert.equal(contexto.handoffPendiente, false);
  });

  test('rama intención de compra: termina la recuperación, marca intención, sin inventar pago', async () => {
    await guardarContexto(ID_RECUPERACION, contextoBaseRecuperacion());
    const { contexto, resultado } = await procesarRespuestaRecuperacionPersistente(ID_RECUPERACION, 'Sí, quiero comprarlo.');

    assert.equal(resultado.tipo, 'intencion_compra');
    assert.equal(contexto.estado, 'ProductoPaqueteDefinido');
    assert.equal(contexto.ramaRecuperacionEjecutada, 'intencion_compra');
    assert.equal(contexto.recuperacionPendiente, false);
    assert.equal(contexto.intencionCompra, true);
    // El producto identificado antes de la recuperación se conserva.
    assert.equal(contexto.productoId, 'productos/01-control-de-peso/tedivina');
  });

  test('duda no autorizada durante recuperación: handoff, y ese handoff también cierra la recuperación pendiente', async () => {
    await guardarContexto(ID_RECUPERACION, contextoBaseRecuperacion());
    const { contexto, resultado } = await procesarRespuestaRecuperacionPersistente(ID_RECUPERACION, '¿Tienen tienda física en Guadalajara?');

    assert.equal(resultado.tipo, 'duda_no_autorizada');
    assert.equal(resultado.handoff.requiereHumano, true);
    assert.equal(contexto.handoffPendiente, true);
    assert.equal(contexto.recuperacionPendiente, false);
    assert.ok(contexto.motivoHandoff.length > 0);
  });
});

after(() => {
  const idsDePrueba = [
    'test-flujo-persistente-tedivina',
    'test-oferta-cierre-tedivina',
    'test-oferta-cierre-pendiente',
    'test-recuperacion-persistente',
    'test-flujo-persistente-precio-pendiente',
  ];
  for (const id of idsDePrueba) {
    const ruta = path.join(CONTEXTOS_ROOT, `${id}.json`);
    if (fs.existsSync(ruta)) fs.rmSync(ruta);
  }
});
