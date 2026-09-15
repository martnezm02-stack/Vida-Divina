// claims.test.ts — política de claims real (PRODUCT_FACT vs MARKETING_CLAIM),
// contra el catálogo real y el clasificador real de content-strategy/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getApprovedClaim } from "../src/lib/vidaDivina/claims";

test("claim respaldado por el catálogo real -> aprobado", async () => {
  const v = await getApprovedClaim("tongkat", "El Café Divina Tongkat Ali contiene reishi y café arábico.");
  assert.equal(v.approved, true, `debería aprobarse (categoría real: ${v.category} — ${v.reasoning})`);
});

test("claim médico/causal sin respaldo -> NUNCA aprobado (guardrail real)", async () => {
  const v = await getApprovedClaim("tongkat", "El Tongkat Ali cura la disfunción eréctil, resultado garantizado.");
  assert.equal(v.approved, false, "un claim de cura/garantía nunca debe aprobarse");
});

test("producto inexistente -> no aprobado, motivo honesto", async () => {
  const v = await getApprovedClaim("producto-inventado-xyz", "Este producto hace maravillas.");
  assert.equal(v.approved, false);
  assert.equal(v.category, "SIN_PRODUCTO");
});
