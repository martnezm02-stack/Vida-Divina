// inventoryReportGenerator.ts — Reporte real de inventario para Hermes
// Ventas (FASE "Hermes Ventas: Reporte de Inventario + Envío por Correo",
// 2026-09-17). SOLO LECTURA: consulta crm.inventory.findAll() (PostgreSQL
// real, misma tabla que usa el Dashboard) y reutiliza el cálculo agregado
// de crm/services/inventorySnapshot.js -- exactamente el mismo que usa
// dashboard/server/routes/inventory.js, nunca un cálculo paralelo ni datos
// del mockup del Dashboard. Nombre visible de producto vía
// getProductTitleById (ya usado por reportGenerator.ts para
// productosTopIntencion) -- si no hay nombre real, cae al productoId.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, getProductTitleById } from "./productKnowledge";

const CRM_INDEX_PATH = path.join(REPO_ROOT, "crm", "index.js");
const INVENTORY_SNAPSHOT_PATH = path.join(REPO_ROOT, "crm", "services", "inventorySnapshot.js");

let _crm: any = null;
async function crm(): Promise<any> {
  // /* webpackIgnore: true */ obligatorio (2026-09-18): ahora también lo
  // llama la ruta /api/reportes/inventario e /api/inventario, bundleadas por Turbopack.
  if (!_crm) _crm = await import(/* webpackIgnore: true */ pathToFileURL(CRM_INDEX_PATH).href);
  return _crm;
}

let _buildInventorySnapshot: any = null;
async function buildInventorySnapshot(): Promise<any> {
  if (!_buildInventorySnapshot) {
    const mod: any = await import(/* webpackIgnore: true */ pathToFileURL(INVENTORY_SNAPSHOT_PATH).href);
    _buildInventorySnapshot = mod.buildInventorySnapshot;
  }
  return _buildInventorySnapshot;
}

export interface InventoryReportProducto {
  productoId: string;
  producto: string;
  sku: string;
  categoria: string;
  existencia: number;
  minimo: number | null;
  estado: "NORMAL" | "MINIMO" | "AGOTADO";
  costoUnitario: number | null;
  moneda: string | null;
  valor: number | null;
  actualizadoEn: string | null;
}

export interface InventoryReportData {
  actualizadoEn: string;
  resumen: {
    existenciaTotal: number;
    productosAgotados: number;
    enNivelMinimo: number;
    productosNormales: number;
    valorInventario: number;
    valorInventarioIncompleto: boolean;
  };
  distribucion: { normal: number; minimo: number; agotado: number };
  valorPorCategoria: Array<{ categoria: string; valor: number; incompleto: boolean }>;
  productosCriticos: InventoryReportProducto[];
  productos: InventoryReportProducto[];
}

/** Genera el snapshot real de inventario -- SOLO LECTURA, nunca modifica `inventory`. */
export async function generateInventoryReport(): Promise<InventoryReportData> {
  const c = await crm();
  const build = await buildInventorySnapshot();
  const rows = await c.inventory.findAll();
  return build(rows, (productoId: string) => getProductTitleById(productoId).catch(() => null));
}

function formatMoneda(valor: number | null, moneda: string | null): string {
  if (valor == null) return "sin costo registrado";
  return `$${valor.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda ?? ""}`.trim();
}

/** Resumen ejecutivo breve -- para WhatsApp. */
export function formatResumenInventario(data: InventoryReportData): string {
  const lineas = [
    `Resumen de inventario — Vida Divina`,
    `Corte: ${data.actualizadoEn}`,
    "",
    `Existencia total: ${data.resumen.existenciaTotal} unidades`,
    `Valor total a costo: ${formatMoneda(data.resumen.valorInventario, null)}${data.resumen.valorInventarioIncompleto ? " (incompleto: algún costo real falta)" : ""}`,
    `Productos agotados: ${data.resumen.productosAgotados}`,
    `Productos en nivel mínimo: ${data.resumen.enNivelMinimo}`,
    `Productos normales: ${data.resumen.productosNormales}`,
  ];
  if (data.productosCriticos.length > 0) {
    lineas.push("", "Críticos:");
    data.productosCriticos.slice(0, 10).forEach((p) => lineas.push(`- ${p.producto} (${p.estado}): ${p.existencia} unidades${p.minimo != null ? `, mínimo ${p.minimo}` : ""}`));
  }
  return lineas.join("\n");
}

/** Interpretación objetiva breve -- solo aritmética sobre los datos reales, nunca una causa o recomendación inventada. */
function interpretacionBreve(data: InventoryReportData): string {
  const totalProductos = data.productos.length;
  const criticos = data.productosCriticos.length;
  if (totalProductos === 0) return "Sin productos registrados en inventory todavía.";
  const pctCriticos = Math.round((criticos / totalProductos) * 100);
  if (criticos === 0) return "Todo el inventario real está en nivel normal -- ningún producto requiere atención inmediata.";
  return `${criticos} de ${totalProductos} productos (${pctCriticos}%) requieren atención inmediata (agotados o en nivel mínimo).`;
}

