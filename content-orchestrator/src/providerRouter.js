// providerRouter.js — Creative Production Orchestrator (2026-08-24).
// ProviderRouter real: selecciona, por task, el primer provider real
// configurado de una lista de candidatos YA ordenada por prioridad real
// (costo primero -- local/gratis antes que un proveedor externo pagado).
// Inspirado en el scoring multi-dimensión de OpenMontage (task fit,
// calidad, costo, latencia, disponibilidad) pero DELIBERADAMENTE
// simplificado a "primer candidato real configurado" -- con 1-2
// candidatos reales por task hoy, un scorer de 7 dimensiones sería
// sobre-ingeniería (Paso 22 del encargo). La lista de candidatos, no este
// router, es donde vive la prioridad real -- extender la prioridad es
// reordenar esa lista, nunca tocar este archivo.
//
// Deja una decisión auditable real (chosen/alternatives/reason) -- mismo
// espíritu que el "decision trail" de OpenMontage, sin su complejidad.

export const PROVIDER_TASKS = Object.freeze(['image', 'video', 'music', 'enhancement']);

/**
 * @param {{task:string, candidates:Array<{provider:object, estimatedCost?:number}>}} args
 * @returns {{task:string, chosen:?object, chosenEstimatedCost:?number, alternatives:object[], reason:string}}
 */
export function selectProvider({ task, candidates }) {
  if (!PROVIDER_TASKS.includes(task)) throw new Error(`selectProvider: "task" inválido "${task}" (válidos: ${PROVIDER_TASKS.join(', ')}).`);
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('selectProvider: "candidates" debe ser un arreglo real no vacío, ya ordenado por prioridad (costo/calidad).');

  const evaluados = candidates.map((c) => ({
    providerName: c.provider.providerName,
    configured: c.provider.isConfigured(),
    estimatedCost: c.estimatedCost ?? 0,
  }));

  const elegidoIndex = candidates.findIndex((c) => c.provider.isConfigured());
  if (elegidoIndex === -1) {
    return Object.freeze({
      task, chosen: null, chosenEstimatedCost: null,
      alternatives: Object.freeze(evaluados),
      reason: `selectProvider: ningún candidato real para "${task}" está configurado (${evaluados.map((e) => e.providerName).join(', ')}) -- ninguno tiene credenciales/asset real disponible.`,
    });
  }

  return Object.freeze({
    task,
    chosen: candidates[elegidoIndex].provider,
    chosenEstimatedCost: candidates[elegidoIndex].estimatedCost ?? 0,
    alternatives: Object.freeze(evaluados),
    reason: `selectProvider: "${evaluados[elegidoIndex].providerName}" es el primer candidato real configurado para "${task}" (prioridad real: costo/disponibilidad, ver orden de "candidates").`,
  });
}
