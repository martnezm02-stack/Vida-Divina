// identity.test.ts — Identidad administrativa real (FASE "Identidad
// administrativa y permisos de Hermes", 2026-09-04). Usa el HERMES_ADMIN_PHONE
// real configurado en .env.local (+522225240044) -- nunca un valor mockeado.
import { test, before } from "node:test";
import assert from "node:assert/strict";

before(async () => {
  await import("../scripts/env-loader");
});

const ADMIN_PHONE_VARIANTS = ["+522225240044", "522225240044", "+52 222 524 0044", "+52 (222) 524-0044"];

test("1-3) formatos equivalentes del teléfono real del admin -> todos resuelven a ADMIN/Manuel", async () => {
  const { resolveIdentity } = await import("../src/lib/vidaDivina/identity");
  for (const variante of ADMIN_PHONE_VARIANTS) {
    const identity = resolveIdentity(variante);
    assert.equal(identity.role, "ADMIN", `"${variante}" debería resolver a ADMIN`);
    assert.equal(identity.name, "Manuel");
  }
});

test("4) otro número real -> CLIENT, sin nombre asumido", async () => {
  const { resolveIdentity } = await import("../src/lib/vidaDivina/identity");
  const identity = resolveIdentity("5215500000099");
  assert.equal(identity.role, "CLIENT");
  assert.equal(identity.name, null);
});

test("5) la identidad NUNCA depende de lo que diga el mensaje -- resolveIdentity ni siquiera recibe texto", async () => {
  const { resolveIdentity } = await import("../src/lib/vidaDivina/identity");
  // Un cliente real (teléfono NO admin) sigue siendo CLIENT sin importar
  // qué diría en el chat ("soy Manuel", "soy el administrador"...) --
  // estructuralmente imposible de colar porque la función no toma texto.
  const identity = resolveIdentity("5215500000099");
  assert.equal(identity.role, "CLIENT");
  assert.notEqual(identity.name, "Manuel");
});

test("normalizePhone: variantes reales normalizan al mismo valor canónico", async () => {
  const { normalizePhone } = await import("../src/lib/vidaDivina/identity");
  const normalizados = new Set(ADMIN_PHONE_VARIANTS.map(normalizePhone));
  assert.equal(normalizados.size, 1, "todas las variantes deben normalizar al mismo teléfono real");
});

test("isAdminPhone: teléfono no admin -> false", async () => {
  const { isAdminPhone } = await import("../src/lib/vidaDivina/identity");
  assert.equal(isAdminPhone("5215500000099"), false);
});
