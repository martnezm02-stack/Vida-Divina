// inventoryReportHtml.test.ts — FASE "Cierre de autenticación + logo +
// correo de inventario" (2026-09-19), Parte 9-A. Prueba
// formatReporteInventarioHtml() contra datos REALES de
// generateInventoryReport() (misma fuente que consume ReportesPanel.tsx y
// el correo real) -- nunca datos inventados. Solo lectura, nunca modifica
// inventory.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

before(async () => {
  const crmEnvPath = path.resolve(__dirname, "..", "..", "crm", ".env");
  const texto = fs.readFileSync(crmEnvPath, "utf-8");
  const match = texto.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!match) throw new Error("inventoryReportHtml.test.ts: no se encontró DATABASE_URL en crm/.env");
  process.env.DATABASE_URL = match.slice(match.indexOf("=") + 1).trim();
  await import("../scripts/env-loader");
});

test("formatReporteInventarioHtml: es HTML real (doctype + html/body), nunca texto plano ni <pre>", async () => {
  const { generateInventoryReport, formatReporteInventarioHtml } = await import("../src/lib/vidaDivina/inventoryReportGenerator");
  const data = await generateInventoryReport();
  const html = formatReporteInventarioHtml(data);

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html[\s>]/i);
  assert.match(html, /<body[\s>]/i);
  assert.doesNotMatch(html, /<pre[\s>]/i, "nunca debe usar <pre> como solución de formato");
});

test("formatReporteInventarioHtml: contiene las secciones reales exigidas (encabezado, resumen, atención inmediata, estado, detalle)", async () => {
  const { generateInventoryReport, formatReporteInventarioHtml } = await import("../src/lib/vidaDivina/inventoryReportGenerator");
  const data = await generateInventoryReport();
  const html = formatReporteInventarioHtml(data);

  assert.match(html, /REPORTE DE INVENTARIO — VIDA DIVINA/);
  assert.match(html, /Resumen ejecutivo/i);
  assert.match(html, /Atenci[oó]n inmediata/i);
  assert.match(html, /Estado del inventario/i);
  assert.match(html, /Detalle de productos/i);
});

test("formatReporteInventarioHtml: usa tablas HTML reales para el detalle, no listas de texto", async () => {
  const { generateInventoryReport, formatReporteInventarioHtml } = await import("../src/lib/vidaDivina/inventoryReportGenerator");
  const data = await generateInventoryReport();
  const html = formatReporteInventarioHtml(data);

  assert.match(html, /<table[\s\S]*<\/table>/i);
  assert.match(html, /<th[\s>]/i, "debe tener encabezados de columna reales (<th>)");
  if (data.productos.length > 0) {
    const primero = data.productos[0];
    assert.ok(html.includes(primero.producto), "el nombre real del primer producto debe aparecer en el HTML");
  }
});

test("formatReporteInventarioHtml: refleja el resumen real (existenciaTotal/agotados/mínimo), nunca datos inventados", async () => {
  const { generateInventoryReport, formatReporteInventarioHtml } = await import("../src/lib/vidaDivina/inventoryReportGenerator");
  const data = await generateInventoryReport();
  const html = formatReporteInventarioHtml(data);

  assert.ok(html.includes(String(data.resumen.productosAgotados)));
  assert.ok(html.includes(String(data.resumen.enNivelMinimo)));
  assert.ok(html.includes(`${data.resumen.existenciaTotal} u.`));
});

test("formatReporteInventarioHtml: escapa HTML real en nombres de producto (nunca inyecta markup sin escapar)", async () => {
  const { formatReporteInventarioHtml } = await import("../src/lib/vidaDivina/inventoryReportGenerator");
  const dataFalsa = {
    actualizadoEn: new Date().toISOString(),
    resumen: { existenciaTotal: 1, productosAgotados: 0, enNivelMinimo: 0, productosNormales: 1, valorInventario: 10, valorInventarioIncompleto: false },
    distribucion: { normal: 1, minimo: 0, agotado: 0 },
    valorPorCategoria: [],
    productosCriticos: [],
    productos: [
      { productoId: "x", producto: "<script>alert(1)</script>", sku: "X", categoria: "Test", existencia: 1, minimo: 0, estado: "NORMAL" as const, costoUnitario: 10, moneda: "MXN", valor: 10, actualizadoEn: null },
    ],
  };
  const html = formatReporteInventarioHtml(dataFalsa);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});
