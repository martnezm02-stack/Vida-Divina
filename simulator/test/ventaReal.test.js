// ventaReal.test.js
// Pruebas automatizadas del flujo comercial real (Sprint 5), integrado en
// simulator/. Mismo patrón que decision-engine/test/decisionEngine.test.js:
// node:test + node:assert/strict, cero dependencias externas.
//
// Cubre los 7 casos pedidos explícitamente en la Fase 3 de implementación,
// verificando en cada uno que el flujo NUNCA fabrica un dato (precio,
// testimonio, oferta, respuesta rápida) — cuando el recurso real no
// existe, el resultado esperado es requiereHumano === true, no un valor
// inventado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCompiledKnowledge } from '../src/knowledgeLoader.js';
import {
  iniciarConversacion,
  clasificarPrimeraRespuesta,
  procesarFlujoConsumo,
  procesarNecesidadYPrecio,
  procesarOfertaYCierre,
  procesarRespuestaCliente,
  procesarRespuestaRecuperacion,
  evaluarRecuperacion,
  MENSAJE_INICIAL_OFICIAL,
} from '../src/flujoVentaReal.js';
import { obtenerPrecioProducto } from '../src/recursosComerciales.js';

const kb = loadCompiledKnowledge();

describe('Mensaje inicial oficial', () => {
  test('es exactamente el texto confirmado, sin variantes', () => {
    const inicio = iniciarConversacion();
    assert.equal(
      inicio.mensaje,
      'Hola gracias por ponerte en contacto con Vive Vida divina, Soy Manuel y es un gusto atenderte; me puedes indicar en que estas interesado?, en alguno de nuestros productos o en formar parte de nuestra red de distribuidores?'
    );
    assert.equal(inicio.mensaje, MENSAJE_INICIAL_OFICIAL);
  });
});

