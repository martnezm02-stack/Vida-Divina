// priceIntent.test.ts — detección determinista de intención de precio
// (hallazgo real 2026-09-11: "¿Cuánto cuestan las cápsulas Reishi?" el LLM
// llamó a buscarProductos en vez de consultarProducto y respondió sin
// precio). Cubre detección + resolución de producto contra el catálogo
// REAL (docs/productos/), igual que productKnowledge.test.ts.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { detectarIntencionPrecio, textoSinRuidoDePrecio, construirRefuerzoPrecio } from "../src/lib/vidaDivina/priceIntent";
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

test("consultarProducto: instruye conservar la estructura Contenedor/Detalle de la presentación (Tongkat Ali Café) -- mensaje compactado 2026-09-12, ya sin el ejemplo literal largo", async () => {
  const res = (await consultarProductoHandler({ producto: "Sculpt Tongkat Ali" })) as {
    encontrado: boolean;
    cantidadBase?: string | null;
    message: string;
  };
  assert.equal(res.encontrado, true);
  assert.equal(res.cantidadBase, "Bolsa / 20 sobres individuales");
  assert.match(res.message, /contenedor.*con.*detalle/i);
  assert.match(res.message, /nunca.*presentaci[oó]n de/i);
});

// Problema 3 (2026-09-12, endurecido tras investigación real de idioma):
// el catálogo real tiene, para Ripped Capsules, "Nombre visible: Cápsulas
// Ripped" distinto del título interno/comercial -- Hermes usaba el título
// en inglés al redactar en español ("Las Ripped Capsules..."), incluso con
// la instrucción de prompt ya en su sitio (0 de 4 respuestas reales lo
// aplicó). La corrección ahora es ESTRUCTURADA: `nombreParaCliente` se
// calcula en código, nunca lo elige el LLM entre las variantes presentes
// en el mismo texto.
test("Problema 3 (estructurado): Ripped Capsules -> nombreParaCliente='Cápsulas Ripped' en español, 'Ripped Capsules' en inglés", async () => {
  const resEs = (await consultarProductoHandler({ producto: "Ripped", language: "es" })) as {
    encontrado: boolean;
    contenido: string;
    nombreParaCliente?: string;
    precioFormateado?: string | null;
    message: string;
  };
  assert.equal(resEs.encontrado, true);
  assert.match(resEs.contenido, /Nombre visible:\*{0,2}\s*Cápsulas Ripped/i);
  assert.equal(resEs.precioFormateado, "$1,799");
  assert.equal(resEs.nombreParaCliente, "Cápsulas Ripped");
  assert.match(resEs.message, /Nombre a usar con el cliente.*Cápsulas Ripped/i);

  const resEn = (await consultarProductoHandler({ producto: "Ripped", language: "en" })) as {
    encontrado: boolean;
    nombreParaCliente?: string;
    message: string;
  };
  assert.equal(resEn.encontrado, true);
  assert.equal(resEn.nombreParaCliente, "Ripped Capsules");
  assert.match(resEn.message, /Name to use with the client.*Ripped Capsules/i);
});

test("Problema 3 (estructurado): Venus Capsules -> nombreParaCliente='Cápsulas Venus' en español, 'Venus Capsules' en inglés", async () => {
  const resEs = (await consultarProductoHandler({ producto: "Venus", language: "es" })) as {
    encontrado: boolean;
    nombreParaCliente?: string;
  };
  assert.equal(resEs.encontrado, true);
  assert.equal(resEs.nombreParaCliente, "Cápsulas Venus");

  const resEn = (await consultarProductoHandler({ producto: "Venus", language: "en" })) as {
    encontrado: boolean;
    nombreParaCliente?: string;
  };
  assert.equal(resEn.encontrado, true);
  assert.equal(resEn.nombreParaCliente, "Venus Capsules");
});

