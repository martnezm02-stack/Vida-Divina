// tools.test.ts — capa de tools real (src/lib/tools/index.ts#executeTool),
// end-to-end SIN pasar por el LLM (no requiere OPENROUTER_API_KEY) y SIN
// tocar WhatsApp/Baileys en ningún momento (no hay sock real en este test).
import { test, before } from "node:test";
import assert from "node:assert/strict";

before(async () => {
  await import("../scripts/env-loader");
});

const TEST_PHONE = "5215599990002HERMESTOOLS";

async function testConversationId(): Promise<number> {
  const { getOrCreateConversation } = await import("../src/lib/db");
  const convo = getOrCreateConversation(TEST_PHONE, "Hermes Tools Test");
  return convo.id;
}

test("buscarProductos: encuentra productos reales del catálogo", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await testConversationId();
  const res = await executeTool("buscarProductos", { consulta: "tongkat" }, { conversationId });
  assert.equal(res.ok, true);
  assert.ok((res.encontrados as number) > 0);
});

test("consultarProducto: trae contenido real, nunca inventado", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await testConversationId();
  const res = await executeTool("consultarProducto", { producto: "tongkat" }, { conversationId });
  assert.equal(res.ok, true);
  assert.equal(res.encontrado, true);
  assert.ok((res.contenido as string).length > 50);
});

test("buscarTestimonios: contra el registry real", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await testConversationId();
  const res = await executeTool("buscarTestimonios", { producto: "tedivina" }, { conversationId });
  assert.equal(res.ok, true);
  // encontrado puede ser true/false según el registry real -- lo que se
  // verifica es que la tool responde con la forma esperada, nunca inventa.
  assert.equal(typeof res.encontrado, "boolean");
});

test("buscarTestimonios: producto sin testimonio explícito asociado -> encontrado:false, honesto (nunca uno genérico de otro producto) (FIX 2026-09-11)", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await testConversationId();
  // Hallazgo real anterior (QA conversacional, 2026-09-04): needTags sin
  // match reintentaba sin ese filtro y terminaba devolviendo un testimonio
  // genérico (productId:null) sin relación real con el producto pedido --
  // ese reintento (buscarTestimoniosHandler) sigue existiendo, pero ahora
  // el resultado final exige que el testimonio esté EXPLÍCITAMENTE asociado
  // al producto resuelto (ver commercialMedia.ts#searchTestimonials). El
  // registry real hoy no tiene ningún testimonio así para "tongkat", así
  // que lo honesto es encontrado:false, nunca el testimonio de otro producto.
  const res = await executeTool("buscarTestimonios", { producto: "tongkat", necesidad: "energia-inexistente-xyz" }, { conversationId });
  assert.equal(res.ok, true);
  assert.equal(res.encontrado, false, "no debe devolver un testimonio genérico sin relación real con el producto");
});

test("verificarClaim: bloquea un claim médico no respaldado", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await testConversationId();
  const res = await executeTool(
    "verificarClaim",
    { producto: "tongkat", afirmacion: "Esto cura la disfunción eréctil, resultado garantizado." },
    { conversationId }
  );
  assert.equal(res.ok, true);
  assert.equal(res.approved, false);
});

test("qualifyLead: escribe la calificación real en el CRM (si está configurado)", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const { crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const conversationId = await testConversationId();
  // producto_id es NOT NULL en el schema real: se pasa un producto real
  // (resuelto internamente contra el catálogo, ver calificar-crm.ts) para
  // que la oportunidad se pueda escribir de verdad.
  const res = await executeTool("qualifyLead", { temperatura: "Templado", producto: "tongkat" }, { conversationId });
  if (crmConfigured()) {
    assert.equal(res.ok, true, res.message as string);
  } else {
    assert.equal(res.ok, false);
  }
});

test("guardarLead: registra el contacto real en el CRM además de la memoria/Airtable", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const { getOrCreateConversationContext, crmConfigured } = await import("../src/lib/vidaDivina/crmClient");
  const conversationId = await testConversationId();
  const res = await executeTool("guardarLead", { nombre: "Hermes Tools Test" }, { conversationId });
  assert.equal(res.ok, true);
  if (crmConfigured()) {
    // guardarLead escribe en el CRM real de forma best-effort (void, no
    // bloquea la respuesta) -- se comprueba aparte que el contexto real
    // quedó creado para este teléfono.
    const ctx = await getOrCreateConversationContext(TEST_PHONE);
    assert.ok(ctx.customerId);
  }
});

test("derivarHumano: pasa la conversación a modo HUMAN de verdad", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const { getConversationById } = await import("../src/lib/db");
  const conversationId = await testConversationId();
  const res = await executeTool("derivarHumano", { razon: "prueba automatizada", tipo: "reclamo" }, { conversationId });
  assert.equal(res.ok, true);
  const convo = getConversationById(conversationId);
  assert.equal(convo?.mode, "HUMAN");
});