/** Análisis de Hermes -- lista de observaciones objetivas derivadas EXCLUSIVAMENTE de los datos reales del snapshot, nunca causas ni recomendaciones comerciales inventadas. */
function analisisHermes(data: InventoryReportData): string[] {
  const puntos: string[] = [];
  if (data.resumen.productosAgotados > 0) {
    const nombres = data.productosCriticos.filter((p) => p.estado === "AGOTADO").map((p) => p.producto).slice(0, 5).join(", ");
    puntos.push(`${data.resumen.productosAgotados} producto(s) sin existencia real: ${nombres}.`);
  }
  if (data.resumen.enNivelMinimo > 0) {
    const nombres = data.productosCriticos.filter((p) => p.estado === "MINIMO").map((p) => p.producto).slice(0, 5).join(", ");
    puntos.push(`${data.resumen.enNivelMinimo} producto(s) en su nivel mínimo real: ${nombres}.`);
  }
  if (data.valorPorCategoria.length > 0) {
    const top = data.valorPorCategoria[0];
    puntos.push(`Mayor concentración de valor de inventario real: categoría "${top.categoria}" (${formatMoneda(top.valor, null)}).`);
  }
  if (data.resumen.valorInventarioIncompleto) {
    puntos.push("Al menos un producto no tiene costo unitario real registrado -- el valor total del inventario está incompleto, nunca aproximado.");
  }
  if (puntos.length === 0) puntos.push("Sin observaciones adicionales -- el inventario real no presenta agotados ni productos en nivel mínimo.");
  return puntos;
}

function tablaProductos(productos: InventoryReportProducto[], columnas: "criticos" | "completa"): string[] {
  if (productos.length === 0) return ["Ninguno."];
  const lineas: string[] = [];
  if (columnas === "criticos") {
    lineas.push("Producto | Existencia | Mínimo | Estado");
    productos.forEach((p) => lineas.push(`${p.producto} | ${p.existencia} | ${p.minimo ?? "-"} | ${p.estado}`));
  } else {
    lineas.push("Producto | Existencia | Mínimo | Estado | Costo unitario | Valor a costo");
    productos.forEach((p) =>
      lineas.push(
        `${p.producto} | ${p.existencia} | ${p.minimo ?? "-"} | ${p.estado} | ${p.costoUnitario != null ? formatMoneda(p.costoUnitario, p.moneda) : "sin costo real"} | ${p.valor != null ? formatMoneda(p.valor, p.moneda) : "sin costo real"}`
      )
    );
  }
  return lineas;
}

/**
 * Reporte formal completo -- para correo (asunto se arma aparte en la
 * tool). Mismo nivel ejecutivo/estructura por secciones que el resto de
 * reportes de Hermes (ver reportGenerator.ts#formatReporteFormal), adaptado
 * a inventario. Texto plano -- el mecanismo de correo real (createDraft,
 * ver email-mcp-server/src/gmailService.js) solo soporta text/plain hoy,
 * nunca se introduce un renderer HTML nuevo para esto.
 */
export function formatReporteInventarioFormal(data: InventoryReportData): string {
  const fecha = data.actualizadoEn.slice(0, 10);
  const hora = data.actualizadoEn.slice(11, 16);

  const lineas = [
    "📦 REPORTE DE INVENTARIO — VIDA DIVINA",
    `Fecha: ${fecha}`,
    `Hora del corte: ${hora} UTC`,
    "",
    "🎯 RESUMEN EJECUTIVO",
    `- Inventario total: ${data.resumen.existenciaTotal} unidades`,
    `- Valor a costo: ${formatMoneda(data.resumen.valorInventario, null)}${data.resumen.valorInventarioIncompleto ? " (incompleto: algún costo real falta)" : ""}`,
    `- Productos agotados: ${data.resumen.productosAgotados}`,
    `- Productos en nivel mínimo: ${data.resumen.enNivelMinimo}`,
    `- ${interpretacionBreve(data)}`,
    "",
    "🔴 ATENCIÓN INMEDIATA",
    ...tablaProductos(data.productosCriticos, "criticos"),
    "",
    "📊 ESTADO DEL INVENTARIO",
    `- NORMAL: ${data.distribucion.normal}`,
    `- MÍNIMO: ${data.distribucion.minimo}`,
    `- AGOTADO: ${data.distribucion.agotado}`,
    "",
    "📦 DETALLE DE PRODUCTOS",
    ...tablaProductos(data.productos, "completa"),
    "",
    "📈 MOVIMIENTOS RECIENTES",
    "Sin datos agregados de movimientos disponibles en este reporte todavía (inventory_movements solo se consulta hoy por producto/orden individual, ver crm/repositories/inventoryMovementRepository.js) -- nunca se inventa un movimiento.",
    "",
    "🤖 ANÁLISIS DE HERMES",
    ...analisisHermes(data).map((p) => `- ${p}`),
    "",
    "📌 RESUMEN FINAL",
    `- Productos: ${data.productos.length}`,
    `- Unidades: ${data.resumen.existenciaTotal}`,
    `- Valor a costo: ${formatMoneda(data.resumen.valorInventario, null)}`,
    `- Críticos: ${data.productosCriticos.length}`,
  ];
  return lineas.join("\n");
}
