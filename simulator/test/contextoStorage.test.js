// contextoStorage.test.js
// Pruebas de persistencia real (Fase 3.2, migrado a PostgreSQL en Fase
// C.2B). node:test + node:assert/strict.
//
// Nota sobre "persistencia entre ejecuciones": contextoStorage.js no
// mantiene ningún caché en memoria — recuperarContexto() siempre lee de
// PostgreSQL. Simular dos "ejecuciones" como dos bloques test() separados
// (en vez de dos procesos de Node distintos) prueba exactamente lo mismo
// que ejecutar el proceso dos veces: el dato solo puede sobrevivir si
// está en la base, no en una variable de JavaScript.
//
// Fase C.2B: contextoStorage.js pasó de síncrono (JSON/filesystem) a
// asíncrono (PostgreSQL vía crm/) — ver docs/CRM_FASE_C2_ASYNC_MIGRATION.md.
// Este archivo se adaptó agregando async/await; ninguna aserción de
// negocio cambió.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  guardarContexto,
  recuperarContexto,
  actualizarContexto,
  existeContexto,
  CONTEXTOS_ROOT,
} from '../src/contextoStorage.js';
import { crearContextoConversacion, requiereHandoffHumano } from '../src/flujoVentaReal.js';
// Reutiliza la infraestructura de test ya validada de crm/ — no importa
// `pg` aquí (ese import vive dentro de crm/test/helpers/db.js, que a su
// vez vive dentro de crm/, así que "pg fuera de crm/" sigue siendo 0).
// Necesario porque, a diferencia del backend JSON anterior (limpiado con
// fs.rmSync), contextoStorage.js ahora escribe en PostgreSQL real — sin
// esto, dos corridas seguidas de este archivo dejan residuos de la
// corrida anterior y algunas aserciones ("no existe todavía") fallan.
import { getTestPool, resetDatabase, closeTestPool } from '../../crm/test/helpers/db.js';
// contextoStorage.js usa internamente el pool de crm/index.js (ligado a
// DATABASE_URL) — una instancia de pg.Pool DISTINTA del pool de test de
// arriba (ligado a TEST_DATABASE_URL), aunque en esta corrida ambas
// variables apunten a la misma base. Cerrar solo una de las dos deja
// conexiones inactivas abiertas y el proceso de node --test nunca termina.
import { closePool as closeCrmPool } from '../../crm/index.js';

before(async () => {
  const pool = await getTestPool();
  await resetDatabase(pool);
});

after(async () => {
  await closeCrmPool();
  await closeTestPool();
});

const ID_PRUEBA = 'test-persistencia-fase-3-2';
const ID_ACTUALIZACION = 'test-actualizacion-parcial';
const ID_HANDOFF = 'test-handoff-conserva-contexto';
const ID_INEXISTENTE = 'test-id-que-nunca-se-crea';
const IDS_DE_PRUEBA = [ID_PRUEBA, ID_ACTUALIZACION, ID_HANDOFF, ID_INEXISTENTE];

function limpiarArchivosDePrueba() {
  for (const id of IDS_DE_PRUEBA) {
    const nombre = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') + '.json';
    const ruta = path.join(CONTEXTOS_ROOT, nombre);
    if (fs.existsSync(ruta)) fs.rmSync(ruta);
  }
}

