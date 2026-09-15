// index.js
// API pública del módulo crm/ — la única puerta de acceso a PostgreSQL en
// todo el proyecto (Decisión Arquitectónica #6, ver
// docs/ARCHITECTURE_v1.md §11 y docs/PROJECT_STATE.md §6). Ningún otro
// módulo debe importar `pg` ni crm/db/pool.js directamente — solo este
// archivo.
//
// Deliberadamente NO se exporta el pg.Pool en sí (ni getPool, ni ningún
// objeto con `.query` de propósito general) — un consumidor externo solo
// puede llamar funciones de repository ya definidas y parametrizadas,
// nunca ejecutar SQL arbitrario a través de este módulo. `testConnection`
// y `closePool` son las únicas dos funciones de infraestructura expuestas,
// y ninguna permite ejecutar una query arbitraria.
//
// Fase B: este módulo existe de forma aislada. Todavía no lo importa
// ningún módulo de negocio (simulator/, whatsapp-adapter/, decision-engine/,
// recommendation-engine/) — esa integración es una fase posterior.
//
// Fase C.1 agrega contextExists/projectContext/persistContext/updateContext
// (CRM Context Projection, crm/context/) — misma regla: todavía sin
// consumidores fuera de crm/, existe de forma aislada y probada por su
// cuenta. Ver docs/CRM_FASE_C1_CONTEXT_PROJECTION.md.

import { getPool, testConnection, closePool } from './db/pool.js';
import { runInTransaction } from './db/transaction.js';
import { contextExists, projectContext, persistContext, updateContext } from './context/contextProjection.js';
import { createOrder } from './commerce/orders.js';
import { confirmarVenta, InsufficientStockError } from './commerce/confirmarVenta.js';

import * as customerRepository from './repositories/customerRepository.js';
import * as customerChannelRepository from './repositories/customerChannelRepository.js';
import * as conversationRepository from './repositories/conversationRepository.js';
import * as messageRepository from './repositories/messageRepository.js';
import * as stateTransitionRepository from './repositories/stateTransitionRepository.js';
import * as opportunityRepository from './repositories/opportunityRepository.js';
import * as offerLogRepository from './repositories/offerLogRepository.js';
import * as followUpRepository from './repositories/followUpRepository.js';
import * as handoffRepository from './repositories/handoffRepository.js';
import * as productPricingRepository from './repositories/productPricingRepository.js';
import * as inventoryRepository from './repositories/inventoryRepository.js';
import * as inventoryMovementRepository from './repositories/inventoryMovementRepository.js';
import * as orderRepository from './repositories/orderRepository.js';
import * as paymentRepository from './repositories/paymentRepository.js';
import * as reportingRepository from './repositories/reportingRepository.js';
import * as prospectRepository from './repositories/prospectRepository.js';

const REPOSITORIOS = {
  customers: customerRepository,
  customerChannels: customerChannelRepository,
  conversations: conversationRepository,
  messages: messageRepository,
  stateTransitions: stateTransitionRepository,
  opportunities: opportunityRepository,
  offersLog: offerLogRepository,
  followUps: followUpRepository,
  handoffs: handoffRepository,
  productPricing: productPricingRepository,
  inventory: inventoryRepository,
  inventoryMovements: inventoryMovementRepository,
  orders: orderRepository,
  payments: paymentRepository,
  reporting: reportingRepository,
  prospects: prospectRepository,
};

/**
 * Envuelve cada función de un módulo repository para que reciba `db`
 * automáticamente desde `obtenerDb()` en vez de que quien llama tenga que
 * pasarlo — es lo que le permite a un consumidor externo escribir
 * `crm.customers.createCustomer({...})` en vez de
 * `crm.customers.createCustomer(pool, {...})`, sin que ese consumidor
 * llegue a ver `pool` ni `client` en ningún momento. `obtenerDb` se evalúa
 * en cada llamada (perezoso), nunca al importar este archivo — así,
 * importar crm/index.js no dispara la validación de DATABASE_URL hasta
 * que efectivamente se invoque un método.
 */
function ligarRepositorio(repositorio, obtenerDb) {
  const ligado = {};
  for (const [nombre, fn] of Object.entries(repositorio)) {
    ligado[nombre] = (...args) => fn(obtenerDb(), ...args);
  }
  return ligado;
}

function construirNamespaces(obtenerDb) {
  const namespaces = {};
  for (const [clave, repositorio] of Object.entries(REPOSITORIOS)) {
    namespaces[clave] = ligarRepositorio(repositorio, obtenerDb);
  }
  return namespaces;
}

// Namespaces ligados al pool real (DATABASE_URL) — uso normal del módulo.
const namespacesPool = construirNamespaces(getPool);

export const customers = namespacesPool.customers;
export const customerChannels = namespacesPool.customerChannels;
export const conversations = namespacesPool.conversations;
export const messages = namespacesPool.messages;
export const stateTransitions = namespacesPool.stateTransitions;
export const opportunities = namespacesPool.opportunities;
export const offersLog = namespacesPool.offersLog;
export const followUps = namespacesPool.followUps;
export const handoffs = namespacesPool.handoffs;
export const productPricing = namespacesPool.productPricing;
export const inventory = namespacesPool.inventory;
export const inventoryMovements = namespacesPool.inventoryMovements;
export const orders = namespacesPool.orders;
export const payments = namespacesPool.payments;
export const reporting = namespacesPool.reporting;
export const prospects = namespacesPool.prospects;

/**
 * Ejecuta `work(scoped)` dentro de una única transacción PostgreSQL.
 * `scoped` tiene exactamente la misma forma que los namespaces de arriba
 * (scoped.customers.createCustomer(...), scoped.conversations.createConversation(...),
 * etc.) pero cada llamada usa el mismo cliente transaccional — si `work`
 * lanza, TODO lo escrito dentro se revierte (ROLLBACK), incluidas
 * escrituras en tablas distintas. Es la infraestructura que permite, por
 * ejemplo, crear un customer + su canal + su conversación de forma atómica
 * — no implementa ese flujo de negocio específico todavía (eso es de una
 * fase posterior), solo el mecanismo genérico.
 *
 * @param {(scoped: typeof namespacesPool) => Promise<any>} work
 * @returns {Promise<any>}
 */
export async function withTransaction(work) {
  const pool = getPool();
  return runInTransaction(pool, async (client) => {
    const scoped = construirNamespaces(() => client);
    return work(scoped);
  });
}

export { testConnection, closePool };

// CRM Context Projection (Fase C.1) — re-exportadas tal cual, sin envoltura
// adicional: ya son funciones de alto nivel (no reciben `db`/`pool`), y ya
// manejan sus propias transacciones internamente (ver crm/context/contextProjection.js).
export { contextExists, projectContext, persistContext, updateContext };

// Núcleo Comercial (Fase 0006) — mismo criterio que Context Projection:
// funciones de alto nivel, sin `db`/`pool`, manejan su propia transacción
// (ver crm/commerce/orders.js, crm/commerce/confirmarVenta.js).
// confirmarVenta() es el ÚNICO camino autorizado para generar un
// movimiento tipo SALE y descontar inventory -- ver ese archivo para el
// detalle de atomicidad/idempotencia/protección de stock negativo.
export { createOrder, confirmarVenta, InsufficientStockError };