describe('Caso 1 — "Hola, quiero comprar Té Divina."', () => {
  const mensaje = 'Hola, quiero comprar Té Divina.';

  test('clasifica como consumo, no distribución', () => {
    const clasificacion = clasificarPrimeraRespuesta(mensaje);
    assert.equal(clasificacion.intencion, 'consumo');
  });

  test('identifica el producto y envía el audio de explicación', () => {
    const resultado = procesarFlujoConsumo(kb, mensaje);
    assert.equal(resultado.handoff, null);
    assert.equal(resultado.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(resultado.estado.id, 'AudioExplicacionEnviado');
    assert.ok(resultado.preguntaAudio.length > 0);
  });
});

describe('Caso 2 — "Me interesa para el estreñimiento." (producto fuera del catálogo del piloto)', () => {
  test('identifica la necesidad; el testimonio pendiente no bloquea, el precio pendiente sí', () => {
    const resultado = procesarNecesidadYPrecio('productos/01-control-de-peso/atom-capsules', 'Me interesa para el estreñimiento.');
    assert.equal(resultado.necesidadId, 'estrenimiento');
    // Atom Capsules no forma parte del catálogo de 8 productos con precio
    // real (Fase Pre-E2E, docs/proceso_de_venta/recursos/precios.md) —
    // sigue PENDIENTE, el flujo debe detenerse aquí, nunca inventar una cifra.
    assert.ok(resultado.handoff);
    assert.equal(resultado.handoff.requiereHumano, true);
    assert.equal(resultado.handoff.mensajeParaCliente, null);
    assert.match(resultado.handoff.fuente, /precios\.md$/);
  });
});

describe('Caso 2b — "Me interesa para el estreñimiento." con Té Divina (Fase Pre-E2E: precio real)', () => {
  test('el precio ya no bloquea: el flujo continúa sin handoff', () => {
    const resultado = procesarNecesidadYPrecio('productos/01-control-de-peso/tedivina', 'Me interesa para el estreñimiento.');
    assert.equal(resultado.necesidadId, 'estrenimiento');
    assert.equal(resultado.handoff, null);
    assert.equal(resultado.precio.disponible, true);
    assert.equal(resultado.precio.precio, 1600);
    assert.equal(resultado.precio.moneda, 'MXN');
    assert.equal(resultado.estado.id, 'PrecioEnviado');
  });
});

describe('Caso 3 — "Está caro."', () => {
  test('se trata como duda documentada, sin presionar por la compra', () => {
    const resultado = procesarRespuestaCliente('Está caro.');
    assert.equal(resultado.tipo, 'duda_documentada');
    assert.equal(resultado.objecionId, 'esta_caro');
    assert.equal(resultado.fuente, 'docs/objeciones/esta_caro.md');
    assert.ok(!('handoff' in resultado) || resultado.handoff == null);
  });
});

describe('Caso 4 — "Lo voy a pensar."', () => {
  test('en recuperación: ejecuta la respuesta definida y termina la recuperación', () => {
    const resultado = procesarRespuestaRecuperacion('Lo voy a pensar.');
    assert.equal(resultado.tipo, 'lo_voy_a_pensar');
    assert.equal(resultado.estado.id, 'RecuperacionFinalizada');
    assert.equal(
      resultado.mensajeRespuesta,
      'Esperamos que te animes a probar nuestro producto que estamos seguros mejoraran tu salud!'
    );
  });

  test('en el flujo principal (no recuperación): no termina la conversación, solo queda en espera', () => {
    const resultado = procesarRespuestaCliente('Lo voy a pensar.');
    assert.equal(resultado.tipo, 'lo_voy_a_pensar');
    assert.equal(resultado.estado.id, 'EsperandoDecision');
  });
});

describe('Caso 5 — "Quiero comprar 2 tratamientos."', () => {
  test('detecta intención de compra y cantidad, sin inventar el pago', () => {
    const resultado = procesarRespuestaCliente('Quiero comprar 2 tratamientos.');
    assert.equal(resultado.tipo, 'intencion_compra');
    assert.equal(resultado.cantidad, 2);
    assert.equal(resultado.estado.id, 'ProductoPaqueteDefinido');
    // Confirma que, en efecto, no hay precio real con el que calcular un total.
    const precio = obtenerPrecioProducto('productos/01-control-de-peso/atom-capsules');
    assert.equal(precio.disponible, false);
  });
});

describe('Caso 6 — cliente recontacta antes de los 5 días de recuperación', () => {
  test('cancela la recuperación automática', () => {
    const resultado = evaluarRecuperacion({
      ultimaInteraccion: '2026-08-01T00:00:00Z',
      fechaActual: '2026-08-03T00:00:00Z',
      clienteRecontacto: true,
    });
    assert.equal(resultado.activar, false);
    assert.equal(resultado.estado.id, 'RecuperacionCancelada');
  });

  test('sin recontacto, antes del día 5 tampoco activa; al día 5 sí activa', () => {
    const antes = evaluarRecuperacion({ ultimaInteraccion: '2026-08-01T00:00:00Z', fechaActual: '2026-08-03T00:00:00Z', clienteRecontacto: false });
    assert.equal(antes.activar, false);

    const dia5 = evaluarRecuperacion({ ultimaInteraccion: '2026-08-01T00:00:00Z', fechaActual: '2026-08-06T00:00:00Z', clienteRecontacto: false });
    assert.equal(dia5.activar, true);
    assert.equal(dia5.estado.id, 'MensajeRecuperacionEnviado');
  });
});

describe('Caso 7 — pregunta fuera del conocimiento autorizado', () => {
  test('activa human handoff, sin improvisar y sin mensaje automático al cliente', () => {
    const resultado = procesarRespuestaCliente('¿Tienen tienda física en Guadalajara?');
    assert.equal(resultado.tipo, 'duda_no_autorizada');
    assert.equal(resultado.estado.id, 'EscaladoHumano');
    assert.equal(resultado.handoff.requiereHumano, true);
    assert.equal(resultado.handoff.mensajeParaCliente, null);
  });

  test('una señal médica se prioriza y no cae en handoff genérico, sino en la respuesta de seguridad ya existente', () => {
    const resultado = procesarRespuestaCliente('Tengo diabetes, ¿puedo tomarlo?');
    assert.equal(resultado.tipo, 'senal_medica');
    assert.ok(resultado.respuesta.borrador.length > 0);
  });
});

describe('Consistencia general — nunca se fabrica un recurso pendiente', () => {
  const CATALOGO_8 = [
    ['productos/01-control-de-peso/tedivina', 1600],
    ['productos/02-cafe-divina/black', 750],
    ['productos/01-control-de-peso/sculpt-max', 1750],
    ['productos/02-cafe-divina/sculpt-black', 1600],
    ['productos/07-rendimiento-fisico/ripped-capsules', 1600],
    ['productos/03-longevidad-bienestar/reishi-capsules', 1600],
    ['productos/08-intimidad-libido/mars-capsules', 1600],
    ['productos/02-cafe-divina/tongkat-ali-cafe', 750],
  ];

  test('los 8 productos del catálogo del piloto devuelven su precio real, sin importar su categoría estructural', () => {
    for (const [productoId, precioEsperado] of CATALOGO_8) {
      const precio = obtenerPrecioProducto(productoId);
      assert.equal(precio.disponible, true, `Se esperaba precio disponible para ${productoId}`);
      assert.equal(precio.precio, precioEsperado, `Precio incorrecto para ${productoId}`);
      assert.equal(precio.moneda, 'MXN');
    }
  });

  test('cualquier producto fuera del catálogo del piloto sigue PENDIENTE, nunca inventado', () => {
    const idsCatalogo = new Set(CATALOGO_8.map(([id]) => id));
    for (const producto of kb.entitiesByType.producto ?? []) {
      if (idsCatalogo.has(producto.id)) continue;
      const precio = obtenerPrecioProducto(producto.id);
      assert.equal(precio.disponible, false, `Se esperaba PENDIENTE para ${producto.id}`);
    }
  });
});

describe('Té Divina — flujo completo ahora alcanzable de punta a punta (Fase Pre-E2E)', () => {
  test('audio → necesidad/precio → oferta/cierre, sin ningún handoff', () => {
    const productoId = 'productos/01-control-de-peso/tedivina';
    const consumo = procesarFlujoConsumo(kb, 'Quiero comprar Té Divina');
    assert.equal(consumo.handoff, null);
    assert.equal(consumo.productoId, productoId);

    const necesidadPrecio = procesarNecesidadYPrecio(productoId, 'Me interesa para el estreñimiento.');
    assert.equal(necesidadPrecio.handoff, null);
    assert.equal(necesidadPrecio.precio.disponible, true);

    const ofertaCierre = procesarOfertaYCierre(productoId);
    assert.equal(ofertaCierre.handoff, null);
    assert.equal(ofertaCierre.oferta.disponible, true);
    assert.equal(ofertaCierre.cierre.tipo, 'audio');
    assert.equal(ofertaCierre.estado.id, 'CierreEnviado');
  });
});
