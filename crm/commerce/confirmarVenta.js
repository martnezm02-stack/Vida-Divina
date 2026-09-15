// confirmarVenta.js — Núcleo Comercial, Fase 0006. El ÚNICO camino
// autorizado para que una orden pase de 'pendiente' a 'confirmado' y
// genere descuento real de inventario (tipo SALE). Ninguna otra función de
// este proyecto debe insertar un movimiento tipo SALE directamente.
//
// Ciclo real: VENTA CONFIRMADA -> ORDER (ya existe, 'pendiente') ->
// PAYMENT (ya existe, 'pendiente') -> [esta función] -> SALE -> INVENTORY.
//
// Regla Crítica (instrucción de la fase): el inventario SOLO se descuenta
// cuando la venta cumple la condición de "confirmada" definida aquí --
// una oportunidad, oferta, conversación o pedido pendiente nunca la
// cumple. Esta función es la única definición real de esa condición.
//
// Atomicidad: todo ocurre dentro de una única transacción (mismo patrón
// que crm/context/contextProjection.js#updateContext) -- si CUALQUIER
// paso falla (pago inválido, stock insuficiente, lo que sea), la
// transacción completa hace ROLLBACK: ni el pago, ni la orden, ni el
// inventario quedan modificados.
//
// Idempotencia: bajo lock (SELECT ... FOR UPDATE) sobre la orden ANTES de
// leer su estado -- si ya está 'confirmado', esta función es un no-op real
// (no vuelve a tocar inventario/pago/orden) y devuelve el resultado ya
// existente. El lock serializa además cualquier llamada concurrente sobre
// la MISMA orden: una espera a que la otra termine y ve el estado ya
// resuelto, nunca corren en paralelo sobre el mismo pedido. Segunda línea
// de defensa a nivel SQL: order_repository.markConfirmed/markConfirmed de
// payment solo afectan filas todavía 'pendiente', y el índice único
// parcial ux_inventory_movements_order_producto_sale (0006) rechaza un
// SALE duplicado del mismo producto en la misma orden si algo lo
// intentara de todos modos.
//
// Protección de stock negativo: cada línea bloquea su fila de `inventory`
// (FOR UPDATE) y compara cantidad_actual contra lo pedido ANTES de
// escribir nada -- si cualquier línea no alcanza, se lanza
// InsufficientStockError y TODA la transacción se revierte (ninguna otra
// línea de la misma orden queda descontada a medias). El CHECK
// cantidad_actual >= 0 del schema es la tercera línea de defensa.

import { getPool } from '../db/pool.js';
import { runInTransaction } from '../db/transaction.js';
import * as orderRepository from '../repositories/orderRepository.js';
import * as paymentRepository from '../repositories/paymentRepository.js';
import * as inventoryRepository from '../repositories/inventoryRepository.js';
import * as inventoryMovementRepository from '../repositories/inventoryMovementRepository.js';

export class InsufficientStockError extends Error {
  constructor(productoId, disponible, solicitado) {
    super(
      `Stock insuficiente para "${productoId}": disponible=${disponible}, solicitado=${solicitado}. ` +
        'La venta se rechaza completa -- ningún producto de esta orden queda descontado.'
    );
    this.name = 'InsufficientStockError';
    this.productoId = productoId;
    this.disponible = disponible;
    this.solicitado = solicitado;
  }
}

/**
 * @param {{orderId: string, paymentId: string}} datos
 * @returns {Promise<{order: Object, payment: Object, movements: Object[], idempotentReplay: boolean}>}
 */
export async function confirmarVenta({ orderId, paymentId }) {
  const pool = getPool();
  return runInTransaction(pool, async (client) => {
    const order = await orderRepository.findByIdForUpdate(client, orderId);
    if (!order) {
      throw new Error(`confirmarVenta: no existe ninguna orden real con id "${orderId}".`);
    }

    // Idempotencia real: ya confirmada -- no-op, se devuelve lo que ya existe.
    if (order.estado === 'confirmado') {
      const [payment, movements] = await Promise.all([
        paymentRepository.findById(client, paymentId),
        inventoryMovementRepository.listByOrderId(client, orderId),
      ]);
      return { order, payment, movements, idempotentReplay: true };
    }

    if (order.estado === 'cancelado') {
      throw new Error(`confirmarVenta: la orden "${orderId}" está cancelada -- no puede confirmarse.`);
    }

    const payment = await paymentRepository.findByIdForUpdate(client, paymentId);
    if (!payment) {
      throw new Error(`confirmarVenta: no existe ningún pago real con id "${paymentId}".`);
    }
    if (payment.orderId !== orderId) {
      throw new Error(`confirmarVenta: el pago "${paymentId}" no pertenece a la orden "${orderId}".`);
    }
    if (payment.estado !== 'pendiente') {
      throw new Error(
        `confirmarVenta: el pago "${paymentId}" está "${payment.estado}", no "pendiente" -- no puede confirmar la venta.`
      );
    }

    const items = await orderRepository.listItemsByOrderId(client, orderId);

    // Fase 1: bloquear y verificar TODAS las líneas antes de escribir nada.
    // Nunca se descuenta una línea mientras se descubre que otra no alcanza.
    const inventarios = [];
    for (const item of items) {
      const inv = await inventoryRepository.findByProductoIdForUpdate(client, item.productoId);
      const disponible = inv?.cantidadActual ?? 0;
      if (disponible < item.cantidad) {
        throw new InsufficientStockError(item.productoId, disponible, item.cantidad);
      }
      inventarios.push({ item, inv });
    }

    // Fase 2: todas las líneas tienen stock real -- registrar SALE y
    // descontar, una línea a la vez.
    const movements = [];
    const timestamp = new Date().toISOString();
    for (const { item, inv } of inventarios) {
      const movement = await inventoryMovementRepository.insertMovement(client, {
        productoId: item.productoId,
        tipo: 'SALE',
        cantidad: -item.cantidad,
        timestamp,
        motivo: `Venta confirmada -- orden ${orderId}.`,
        orderId,
      });
      movements.push(movement);

      await inventoryRepository.upsertInventory(client, {
        productoId: item.productoId,
        cantidadActual: inv.cantidadActual - item.cantidad,
        actualizadoPor: `venta-confirmada-orden-${orderId}`,
      });
    }

    const paymentConfirmado = await paymentRepository.markConfirmed(client, paymentId);
    const orderConfirmada = await orderRepository.markConfirmed(client, orderId);

    return { order: orderConfirmada, payment: paymentConfirmado, movements, idempotentReplay: false };
  });
}