// NOTA — Fase C.2B: el describe "Directorio inexistente" original (Fase
// 3.2) verificaba que guardarContexto() creaba data/conversaciones/ en
// disco la primera vez que se usaba — una comprobación específica del
// mecanismo JSON, que ya no aplica (guardarContexto ya no toca el
// filesystem, ver contextoStorage.js). Se documenta aquí en vez de
// borrarse en silencio: la intención real que protegía ese test —
// "la primera escritura para un id completamente nuevo funciona, sin
// estado previo" — se conserva abajo, verificada contra el contrato
// público (existeContexto), no contra un detalle de implementación de
// JSON. Razón arquitectónica documentada también en
// docs/CRM_FASE_C2_ASYNC_MIGRATION.md.
describe('Primera escritura para un id completamente nuevo', () => {
  const idNuevo = `test-primera-escritura-id-nuevo-${Date.now()}`;

  after(() => {
    const ruta = path.join(CONTEXTOS_ROOT, `${idNuevo}.json`);
    if (fs.existsSync(ruta)) fs.rmSync(ruta);
  });

  test('guardarContexto funciona para un id que nunca existió, sin estado previo', async () => {
    assert.equal(await existeContexto(idNuevo), false);
    await guardarContexto(idNuevo, { ...crearContextoConversacion(), id: idNuevo, estado: 'MensajeInicialEnviado' });
    assert.equal(await existeContexto(idNuevo), true);
    const recuperado = await recuperarContexto(idNuevo);
    assert.equal(recuperado.estado, 'MensajeInicialEnviado');
  });
});

describe('Contexto inexistente', () => {
  test('recuperarContexto devuelve null, nunca un objeto inventado', async () => {
    assert.equal(await existeContexto(ID_INEXISTENTE), false);
    assert.equal(await recuperarContexto(ID_INEXISTENTE), null);
  });
});

describe('Guardar y recuperar contexto', () => {
  // Fase C.2B — hallazgo real: `conversations.ultima_interaccion` es
  // NOT NULL DEFAULT now() en PostgreSQL (Fase B). El backend JSON
  // anterior preservaba `null` verbatim si nunca se había fijado; el
  // backend de PostgreSQL no puede representar esa ausencia — siempre
  // queda un timestamp real tras cualquier escritura. Se compara el resto
  // del contexto campo por campo (deepEqual) y `ultimaInteraccion` aparte,
  // verificando que es una fecha real en vez de exigir `null`.
  test('el contexto recuperado es igual al guardado (salvo ultimaInteraccion, que PostgreSQL siempre estampa)', async () => {
    const contexto = { ...crearContextoConversacion(), id: ID_PRUEBA, productoId: 'productos/01-control-de-peso/tedivina', estado: 'AudioExplicacionEnviado' };
    await guardarContexto(ID_PRUEBA, contexto);
    const recuperado = await recuperarContexto(ID_PRUEBA);

    assert.ok(recuperado.ultimaInteraccion, 'ultimaInteraccion siempre queda con un valor real tras guardarContexto');
    assert.ok(!Number.isNaN(new Date(recuperado.ultimaInteraccion).getTime()), 'debe ser una fecha ISO válida');
    assert.deepEqual({ ...recuperado, ultimaInteraccion: null }, contexto);
  });
});