test("Problema 3 + Problema 2 (fuzzy matching, sin regresión): 'Ripet' y 'Ripped' resuelven al mismo producto real con el mismo nombreParaCliente", async () => {
  for (const variante of ["Ripet", "Ripped"]) {
    const res = (await consultarProductoHandler({ producto: variante, language: "es" })) as {
      encontrado: boolean;
      contenido: string;
      nombreParaCliente?: string;
      precioFormateado?: string | null;
    };
    assert.equal(res.encontrado, true, `debería resolver "${variante}"`);
    assert.match(res.contenido, /Nombre visible:\*{0,2}\s*Cápsulas Ripped/i);
    assert.equal(res.nombreParaCliente, "Cápsulas Ripped");
    assert.equal(res.precioFormateado, "$1,799");
  }
});

// Idioma (2026-09-12, causa raíz real): el `message` de apoyo ya NO es un
// único bloque largo siempre en español -- debe tener variante EN corta,
// sin duplicar el bloque completo en dos idiomas.
test("consultarProducto: message en inglés es distinto, en inglés real, y más corto que un bloque bilingüe duplicado", async () => {
  const resEs = (await consultarProductoHandler({ producto: "Ripped", language: "es" })) as { message: string };
  const resEn = (await consultarProductoHandler({ producto: "Ripped", language: "en" })) as { message: string };
  assert.notEqual(resEs.message, resEn.message);
  assert.match(resEn.message, /Mexican pesos/i);
  assert.doesNotMatch(resEn.message, /pesos mexicanos/i); // no es la instrucción en español
  assert.ok(resEn.message.length < resEs.message.length + resEn.message.length, "sanity: existen ambas variantes, no una concatenación gigante");
  assert.ok(!resEn.message.includes("Usa SOLO estos datos reales para responder"), "el message en inglés no debe traer el bloque largo en español");
});

test("buscarProductos: 'no encontrado' también tiene variante en inglés, sin depender de una segunda llamada al LLM", async () => {
  const { buscarProductosHandler } = await import("../src/lib/tools/consultar-producto");
  const resEs = (await buscarProductosHandler({ consulta: "producto-inexistente-xyz", language: "es" })) as { message: string };
  const resEn = (await buscarProductosHandler({ consulta: "producto-inexistente-xyz", language: "en" })) as { message: string };
  assert.match(resEs.message, /No hay ningún producto real/i);
  assert.match(resEn.message, /No real product/i);
});

// construirRefuerzoPrecio (2026-09-12): refuerzo determinista de precio de
// handler.ts, ahora por idioma -- el precio/monto real NUNCA cambia, solo
// el idioma de la instrucción que lo acompaña. Función pura, sin red/DB.
test("construirRefuerzoPrecio: en español trae el precio real tal cual, instrucción en español", () => {
  const bloque = construirRefuerzoPrecio("es", { titulo: "Ripped Capsules", precioFormateado: "$1,799", cantidadBase: null });
  assert.match(bloque, /DATO DE PRECIO YA VERIFICADO/i);
  assert.match(bloque, /\$1,799/);
  assert.match(bloque, /pesos mexicanos/i);
});

test("construirRefuerzoPrecio: en inglés trae el MISMO precio real (nunca traducido/recalculado), instrucción en inglés", () => {
  const bloque = construirRefuerzoPrecio("en", { titulo: "Ripped Capsules", precioFormateado: "$1,799", cantidadBase: "Bolsa / 20 sobres individuales" });
  assert.match(bloque, /VERIFIED PRICE DATA/i);
  assert.match(bloque, /\$1,799/); // el monto real, idéntico al de la versión ES
  assert.match(bloque, /Mexican pesos/i);
  assert.doesNotMatch(bloque, /pesos mexicanos/i);
});

test("construirRefuerzoPrecio: sin precio real -> nunca inventa una cifra, en ningún idioma", () => {
  const es = construirRefuerzoPrecio("es", { titulo: "X", precioFormateado: null, cantidadBase: null });
  const en = construirRefuerzoPrecio("en", { titulo: "X", precioFormateado: null, cantidadBase: null });
  assert.match(es, /no inventes/i);
  assert.match(en, /do not invent/i);
});
