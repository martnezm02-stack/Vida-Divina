// priceIntent.test.ts — detección determinista de intención de precio
// (hallazgo real 2026-09-11: "¿Cuánto cuestan las cápsulas Reishi?" el LLM
// llamó a buscarProductos en vez de consultarProducto y respondió sin
// precio). Cubre detección + resolución de producto contra el catálogo
// REAL (docs/productos/), igual que productKnowledge.test.ts.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { detectarIntencionPrecio, textoSinRuidoDePrecio } from "../src/lib/vidaDivina/priceIntent";
import { getProductKnowledge } from "../src/lib/vidaDivina/productKnowledge";
import { consultarProductoHandler } from "../src/lib/tools/consultar-producto";

// El pricing real (CRM/Postgres) requiere DATABASE_URL -- mismo patrón que
// tools.test.ts para que consultarProductoHandler traiga precio/cantidadBase reales.
before(async () => {
  await import("../scripts/env-loader");
});

test("detectarIntencionPrecio: reconoce las 5 formulaciones reales del encargo", () => {
  for (const texto of [
    "¿Cuánto cuestan las cápsulas Reishi?",
    "¿Cuánto cuesta Ripped?",
    "¿Qué precio tiene Café Tongkat Ali?",
    "¿Hay promoción de Café Tongkat Ali?",
    "¿Cuánto vale Tongkat Ali?",
  ]) {
    assert.equal(detectarIntencionPrecio(texto), true, `debería detectar intención de precio en: "${texto}"`);
  }
});

test("detectarIntencionPrecio: nunca falsos positivos en mensajes sin relación con precio", () => {
  for (const texto of ["Hola, buen día", "si quiero hacer el pedido", "¿cuál es la presentación de Reishi?", "me llamo Manuel"]) {
    assert.equal(detectarIntencionPrecio(texto), false, `no debería detectar precio en: "${texto}"`);
  }
});

test("Validación A: 'Reishi' resuelve al producto real con el texto completo", async () => {
  const r = await getProductKnowledge("¿Cuánto cuestan las cápsulas Reishi?");
  assert.equal(r.found, true);
  if (r.found) assert.equal(r.productId, "productos/03-longevidad-bienestar/reishi-capsules");
});

test("Validación B: 'Ripped' resuelve incluso con ruido en la frase completa (mejora real 2026-09-11: el fallback fuzzy de productKnowledge.ts ya no exige que TODOS los tokens de la consulta coincidan); textoSinRuidoDePrecio sigue funcionando como red de seguridad adicional", async () => {
  const directo = await getProductKnowledge("¿Cuánto cuesta Ripped?");
  assert.equal(directo.found, true, "el fallback fuzzy ahora resuelve esto directamente, sin necesitar limpiar ruido");
  if (directo.found) assert.equal(directo.productId, "productos/07-rendimiento-fisico/ripped-capsules");

  const limpio = textoSinRuidoDePrecio("¿Cuánto cuesta Ripped?");
  const r = await getProductKnowledge(limpio);
  assert.equal(r.found, true);
  if (r.found) assert.equal(r.productId, "productos/07-rendimiento-fisico/ripped-capsules");
});

test("Validación C/E: 'Café Tongkat Ali' (precio y promoción) resuelve a un producto real del catálogo", async () => {
  for (const texto of ["¿Qué precio tiene Café Tongkat Ali?", "¿Hay promoción de Café Tongkat Ali?"]) {
    const r = await getProductKnowledge(texto);
    assert.equal(r.found, true, `debería resolver producto para: "${texto}"`);
  }
});

test("consultarProducto: precio real en formato $X,XXX (pesos, sin punto de miles) y nunca dólares", async () => {
  const res = (await consultarProductoHandler({ producto: "Reishi" })) as {
    encontrado: boolean;
    precioFormateado?: string | null;
    message: string;
  };
  assert.equal(res.encontrado, true);
  assert.match(res.precioFormateado ?? "", /^\$[\d,]+$/, "precioFormateado debe ser '$X,XXX', nunca con punto de miles");
  assert.doesNotMatch(res.precioFormateado ?? "", /\./, "nunca debe llevar punto de miles");
  assert.match(res.message, /pesos mexicanos/i);
  assert.match(res.message, /d[oó]lares/i, "el mensaje debe prohibir explícitamente convertir a dólares");
});

test("consultarProducto: instruye conservar la estructura Contenedor/Detalle de la presentación (Tongkat Ali Café)", async () => {
  const res = (await consultarProductoHandler({ producto: "Sculpt Tongkat Ali" })) as {
    encontrado: boolean;
    cantidadBase?: string | null;
    message: string;
  };
  assert.equal(res.encontrado, true);
  assert.equal(res.cantidadBase, "Bolsa / 20 sobres individuales");
  assert.match(res.message, /una bolsa con 20 sobres individuales/i);
  assert.match(res.message, /nunca.*presentaci[oó]n de/i);
});

// Problema 3 (2026-09-12): el catálogo real tiene, para Ripped Capsules,
// "Nombre visible: Cápsulas Ripped" distinto del título interno/comercial
// -- Hermes usaba el título en inglés al redactar en español ("Las Ripped
// Capsules..."). La corrección es de prompt/regla, reutilizando el
// contenido ya existente (nunca tocando productKnowledge/matching/precio).
test("Problema 3: el contenido real de Ripped Capsules trae 'Nombre visible: Cápsulas Ripped' (evidencia real, sin inventar)", async () => {
  const res = (await consultarProductoHandler({ producto: "Ripped" })) as {
    encontrado: boolean;
    contenido: string;
    precioFormateado?: string | null;
    message: string;
  };
  assert.equal(res.encontrado, true);
  assert.match(res.contenido, /Nombre visible:\*{0,2}\s*Cápsulas Ripped/i);
  // El precio real sigue disponible tal cual (esta corrección no toca price lookup).
  assert.equal(res.precioFormateado, "$1,799");
  // La instrucción real de cómo nombrar el producto está en el message.
  assert.match(res.message, /Nombre visible/i);
  assert.match(res.message, /nunca mezcles un nombre en inglés dentro de una frase en español/i);
});

test("Problema 3 + Problema 2 (fuzzy matching, sin regresión): 'Ripet' y 'Ripped' resuelven al mismo producto real con el mismo Nombre visible", async () => {
  for (const variante of ["Ripet", "Ripped"]) {
    const res = (await consultarProductoHandler({ producto: variante })) as { encontrado: boolean; contenido: string; precioFormateado?: string | null };
    assert.equal(res.encontrado, true, `debería resolver "${variante}"`);
    assert.match(res.contenido, /Nombre visible:\*{0,2}\s*Cápsulas Ripped/i);
    assert.equal(res.precioFormateado, "$1,799");
  }
});
