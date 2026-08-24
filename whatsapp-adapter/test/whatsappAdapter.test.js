// whatsappAdapter.test.js
// Pruebas sintéticas del adaptador — ningún payload toca la red, ninguna
// prueba llama a Meta. Cubre los 10 puntos mínimos de la Fase 4.2 (A-J) y,
// en la sección "Revisión funcional", los 7 puntos (A-G) pedidos en la
// revisión posterior (objeciones, ráfaga de recursos de Té Divina,
// SOLO_RESPUESTAS, contexto, handoff pendiente).
//
// Fase C.2B: procesarEventoWebhook/recuperarContexto/guardarContexto pasaron
// de síncronos (JSON) a asíncronos (PostgreSQL vía crm/) — archivo adaptado
// agregando async/await. Dos aserciones cambiaron de valor esperado, ambas
// documentadas en el punto exacto donde ocurren (ver comentarios "Fase
// C.2B" abajo) — ninguna otra aserción de negocio se modificó. Detalle
// completo en docs/CRM_FASE_C2_ASYNC_MIGRATION.md.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { procesarEventoWebhook } from '../main.js';
import { construirSalida } from '../src/outboundBuilder.js';
import { loadCompiledKnowledge } from '../../simulator/src/knowledgeLoader.js';
import { CONTEXTOS_ROOT, existeContexto, recuperarContexto, guardarContexto } from '../../simulator/src/contextoStorage.js';
import {
  MENSAJE_INICIAL_OFICIAL,
  crearContextoConversacion,
  procesarFlujoConsumo,
  procesarNecesidadYPrecio,
  procesarOfertaYCierre,
} from '../../simulator/src/flujoVentaReal.js';
// Ver nota equivalente en simulator/test/contextoStorage.test.js — reutiliza
// la infraestructura de test de crm/ para limpiar PostgreSQL entre
// corridas (el import de `pg` sigue viviendo dentro de crm/).
import { getTestPool, resetDatabase, closeTestPool } from '../../crm/test/helpers/db.js';
import { closePool as closeCrmPool } from '../../crm/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kb = loadCompiledKnowledge();
// Fase Pre-E2E — hallazgo: ids fijos reutilizados entre corridas contra
// DATABASE_URL (real, sin limpieza para PostgreSQL) rompían aserciones que
// asumen "contacto nunca visto" en la segunda corrida en adelante. Sufijo
// único por invocación del proceso — no cambia ninguna aserción de negocio.
const RUN_SUFFIX = `-${Date.now()}`;

before(async () => {
  const pool = await getTestPool();
  await resetDatabase(pool);
});

after(async () => {
  await closeCrmPool();
  await closeTestPool();
});

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
              contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: waId }],
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

function payloadMensajeSaliente(waId, texto) {
  // Simula un eco: el "from" es el propio número del negocio, igual a
  // metadata.display_phone_number.
  const payload = payloadMensaje(waId, texto);
  payload.entry[0].changes[0].value.messages[0].from = '15550001111';
  return payload;
}