describe('Persistencia entre ejecuciones', () => {
  test('"ejecución 1": crea y guarda un contexto con estado inicial', async () => {
    const contexto = { ...crearContextoConversacion(), id: ID_PRUEBA, productoId: 'productos/01-control-de-peso/tedivina', estado: 'ProductoIdentificado' };
    await guardarContexto(ID_PRUEBA, contexto);
  });

  test('"ejecución 2" (bloque de prueba independiente, lee de nuevo): recupera el mismo estado', async () => {
    const recuperado = await recuperarContexto(ID_PRUEBA);
    assert.ok(recuperado);
    assert.equal(recuperado.id, ID_PRUEBA);
    assert.equal(recuperado.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(recuperado.estado, 'ProductoIdentificado');
  });
});

describe('Actualización parcial (no debe perder datos previos)', () => {
  test('agregar necesidadId conserva productoId ya guardado', async () => {
    await guardarContexto(ID_ACTUALIZACION, { ...crearContextoConversacion(), id: ID_ACTUALIZACION, productoId: 'productos/01-control-de-peso/tedivina' });

    await actualizarContexto(ID_ACTUALIZACION, { necesidadId: 'estrenimiento' }, crearContextoConversacion);

    const final = await recuperarContexto(ID_ACTUALIZACION);
    assert.equal(final.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(final.necesidadId, 'estrenimiento');
  });

  test('actualizarContexto sobre un id sin contexto previo lo crea usando la fábrica provista', async () => {
    const idNuevo = 'test-actualizacion-sin-previo';
    try {
      const resultado = await actualizarContexto(idNuevo, { productoId: 'x' }, crearContextoConversacion);
      assert.equal(resultado.productoId, 'x');
      assert.equal(resultado.necesidadId, null); // resto de campos vienen de crearContextoConversacion()
    } finally {
      const ruta = path.join(CONTEXTOS_ROOT, 'test-actualizacion-sin-previo.json');
      if (fs.existsSync(ruta)) fs.rmSync(ruta);
    }
  });
});

describe('Handoff conserva el contexto', () => {
  test('el contexto sigue disponible completo después de un handoff, con el motivo registrado', async () => {
    const contexto = {
      ...crearContextoConversacion(),
      id: ID_HANDOFF,
      productoId: 'productos/01-control-de-peso/tedivina',
      necesidadId: 'estrenimiento',
      estado: 'NecesidadIdentificada',
    };
    await guardarContexto(ID_HANDOFF, contexto);

    const handoff = requiereHandoffHumano('No existe recurso de precio disponible.', 'docs/proceso_de_venta/recursos/precios.md');
    await actualizarContexto(
      ID_HANDOFF,
      { handoffPendiente: true, motivoHandoff: handoff.motivo, fechaHandoff: '2026-08-08T00:00:00.000Z' },
      crearContextoConversacion
    );

    const recuperado = await recuperarContexto(ID_HANDOFF);
    // El handoff no destruye ni reinicia nada de lo anterior.
    assert.equal(recuperado.productoId, 'productos/01-control-de-peso/tedivina');
    assert.equal(recuperado.necesidadId, 'estrenimiento');
    assert.equal(recuperado.estado, 'NecesidadIdentificada');
    // Y sí quedó registrado el handoff.
    assert.equal(recuperado.handoffPendiente, true);
    assert.equal(recuperado.motivoHandoff, handoff.motivo);
    assert.ok(recuperado.fechaHandoff);
  });
});

describe('Datos consultables para un futuro scheduler (sin implementarlo)', () => {
  // Fase C.2B — hallazgo real, consecuencia de una decisión YA aprobada en
  // Fase C.1 (docs/CRM_FASE_C1_CONTEXT_PROJECTION.md §12): fechaEntrega no
  // tiene representación persistida — el grupo de postventa (día 3/semana)
  // no se mapea porque no existe código real que lo ejecute todavía (Fase
  // C.0 §3). Bajo JSON, fechaEntrega sobrevivía el round-trip aunque nadie
  // la usara; bajo PostgreSQL, se descarta por diseño (siempre vuelve
  // null). Este test se ajusta para verificar lo que sí persiste hoy —
  // recuperacionPendiente (grupo de recuperación, activo) — y documenta
  // explícitamente que fechaEntrega ya no es uno de esos datos.
  test('recuperacionPendiente queda persistido; fechaEntrega NO (grupo postventa sin código real, ver Fase C.1)', async () => {
    const contexto = {
      ...crearContextoConversacion(),
      id: ID_PRUEBA,
      estado: 'MensajeRecuperacionEnviado',
      fechaEntrega: '2026-08-01T00:00:00.000Z',
      resultadoSeguimientoDia3: null,
      recuperacionPendiente: true,
    };
    await guardarContexto(ID_PRUEBA, contexto);
    const recuperado = await recuperarContexto(ID_PRUEBA);

    assert.equal(recuperado.recuperacionPendiente, true);
    assert.equal(recuperado.fechaEntrega, null, 'fechaEntrega nunca se persiste hoy — decisión ya aprobada en Fase C.1');
  });
});

after(() => {
  limpiarArchivosDePrueba();
});