test("derivarHumano tipo='compra': instruye la frase de cierre EXACTA (FASE handoff comercial, 2026-09-04)", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await testConversationId();
  const res = await executeTool(
    "derivarHumano",
    { razon: "Lead listo para comprar Tongkat", tipo: "compra", producto: "Tongkat Ali", prioridad: "alta" },
    { conversationId }
  );
  assert.equal(res.ok, true);
  assert.match(res.instruccion as string, /Perfecto, ya tengo lo necesario para ayudarte con tu pedido\./);
});

test("derivarHumano tipo='persona': instruye continuidad natural, nunca anuncia la transferencia", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await testConversationId();
  const res = await executeTool("derivarHumano", { razon: "Pide hablar con alguien", tipo: "persona" }, { conversationId });
  assert.equal(res.ok, true);
  const instruccion = (res.instruccion as string).toLowerCase();
  assert.ok(!instruccion.includes("perfecto, ya tengo lo necesario"));
  assert.match(instruccion, /sin anunciar/);
});

test("derivarHumanoDefinition: cubre explícitamente 'no quiero hablar con un bot' (hallazgo QA adversarial, 2026-09-04)", async () => {
  const { derivarHumanoDefinition } = await import("../src/lib/tools/derivar-humano");
  const desc = derivarHumanoDefinition.function.description.toLowerCase();
  assert.match(desc, /no quiero hablar con un bot/);
  assert.match(desc, /p[aá]same con alguien/);
});

test("enviarMediaDefinition: prohíbe narrar un envío sin haber llamado a la tool (hallazgo QA adversarial, 2026-09-04)", async () => {
  const { enviarMediaDefinition } = await import("../src/lib/tools/enviar-media");
  const desc = enviarMediaDefinition.function.description.toLowerCase();
  assert.match(desc, /regla dura/);
  assert.match(desc, /otro/);
});

// FASE "Voice Engine automático + generador de voz" (2026-09-04) --
// buscarAsset ahora requiere identidad ADMIN real (ver FASE "Identidad
// administrativa y permisos de Hermes" más abajo): estos tests usan una
// conversación con el teléfono ADMIN real configurado en .env.local.
async function adminConversationId(): Promise<number> {
  const { getOrCreateConversation } = await import("../src/lib/db");
  const adminPhone = (process.env.HERMES_ADMIN_PHONE ?? "").replace(/[^\d]/g, "");
  const convo = getOrCreateConversation(adminPhone, "Hermes Admin Test");
  return convo.id;
}

test("buscarAsset (ADMIN real): resuelve un Asset real guardado desde el generador de voz del Dashboard", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await adminConversationId();
  const res = await executeTool("buscarAsset", { nombre: "bienvenida-vive-vida-divina" }, { conversationId });
  assert.equal(res.ok, true);
  assert.equal(res.denegado, undefined, "el admin real nunca debe recibir denegado");
  assert.equal(res.encontrado, true, "requiere haber corrido PRUEBA B/C del generador de voz al menos una vez en este entorno");
  assert.ok(res.mediaId);
});

test("buscarAsset (ADMIN real): nombre inexistente -> honesto, nunca inventa un mediaId", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await adminConversationId();
  const res = await executeTool("buscarAsset", { nombre: "audio-que-no-existe-xyz" }, { conversationId });
  assert.equal(res.ok, true);
  assert.equal(res.encontrado, false);
});

// ============================================================
// FASE "Identidad administrativa y permisos de Hermes" (2026-09-04)
// ============================================================

test("6) buscarAsset desde el teléfono ADMIN real -> AUTORIZADO", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await adminConversationId();
  const res = await executeTool("buscarAsset", { nombre: "bienvenida-vive-vida-divina" }, { conversationId });
  assert.notEqual(res.denegado, true);
});

test("7) buscarAsset desde un teléfono CLIENTE real -> DENEGADO (aunque lo pida explícitamente)", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const conversationId = await testConversationId(); // TEST_PHONE, no es el admin real
  const res = await executeTool("buscarAsset", { nombre: "bienvenida-vive-vida-divina" }, { conversationId });
  assert.equal(res.ok, true);
  assert.equal(res.denegado, true);
  assert.equal(res.mediaId, undefined, "un CLIENT jamás debe recibir un mediaId real, ni siquiera de un asset que sí existe");
});

test("adminEstadoSistema: ADMIN real -> autorizado, CLIENT real -> denegado", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const admin = await executeTool("adminEstadoSistema", {}, { conversationId: await adminConversationId() });
  assert.notEqual(admin.denegado, true);
  assert.ok("crm" in admin);

  const cliente = await executeTool("adminEstadoSistema", {}, { conversationId: await testConversationId() });
  assert.equal(cliente.denegado, true);
  assert.equal("crm" in cliente, false, "un CLIENT jamás debe recibir datos reales de estado del sistema");
});

test("adminGenerarAudioAsset: CLIENT real -> denegado, nunca genera ni gasta Voice Engine", async () => {
  const { executeTool } = await import("../src/lib/tools/index");
  const res = await executeTool(
    "adminGenerarAudioAsset",
    { texto: "no debería generarse nunca", nombre: "intento-no-autorizado" },
    { conversationId: await testConversationId() }
  );
  assert.equal(res.denegado, true);
  assert.equal(res.mediaId, undefined);
});