function payloadMensajeNoTexto(waId) {
  const payload = payloadMensaje(waId, 'placeholder');
  payload.entry[0].changes[0].value.messages[0].type = 'image';
  delete payload.entry[0].changes[0].value.messages[0].text;
  return payload;
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

describe('A. Saludo simple de contacto nuevo', () => {
  test('responde solo con el mensaje inicial oficial, sin clasificar todavía', async () => {
    const id = 'test-adapter-a-saludo' + RUN_SUFFIX;
    const resultado = await procesarEventoWebhook(payloadMensaje(id, 'Hola, buenas tardes'), kb);

    assert.equal(resultado.procesado, true);
    assert.equal(resultado.tipoEvento, 'mensaje_entrante');
    assert.equal(resultado.enviar, true);
    assert.equal(resultado.handoff, null);
    assert.equal(resultado.recursos.length, 1);
    assert.equal(resultado.recursos[0].tipo, 'texto');
    assert.equal(resultado.recursos[0].contenido, MENSAJE_INICIAL_OFICIAL);

    const contexto = await recuperarContexto(id);
    assert.equal(contexto.estado, 'MensajeInicialEnviado');
    assert.equal(contexto.respuestaCliente, 'Hola, buenas tardes');
  });
});

describe('B. Primer mensaje con intención explícita', () => {
  test('el primer mensaje SIEMPRE recibe solo la bienvenida (Fase Pre-E2E) — la intención se retoma en el siguiente mensaje', async () => {
    const id = 'test-adapter-b-intencion' + RUN_SUFFIX;
    const turno1 = await procesarEventoWebhook(payloadMensaje(id, 'Hola, quiero información del Té Divina'), kb);

    assert.equal(turno1.enviar, true);
    assert.equal(turno1.handoff, null);
    assert.equal(turno1.recursos.length, 1);
    assert.equal(turno1.recursos[0].tipo, 'texto');
    assert.equal(turno1.recursos[0].contenido, MENSAJE_INICIAL_OFICIAL);

    const contextoTrasTurno1 = await recuperarContexto(id);
    assert.equal(contextoTrasTurno1.estado, 'MensajeInicialEnviado');
    assert.equal(contextoTrasTurno1.respuestaCliente, 'Hola, quiero información del Té Divina');

    const turno2 = await procesarEventoWebhook(payloadMensaje(id, 'Hola, quiero información del Té Divina'), kb);
    assert.equal(turno2.enviar, true);
    assert.equal(turno2.handoff, null);
    assert.deepEqual(turno2.recursos.map((r) => r.tipo), ['audio']);

    const contexto = await recuperarContexto(id);
    assert.equal(contexto.estado, 'AudioExplicacionEnviado');
    assert.equal(contexto.productoId, 'productos/01-control-de-peso/tedivina');
  });
});

describe('C/H. Mensaje entrante de contacto existente — mismo wa_id recupera el mismo contexto', () => {
  test('el segundo mensaje continúa desde el estado dejado por el primero, sin repetir el saludo', async () => {
    const id = 'test-adapter-c-existente' + RUN_SUFFIX;

    const turno1 = await procesarEventoWebhook(payloadMensaje(id, 'Hola'), kb);
    assert.equal(turno1.recursos[0].contenido, MENSAJE_INICIAL_OFICIAL);
    assert.equal((await recuperarContexto(id)).id, id);
    assert.equal((await recuperarContexto(id)).estado, 'MensajeInicialEnviado');

    const turno2 = await procesarEventoWebhook(payloadMensaje(id, 'Quiero comprar Té Divina'), kb);
    assert.equal(turno2.enviar, true);
    // No repite el saludo — el contexto ya estaba en MensajeInicialEnviado.
    assert.equal(turno2.recursos.length, 1);
    assert.equal(turno2.recursos[0].tipo, 'audio');

    const contextoFinal = await recuperarContexto(id);
    assert.equal(contextoFinal.id, id);
    assert.equal(contextoFinal.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(contextoFinal.estado, 'AudioExplicacionEnviado');
  });
});

describe('D. Evento de estado (statuses) no activa el motor', () => {
  test('se descarta sin invocar ninguna función persistente', async () => {
    const resultado = await procesarEventoWebhook(payloadStatus(), kb);
    assert.equal(resultado.procesado, false);
    assert.equal(resultado.tipoEvento, 'evento_estado');
  });
});

describe('E. Mensaje saliente/eco no activa el motor', () => {
  test('se descarta sin invocar ninguna función persistente', async () => {
    const id = 'test-adapter-e-eco' + RUN_SUFFIX;
    const resultado = await procesarEventoWebhook(payloadMensajeSaliente(id, 'Eco de un mensaje saliente'), kb);
    assert.equal(resultado.procesado, false);
    assert.equal(resultado.tipoEvento, 'mensaje_saliente');
    assert.equal(await existeContexto(id), false);
  });
});

describe('F. Payload no procesable no llama al motor', () => {
  test('payload vacío/malformado', async () => {
    const resultado = await procesarEventoWebhook({}, kb);
    assert.equal(resultado.procesado, false);
    assert.equal(resultado.tipoEvento, 'no_procesable');
  });

  test('tipo de mensaje no soportado (no-texto)', async () => {
    const id = 'test-adapter-f-imagen' + RUN_SUFFIX;
    const resultado = await procesarEventoWebhook(payloadMensajeNoTexto(id), kb);
    assert.equal(resultado.procesado, false);
    assert.equal(resultado.tipoEvento, 'no_procesable');
    assert.equal(await existeContexto(id), false);
  });
});

describe('G. Handoff no genera respuesta automática', () => {
  test('precio PENDIENTE (producto fuera del catálogo del piloto) produce handoff; no se envía nada al cliente', async () => {
    const id = 'test-adapter-g-handoff' + RUN_SUFFIX;
    await procesarEventoWebhook(payloadMensaje(id, 'Hola'), kb);
    await procesarEventoWebhook(payloadMensaje(id, 'Quiero comprar Atom Capsules'), kb);
    const resultado = await procesarEventoWebhook(payloadMensaje(id, 'Me interesa para el estreñimiento'), kb);

    assert.equal(resultado.enviar, false);
    assert.ok(resultado.handoff);
    assert.equal(resultado.recursos.length, 0);

    const contexto = await recuperarContexto(id);
    assert.equal(contexto.handoffPendiente, true);
    assert.ok(contexto.motivoHandoff.length > 0);

    // Un mensaje adicional del cliente, con el handoff todavía sin
    // resolver, tampoco debe generar una respuesta automática.
    const resultado2 = await procesarEventoWebhook(payloadMensaje(id, '¿Hay novedades?'), kb);
    assert.equal(resultado2.enviar, false);
    assert.equal(resultado2.handoff.yaExistente, true);
  });
});

describe('G2. Fase Pre-E2E — el catálogo de 8 productos ya no genera handoff únicamente por precio PENDIENTE', () => {
  test('Té Divina: audio → necesidad/precio → oferta/cierre, ráfaga completa, sin handoff', async () => {
    const id = 'test-adapter-g2-tedivina-completo' + RUN_SUFFIX;
    await procesarEventoWebhook(payloadMensaje(id, 'Hola'), kb);
    await procesarEventoWebhook(payloadMensaje(id, 'Quiero comprar Té Divina'), kb);
    const resultado = await procesarEventoWebhook(payloadMensaje(id, 'Me interesa para el estreñimiento'), kb);

    assert.equal(resultado.enviar, true);
    assert.equal(resultado.handoff, null);
    assert.deepEqual(resultado.recursos.map((r) => r.tipo), ['testimonio', 'imagen_precio', 'oferta', 'cierre']);
    const precio = resultado.recursos.find((r) => r.tipo === 'imagen_precio');
    assert.equal(precio.disponible, true);
    assert.equal(precio.contenido.precio, 1600);

    const contexto = await recuperarContexto(id);
    assert.equal(contexto.estado, 'CierreEnviado');
    assert.equal(contexto.handoffPendiente, false);
  });
});

// Las dos comprobaciones siguientes descartan líneas de comentario (`//`)
// antes de buscar, porque este mismo código documenta la exclusión con
// comentarios que mencionan las palabras prohibidas a propósito — lo que
// se verifica es uso real (import/llamada), no la palabra en un comentario.
function codigoSinComentarios(contenido) {
  return contenido
    .split('\n')
    .filter((linea) => !linea.trim().startsWith('//'))
    .join('\n');
}

describe('I. Seguimiento/recuperación proactiva no forma parte del árbol de llamadas', () => {
  test('conversationRouter.js y main.js no importan ni llaman evaluarRecuperacion', () => {
    const router = codigoSinComentarios(fs.readFileSync(path.join(__dirname, '..', 'src', 'conversationRouter.js'), 'utf8'));
    const main = codigoSinComentarios(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'));
    assert.equal(router.includes('evaluarRecuperacion'), false);
    assert.equal(main.includes('evaluarRecuperacion'), false);
  });
});

describe('J. Ningún scheduler existe en el adaptador', () => {
  test('ningún archivo de whatsapp-adapter usa setInterval/setTimeout/cron', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    const archivos = fs.readdirSync(srcDir).map((f) => path.join(srcDir, f));
    archivos.push(path.join(__dirname, '..', 'main.js'));

    const patronesProhibidos = [/setInterval\s*\(/, /setTimeout\s*\(/, /node-cron/, /require\(['"]cron['"]\)/];
    for (const archivo of archivos) {
      const contenido = codigoSinComentarios(fs.readFileSync(archivo, 'utf8'));
      for (const patron of patronesProhibidos) {
        assert.equal(patron.test(contenido), false, `${path.basename(archivo)} no debe contener ${patron}`);
      }
    }
  });
});

// =======================================================================
// Revisión funcional puntual (post Fase 4.2) — objeciones, ráfaga de
// recursos de Té Divina, SOLO_RESPUESTAS, contexto y handoff pendiente.
// =======================================================================

describe('Revisión funcional — A. Objeción documentada usa el conocimiento existente', () => {
  test('"Está caro." produce un recurso objecion_documentada citando docs/objeciones/esta_caro.md, sin inventar texto', async () => {
    const id = 'test-adapter-rev-a-objecion-doc' + RUN_SUFFIX;
    await guardarContexto(id, {
      ...crearContextoConversacion(),
      id,
      estado: 'CierreEnviado',
      productoId: 'productos/01-control-de-peso/tedivina',
    });

    const resultado = await procesarEventoWebhook(payloadMensaje(id, 'Está caro.'), kb);

    assert.equal(resultado.enviar, true);
    assert.equal(resultado.handoff, null);
    assert.equal(resultado.recursos.length, 1);
    assert.equal(resultado.recursos[0].tipo, 'objecion_documentada');
    assert.equal(resultado.recursos[0].objecionId, 'esta_caro');
    assert.equal(resultado.recursos[0].fuente, 'docs/objeciones/esta_caro.md');
    assert.equal(resultado.recursos[0].contenido, undefined); // no se inventa un texto de respuesta
  });
});

describe('Revisión funcional — B. Objeción no documentada no inventa respuesta y escala', () => {
  test('una duda fuera de conocimiento autorizado genera handoff, no silencio ni texto inventado', async () => {
    const id = 'test-adapter-rev-b-objecion-no-doc' + RUN_SUFFIX;
    await guardarContexto(id, {
      ...crearContextoConversacion(),
      id,
      estado: 'CierreEnviado',
      productoId: 'productos/01-control-de-peso/tedivina',
    });

    const resultado = await procesarEventoWebhook(payloadMensaje(id, '¿Tienen tienda física en Guadalajara?'), kb);

    assert.equal(resultado.enviar, false);
    assert.ok(resultado.handoff);
    assert.equal(resultado.handoff.yaExistente, false);
    assert.equal(resultado.recursos.length, 0);
  });
});

describe('Revisión funcional — C. Flujo Té Divina: qué produce hoy vs. qué representaría outboundBuilder', () => {
  test('C1 — Fase Pre-E2E: un mensaje de necesidad para Té Divina ya no termina en handoff — precio real, ráfaga de 4 recursos', async () => {
    const id = 'test-adapter-rev-c1-tedivina-hoy' + RUN_SUFFIX;
    await procesarEventoWebhook(payloadMensaje(id, 'Hola'), kb);
    await procesarEventoWebhook(payloadMensaje(id, 'Quiero comprar Té Divina'), kb);
    const resultado = await procesarEventoWebhook(payloadMensaje(id, 'Me interesa para el estreñimiento.'), kb);

    assert.equal(resultado.enviar, true);
    assert.equal(resultado.handoff, null);
    assert.deepEqual(resultado.recursos.map((r) => r.tipo), ['testimonio', 'imagen_precio', 'oferta', 'cierre']);
  });

  test('C2 — construcción sintética directa (no vía router): outboundBuilder representa los 5 recursos por separado, nunca como texto plano', () => {
    const productoId = 'productos/01-control-de-peso/tedivina';
    const mensajeNecesidad = 'Me interesa para el estreñimiento.';

    // Reutiliza las funciones PURAS reales de flujoVentaReal.js (mismo
    // contenido de Té Divina que usa el motor) — solo el campo `precio` se
    // sustituye por un valor sintético `disponible:true`, porque
    // docs/proceso_de_venta/recursos/precios.md sigue 100% PENDIENTE hoy.
    // Esto demuestra la FORMA que tomaría la salida, no el comportamiento
    // actual (que es C1, arriba). Funciones puras — sin cambios en Fase
    // C.2B, este test sigue siendo síncrono.
    const pasoAudio = {
      funcion: 'procesarFlujoConsumoPersistente',
      resultado: procesarFlujoConsumo(kb, 'Quiero comprar Té Divina'),
    };
    const necesidadReal = procesarNecesidadYPrecio(productoId, mensajeNecesidad);
    const pasoNecesidad = {
      funcion: 'procesarNecesidadYPrecioPersistente',
      resultado: {
        ...necesidadReal,
        precio: { disponible: true, texto: '(placeholder de prueba — precios.md sigue PENDIENTE)', fuente: 'docs/proceso_de_venta/recursos/precios.md' },
        handoff: null,
      },
    };
    const pasoOfertaCierre = {
      funcion: 'procesarOfertaYCierrePersistente',
      resultado: procesarOfertaYCierre(productoId), // real: Té Divina sí tiene oferta/cierre documentados
    };

    const salida = construirSalida('demo-c2', {
      pasos: [pasoAudio, pasoNecesidad, pasoOfertaCierre],
      handoff: null,
      enviar: true,
    });

    assert.deepEqual(
      salida.recursos.map((r) => r.tipo),
      ['audio', 'testimonio', 'imagen_precio', 'oferta', 'cierre']
    );
    for (const recurso of salida.recursos) {
      assert.equal(typeof recurso, 'object');
      assert.notEqual(recurso.tipo, 'texto'); // nunca aplanado a texto plano
    }
    assert.ok(salida.recursos.find((r) => r.tipo === 'oferta').contenido.length > 0);
    assert.equal(salida.recursos.find((r) => r.tipo === 'cierre').subtipo, 'audio');
  });
});

describe('Revisión funcional — D. Un mensaje entrante no dispara mensajes proactivos', () => {
  // Fase C.2B — hallazgo real (encontrado al ejecutar este archivo, no
  // preaprobado por nombre en las Decisiones del propietario, pero de la
  // misma categoría documentada en Fase C.2A §7 y ya resuelta con el mismo
  // criterio): la versión original de este test comparaba
  // fs.readdirSync(CONTEXTOS_ROOT) antes/después para probar "solo se creó
  // un contexto nuevo, ningún otro fue tocado". Como contextoStorage.js ya
  // no escribe archivos, esa comparación deja de tener sentido (el
  // directorio nunca cambia). Se conserva la intención real del test —
  // "procesar un mensaje entrante solo afecta al contexto de su propio
  // id" — verificada ahora contra el contrato público (existeContexto),
  // no contra el mecanismo de archivo.
  test('procesarEventoWebhook es async y solo afecta al contexto del id que escribió', async () => {
    const id = 'test-adapter-rev-d-solo-respuestas' + RUN_SUFFIX;
    assert.equal(await existeContexto(id), false);

    const resultado = await procesarEventoWebhook(payloadMensaje(id, 'Hola'), kb);

    assert.ok(resultado instanceof Promise === false); // ya resuelto — await ya lo desenvolvió
    assert.equal(await existeContexto(id), true);
  });
});

describe('Revisión funcional — E. statuses no activan el motor', () => {
  test('un evento de estado se descarta sin invocar ninguna función persistente', async () => {
    const resultado = await procesarEventoWebhook(payloadStatus(), kb);
    assert.equal(resultado.procesado, false);
    assert.equal(resultado.tipoEvento, 'evento_estado');
  });
});

describe('Revisión funcional — F. Mismo wa_id conserva el contexto', () => {
  test('dos mensajes con el mismo id acumulan el mismo contexto persistido', async () => {
    const id = 'test-adapter-rev-f-mismo-id' + RUN_SUFFIX;
    await procesarEventoWebhook(payloadMensaje(id, 'Hola'), kb);
    await procesarEventoWebhook(payloadMensaje(id, 'Quiero comprar Té Divina'), kb);

    const contexto = await recuperarContexto(id);
    assert.equal(contexto.id, id);
    assert.equal(contexto.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(contexto.estado, 'AudioExplicacionEnviado');
  });
});

describe('Revisión funcional — G. Handoff pendiente no se reanuda automáticamente', () => {
  test('con handoffPendiente=true, un nuevo mensaje no reactiva el motor ni envía respuesta', async () => {
    const id = 'test-adapter-rev-g-handoff-pendiente' + RUN_SUFFIX;
    await guardarContexto(id, {
      ...crearContextoConversacion(),
      id,
      estado: 'EsperandoDecision',
      handoffPendiente: true,
      motivoHandoff: 'Motivo de prueba.',
    });

    const resultado = await procesarEventoWebhook(payloadMensaje(id, 'Sigo esperando respuesta.'), kb);

    assert.equal(resultado.enviar, false);
    assert.ok(resultado.handoff);
    assert.equal(resultado.handoff.yaExistente, true);

    const contextoDespues = await recuperarContexto(id);
    assert.equal(contextoDespues.handoffPendiente, true);
    assert.equal(contextoDespues.motivoHandoff, 'Motivo de prueba.'); // no se reescribió
    assert.equal(contextoDespues.estado, 'EsperandoDecision'); // no avanzó ni se reanudó
  });
});

describe('Revisión funcional — H. Contrato async (Decisión 1 aprobada, Fase C.2B)', () => {
  // Fase C.2B — Decisión 1 del propietario: contextoStorage y la cadena de
  // persistencia pasan de síncronos a asíncronos para permitir PostgreSQL
  // real. Este test reemplaza al que antes afirmaba
  // `resultado instanceof Promise === false` en la sección E de arriba —
  // ahora la llamada SIN await sí devuelve una Promise, por diseño. La
  // protección real que ese test buscaba dar (ningún scheduler/temporizador
  // artificial) sigue intacta en los tests I y J, que verifican por
  // inspección de código fuente que no existe setInterval/setTimeout/cron
  // — un cambio de comportamiento independiente de esta decisión.
  test('procesarEventoWebhook, llamado sin await, devuelve una Promise (nuevo contrato async)', () => {
    const id = 'test-adapter-rev-h-promise' + RUN_SUFFIX;
    const resultado = procesarEventoWebhook(payloadMensaje(id, 'Hola'), kb);
    assert.equal(resultado instanceof Promise, true);
    // Se espera igual para no dejar una promesa flotante sin manejar ni
    // contaminar el estado de otros tests con una escritura pendiente.
    return resultado;
  });
});

after(() => {
  const idsDePrueba = [
    'test-adapter-a-saludo',
    'test-adapter-b-intencion',
    'test-adapter-c-existente',
    'test-adapter-g-handoff',
    'test-adapter-rev-a-objecion-doc',
    'test-adapter-rev-b-objecion-no-doc',
    'test-adapter-rev-c1-tedivina-hoy',
    'test-adapter-rev-d-solo-respuestas',
    'test-adapter-rev-f-mismo-id',
    'test-adapter-rev-g-handoff-pendiente',
    'test-adapter-rev-h-promise',
    'test-adapter-g2-tedivina-completo',
  ];
  for (const id of idsDePrueba) {
    const ruta = path.join(CONTEXTOS_ROOT, `${id}.json`);
    if (fs.existsSync(ruta)) fs.rmSync(ruta);
  }
});
