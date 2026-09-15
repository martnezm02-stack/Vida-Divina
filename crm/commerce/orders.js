// orders.js — Núcleo Comercial, Fase 0006. API pública pequeña y
// explícita para crear una orden, mismo criterio que crm/context/
// contextProjection.js: no expone orderRepository directamente, maneja su
// propia transacción, y es lo único que crm/index.js re-exporta desde este
// módulo (junto con confirmarVenta.js).
//
// createOrder() NO descuenta inventario -- una orden nace 'pendiente' y no
// tiene ningún efecto sobre el stock hasta que crm.commerce.confirmarVenta
// la confirme explícitamente (Regla Crítica de la fase: una orden
// pendiente nunca genera SALE).

import { getPool } from '../db/pool.js';
import { runInTransaction } from '../db/transaction.js';
import * as orderRepository from '../repositories/orderRepository.js';

/**
 * Crea una orden con sus líneas de forma atómica (todo o nada). El precio
 * de cada línea lo decide quien llama (normalmente leído de
 * product_pricing en ese instante) -- se congela tal cual en la orden,
 * nunca se vuelve a consultar después.
 *
 * @param {{
 *   customerId: string,
 *   opportunityId?: string|null,
 *   items: Array<{productoId: string, cantidad: number, precioUnitario: number}>,
 *   moneda?: string,
 * }} datos
 * @returns {Promise<{order: Object, items: Object[]}>}
 */
export async function createOrder(datos) {
  const pool = getPool();
  return runInTransaction(pool, (client) => orderRepository.insertOrder(client, datos));
}
