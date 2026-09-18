// skillRegistry.ts — Operación mínima CREATE/STAGE -> REVIEW -> ACTIVATE.
// No es un CRUD general de skills.
//
// Decisión de seguridad deliberada: ACTIVATE nunca escribe directamente
// sobre `src/lib/tools/index.ts` (el router real de tools que usa el bot
// de producción) de forma automática, ni siquiera con review APPROVED.
// En vez de eso, genera el PARCHE exacto que un desarrollador aplicaría
// siguiendo el patrón real ya documentado (docs/00 y docs/04 de
// hermes-kit), y dependimos de esa aplicación manual como el último acto
// de HumanReview antes de que la skill entre en el tool-list real que ve
// el bot en cada conversación. Esto respeta la regla explícita "no
// instalar automáticamente una skill aprendida en producción" sin
// renunciar a la capacidad real de generar el registro correcto.

import fs from "node:fs";
import path from "node:path";
import type { RegistryState } from "./types";
import { getReview } from "./skillReview";

function statePath(stagingDir: string): string {
  return path.join(stagingDir, "registry-state.json");
}

export function getState(stagingDir: string): RegistryState {
  const p = statePath(stagingDir);
  if (!fs.existsSync(p)) return "STAGED";
  return JSON.parse(fs.readFileSync(p, "utf-8")).state;
}

function setState(stagingDir: string, state: RegistryState) {
  fs.writeFileSync(statePath(stagingDir), JSON.stringify({ state, updatedAt: new Date().toISOString() }, null, 2), "utf-8");
}

export interface ActivationResult {
  ok: boolean;
  state: RegistryState;
  reason: string;
  registrationPatchPath?: string;
}

function buildRegistrationPatch(skillId: string, toolName: string): string {
  return [
    `# Registration patch para "${toolName}" (skill ${skillId})`,
    "",
    "Aplicar manualmente en hermes-kit/src/lib/tools/index.ts siguiendo el patrón real (docs/00, docs/04):",
    "",
    "1. Añadir el import del nuevo tool file:",
    `   import { ${toolName}Definition, ${toolName}Handler } from "./${toolName}";`,
    "",
    "2. Añadir la definición al array `toolDefinitions`:",
    `   ${toolName}Definition,`,
    "",
    "3. Registrar el handler en el objeto `handlers`:",
    `   ${toolName}: (args) => ${toolName}Handler(args as unknown as Parameters<typeof ${toolName}Handler>[0]),`,
    "",
    "Este parche NO se aplica automáticamente. La activación real sobre el bot de producción requiere que un desarrollador lo revise y lo aplique a mano -- ese es el punto final de HumanReview antes de que la skill entre en el tool-list real.",
  ].join("\n");
}

/**
 * Activa una skill APROBADA. Requiere review.json con decision === APPROVED.
 * Nunca activa una REJECTED/NEEDS_REVISION. "Activar" = generar el parche
 * de registro real (dry-run respecto al index.ts de producción, ver
 * comentario de cabecera).
 */
export function activate(stagingDir: string, skillId: string, toolName: string): ActivationResult {
  const review = getReview(stagingDir);
  if (!review) {
    return { ok: false, state: "STAGED", reason: "No existe review.json -- la skill no ha pasado por HumanReview." };
  }
  if (review.decision !== "APPROVED") {
    setState(stagingDir, "REJECTED_NOT_ACTIVATED");
    return { ok: false, state: "REJECTED_NOT_ACTIVATED", reason: `Review = ${review.decision}. Una skill no aprobada nunca se activa.` };
  }
  const patch = buildRegistrationPatch(skillId, toolName);
  const patchPath = path.join(stagingDir, "REGISTRATION_PATCH.md");
  fs.writeFileSync(patchPath, patch, "utf-8");
  setState(stagingDir, "ACTIVATED_PENDING_MANUAL_MERGE");
  return {
    ok: true,
    state: "ACTIVATED_PENDING_MANUAL_MERGE",
    reason: "Review APPROVED. Parche de registro generado; falta aplicación manual sobre index.ts real por un desarrollador.",
    registrationPatchPath: patchPath,
  };
}
