// commerce.test.js
// Pruebas reales de integración del Núcleo Comercial (Fase 0006:
// orders -> payments -> SALE -> inventory) contra TEST_DATABASE_URL — sin
// mocks. Prueba la API PÚBLICA real (crm.createOrder / crm.confirmarVenta),
// no los repositories por separado (esos ya están cubiertos en
// repositories.test.js) — lo que hay que demostrar aquí es la
// orquestación atómica completa.

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { getTestPool, resetDatabase, closeTestPool } from './helpers/db.js';
import { getTestConfig } from '../config/env.js';

import * as customerRepository from '../repositories/customerRepository.js';
import * as inventoryRepository from '../repositories/inventoryRepository.js';
import * as inventoryMovementRepository from '../repositories/inventoryMovementRepository.js';
import * as orderRepository from '../repositories/orderRepository.js';
import * as paymentRepository from '../repositories/paymentRepository.js';

let pool;
let crm; // importado en before(), después de apuntar DATABASE_URL a la base de test

// createOrder/confirmarVenta usan internamente getPool() (DATABASE_URL) —
// se apunta DATABASE_URL a la misma base de TEST_DATABASE_URL, mismo
// criterio real ya usado en crm/test/contextProjection.test.js.
before(async () => {
  pool = await getTestPool();
  process.env.DATABASE_URL = getTestConfig().databaseUrl;
  crm = await import('../index.js');
});

beforeEach(async () => {
  await resetDatabase(pool);
});

after(async () => {
  await crm.closePool();
  await closeTestPool();
  delete process.env.DATABASE_URL;
});

const PRODUCTO_TE = 'productos/01-control-de-peso/tedivina';
const PRODUCTO_CAFE = 'productos/02-cafe-divina/cappuccino';

async function clienteDePrueba() {
  return customerRepository.createCustomer(pool, { nombre: null, email: null });
}

/** Siembra inventory Y su INITIAL_BALANCE correspondiente -- mismo patrón
 *  real usado en la carga inicial de producción (Fase 0005), para que
 *  sumCantidadByProductoId reconcilie de verdad contra cantidad_actual. */
async function seedInventory(productoId, cantidadActual, minimo) {
  await inventoryRepository.upsertInventory(pool, { productoId, cantidadActual, minimo });
  await inventoryMovementRepository.insertMovement(pool, {
    productoId,
    tipo: 'INITIAL_BALANCE',
    cantidad: cantidadActual,
    timestamp: '2026-09-14T00:00:00Z',
    motivo: 'Saldo inicial de prueba.',
  });
}

describe('crm.createOrder', () => {
  test('crea la orden en "pendiente" sin tocar inventario', async () => {
    await seedInventory(PRODUCTO_TE, 11, 6);
    const cliente = await clienteDePrueba();

    const { order } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [{ productoId: PRODUCTO_TE, cantidad: 2, precioUnitario: 1799 }],
    });

    assert.equal(order.estado, 'pendiente');
    assert.equal(Number(order.total), 3598);

    const inv = await inventoryRepository.findByProductoId(pool, PRODUCTO_TE);
    assert.equal(inv.cantidadActual, 11); // sin cambios -- pedido pendiente nunca descuenta
  });
});

