// revenueAttribution.js — Fase 11. Revenue viene EXCLUSIVAMENTE de
// opportunities.total (crm/, Fase A §12) -- nunca estimado. El proyecto no
// tiene todavía una tabla orders/payments separada (ver comentario de
// cabecera de crm/migrations/0001_init_schema.sql: "bloqueadas por
// decisión de negocio pendiente") ni una columna de moneda en
// `opportunities` -- por eso currency es SIEMPRE null aquí: inventar 'MXN'
// sería fabricar un dato que el schema real no registra.
//
// "Venta confirmada" = una opportunity cuyo estado es PedidoProcesado o
// cualquier estado alcanzable DESDE PedidoProcesado en ESTADOS_VENTA_REAL
// (simulator/src/stateMachine.js) -- se deriva por alcanzabilidad real del
// grafo de estados en vez de copiar esa lista a mano aquí (evita una
// segunda fuente de verdad que se desincronice si el motor comercial
// agrega un estado nuevo).

import { ESTADOS_VENTA_REAL } from '../../simulator/src/stateMachine.js';

function deriveSaleStates(fromStateId) {
  const visited = new Set([fromStateId]);
  const queue = [fromStateId];
  while (queue.length > 0) {
    const current = queue.shift();
    const estado = ESTADOS_VENTA_REAL[current];
    for (const next of estado?.transicionesValidas ?? []) {
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  return visited;
}

export const SALE_STATES = Object.freeze([...deriveSaleStates('PedidoProcesado')]);

/**
 * @param {object|null} opportunity - fila de crm.opportunities (camelCase), o null.
 * @returns {{isSale:boolean, revenue:number|null, currency:null, saleId:string|null}}
 */
export function extractRevenue(opportunity) {
  if (!opportunity) return { isSale: false, revenue: null, currency: null, saleId: null };
  const isSale = SALE_STATES.includes(opportunity.estado);
  if (!isSale) return { isSale: false, revenue: null, currency: null, saleId: null };
  const revenue = opportunity.total === null || opportunity.total === undefined ? null : Number(opportunity.total);
  return { isSale: true, revenue, currency: null, saleId: opportunity.opportunityId };
}

/** Suma revenue SOLO de AttributionRecord con revenue real (nunca trata null como 0). */
export function computeAttributedRevenue(attributionRecords) {
  const withRevenue = attributionRecords.filter((r) => typeof r.revenue === 'number');
  if (withRevenue.length === 0) return { total: null, count: 0, reason: 'Ningún AttributionRecord tiene revenue real registrado.' };
  return { total: Number(withRevenue.reduce((sum, r) => sum + r.revenue, 0).toFixed(2)), count: withRevenue.length };
}