describe('crm.confirmarVenta — flujo real', () => {
  test('venta confirmada: registra SALE, descuenta inventory y reconcilia', async () => {
    await seedInventory(PRODUCTO_TE, 11, 6);
    await seedInventory(PRODUCTO_CAFE, 5, 1);
    const cliente = await clienteDePrueba();

    const { order } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [
        { productoId: PRODUCTO_TE, cantidad: 2, precioUnitario: 1799 },
        { productoId: PRODUCTO_CAFE, cantidad: 1, precioUnitario: 899 },
      ],
    });
    const payment = await paymentRepository.insertPayment(pool, {
      orderId: order.orderId,
      metodo: 'transferencia',
      importe: Number(order.total),
      referencia: 'comprobante-001',
    });

    const resultado = await crm.confirmarVenta({ orderId: order.orderId, paymentId: payment.paymentId });

    assert.equal(resultado.order.estado, 'confirmado');
    assert.ok(resultado.order.confirmadoEn);
    assert.equal(resultado.payment.estado, 'confirmado');
    assert.equal(resultado.movements.length, 2);
    assert.equal(resultado.idempotentReplay, false);

    const invTe = await inventoryRepository.findByProductoId(pool, PRODUCTO_TE);
    const invCafe = await inventoryRepository.findByProductoId(pool, PRODUCTO_CAFE);
    assert.equal(invTe.cantidadActual, 9); // 11 - 2
    assert.equal(invCafe.cantidadActual, 4); // 5 - 1

    // Reconciliación real contra la bitácora de movimientos.
    assert.equal(await inventoryMovementRepository.sumCantidadByProductoId(pool, PRODUCTO_TE), 9);
    assert.equal(await inventoryMovementRepository.sumCantidadByProductoId(pool, PRODUCTO_CAFE), 4);
  });

  test('trazabilidad real: order -> movement -> producto/cantidad', async () => {
    await seedInventory(PRODUCTO_TE, 11, 6);
    const cliente = await clienteDePrueba();
    const { order } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [{ productoId: PRODUCTO_TE, cantidad: 3, precioUnitario: 1799 }],
    });
    const payment = await paymentRepository.insertPayment(pool, { orderId: order.orderId, metodo: 'efectivo', importe: 5397 });
    await crm.confirmarVenta({ orderId: order.orderId, paymentId: payment.paymentId });

    const movimientos = await inventoryMovementRepository.listByOrderId(pool, order.orderId);
    assert.equal(movimientos.length, 1);
    assert.equal(movimientos[0].tipo, 'SALE');
    assert.equal(movimientos[0].productoId, PRODUCTO_TE);
    assert.equal(movimientos[0].cantidad, -3);
    assert.equal(movimientos[0].orderId, order.orderId);
  });

  test('pedido NO confirmado: el inventario no cambia y no existe ningún SALE', async () => {
    await seedInventory(PRODUCTO_TE, 11, 6);
    const cliente = await clienteDePrueba();
    const { order } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [{ productoId: PRODUCTO_TE, cantidad: 2, precioUnitario: 1799 }],
    });
    await paymentRepository.insertPayment(pool, { orderId: order.orderId, metodo: 'transferencia', importe: 3598 });
    // Nunca se llama a confirmarVenta.

    const inv = await inventoryRepository.findByProductoId(pool, PRODUCTO_TE);
    assert.equal(inv.cantidadActual, 11);
    const movimientos = await inventoryMovementRepository.listByOrderId(pool, order.orderId);
    assert.equal(movimientos.length, 0);
  });

  test('stock insuficiente: rechaza completo, rollback real (orden, pago e inventario intactos)', async () => {
    await seedInventory(PRODUCTO_TE, 1, 1);
    const cliente = await clienteDePrueba();
    const { order } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [{ productoId: PRODUCTO_TE, cantidad: 5, precioUnitario: 1799 }], // pide más de lo que hay
    });
    const payment = await paymentRepository.insertPayment(pool, { orderId: order.orderId, metodo: 'efectivo', importe: 8995 });

    await assert.rejects(
      () => crm.confirmarVenta({ orderId: order.orderId, paymentId: payment.paymentId }),
      (error) => {
        assert.equal(error.name, 'InsufficientStockError');
        return true;
      }
    );

    // Rollback real y completo -- nada quedó a medio escribir.
    const ordenTrasFallo = await orderRepository.findById(pool, order.orderId);
    assert.equal(ordenTrasFallo.estado, 'pendiente');
    const pagoTrasFallo = await paymentRepository.findById(pool, payment.paymentId);
    assert.equal(pagoTrasFallo.estado, 'pendiente');
    const invTrasFallo = await inventoryRepository.findByProductoId(pool, PRODUCTO_TE);
    assert.equal(invTrasFallo.cantidadActual, 1);
    const movimientos = await inventoryMovementRepository.listByOrderId(pool, order.orderId);
    assert.equal(movimientos.length, 0);
  });

  test('stock insuficiente en UNA línea de una orden multi-producto revierte TODAS las líneas', async () => {
    await seedInventory(PRODUCTO_TE, 10, 1); // alcanza
    await seedInventory(PRODUCTO_CAFE, 1, 1); // NO alcanza
    const cliente = await clienteDePrueba();
    const { order } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [
        { productoId: PRODUCTO_TE, cantidad: 2, precioUnitario: 1799 },
        { productoId: PRODUCTO_CAFE, cantidad: 3, precioUnitario: 899 },
      ],
    });
    const payment = await paymentRepository.insertPayment(pool, { orderId: order.orderId, metodo: 'efectivo', importe: Number(order.total) });

    await assert.rejects(() => crm.confirmarVenta({ orderId: order.orderId, paymentId: payment.paymentId }));

    // El producto que SÍ alcanzaba tampoco debe haberse descontado.
    const invTe = await inventoryRepository.findByProductoId(pool, PRODUCTO_TE);
    assert.equal(invTe.cantidadActual, 10);
    const invCafe = await inventoryRepository.findByProductoId(pool, PRODUCTO_CAFE);
    assert.equal(invCafe.cantidadActual, 1);
  });

  test('idempotencia: confirmar la misma orden dos veces no descuenta inventario dos veces', async () => {
    await seedInventory(PRODUCTO_TE, 11, 6);
    const cliente = await clienteDePrueba();
    const { order } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [{ productoId: PRODUCTO_TE, cantidad: 2, precioUnitario: 1799 }],
    });
    const payment = await paymentRepository.insertPayment(pool, { orderId: order.orderId, metodo: 'efectivo', importe: 3598 });

    const primera = await crm.confirmarVenta({ orderId: order.orderId, paymentId: payment.paymentId });
    assert.equal(primera.idempotentReplay, false);

    const segunda = await crm.confirmarVenta({ orderId: order.orderId, paymentId: payment.paymentId });
    assert.equal(segunda.idempotentReplay, true);
    assert.equal(segunda.order.estado, 'confirmado');

    const inv = await inventoryRepository.findByProductoId(pool, PRODUCTO_TE);
    assert.equal(inv.cantidadActual, 9); // 11 - 2, UNA sola vez

    const movimientos = await inventoryMovementRepository.listByOrderId(pool, order.orderId);
    assert.equal(movimientos.length, 1); // ni un SALE duplicado

    assert.equal(await inventoryMovementRepository.sumCantidadByProductoId(pool, PRODUCTO_TE), 9);
  });

  test('índice único real: un intento de insertar un segundo SALE del mismo producto/orden es rechazado por PostgreSQL', async () => {
    await seedInventory(PRODUCTO_TE, 11, 6);
    const cliente = await clienteDePrueba();
    const { order } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [{ productoId: PRODUCTO_TE, cantidad: 2, precioUnitario: 1799 }],
    });
    const payment = await paymentRepository.insertPayment(pool, { orderId: order.orderId, metodo: 'efectivo', importe: 3598 });
    await crm.confirmarVenta({ orderId: order.orderId, paymentId: payment.paymentId });

    // Segunda línea de defensa a nivel SQL, más allá de la idempotencia de
    // aplicación probada arriba: si algo intentara insertar el SALE de
    // nuevo directamente, el índice único parcial lo rechaza.
    await assert.rejects(
      () =>
        inventoryMovementRepository.insertMovement(pool, {
          productoId: PRODUCTO_TE,
          tipo: 'SALE',
          cantidad: -2,
          timestamp: new Date().toISOString(),
          orderId: order.orderId,
        }),
      (error) => {
        assert.equal(error.code, '23505'); // unique_violation
        return true;
      }
    );
  });

  test('pago que no pertenece a la orden es rechazado', async () => {
    await seedInventory(PRODUCTO_TE, 11, 6);
    const cliente = await clienteDePrueba();
    const { order: orderA } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [{ productoId: PRODUCTO_TE, cantidad: 1, precioUnitario: 1799 }],
    });
    const { order: orderB } = await crm.createOrder({
      customerId: cliente.customerId,
      items: [{ productoId: PRODUCTO_TE, cantidad: 1, precioUnitario: 1799 }],
    });
    const paymentDeB = await paymentRepository.insertPayment(pool, { orderId: orderB.orderId, metodo: 'efectivo', importe: 1799 });

    await assert.rejects(() => crm.confirmarVenta({ orderId: orderA.orderId, paymentId: paymentDeB.paymentId }));
  });
});
