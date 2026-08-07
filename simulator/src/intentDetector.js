// intentDetector.js
// Paso 1-2 del flujo: "Comprender la intención" e "Identificar objetivo",
// según docs/agente_ia/flujo_de_razonamiento.md. Aplica las reglas de
// rules.js en el orden de prioridad ya documentado en
// docs/agente_ia/prioridades.md (Seguridad primero, siempre).
//
// Límite explícito y declarado: la comparación de texto contra patrones es
// una necesidad de implementación de CUALQUIER simulador sin IA — no hay
// forma de "comprender la intención" sin algún mecanismo de coincidencia
// de texto. Este mecanismo (regex de palabras clave) NO proviene del
// Knowledge Model ni del Knowledge Compiler — es una decisión de este
// sprint, declarada como tal, no presentada como si fuera conocimiento
// compilado. Ver docs/CONVERSATION_SIMULATOR.md, "Campos faltantes".

import { SENAL_MEDICA, SENALES_PERFIL, SENAL_PRECIO, calificarCliente } from './rules.js';

/**
 * @param {string} mensaje
 * @returns {{tipo: string, perfilId: string|null, fuente: string, calificacion: Object}}
 */
export function detectarIntencion(mensaje) {
  const calificacion = calificarCliente(mensaje);

  // Prioridad 1 (docs/agente_ia/prioridades.md): Seguridad, sin excepción.
  if (SENAL_MEDICA.patrones.some((p) => p.test(mensaje))) {
    return { tipo: 'senal_medica', perfilId: null, fuente: SENAL_MEDICA.fuente, calificacion };
  }

  // Prioridad 2-3: Comprensión / Necesidad del cliente — intentar ubicar un perfil real.
  for (const senal of SENALES_PERFIL) {
    if (senal.patrones.some((p) => p.test(mensaje))) {
      return {
        tipo: 'perfil_identificado',
        perfilId: senal.perfilId,
        fuente: 'docs/clientes/README.md#mapa-rápido-necesidad--primer-producto-de-entrada',
        calificacion,
      };
    }
  }

  // Sin perfil claro, pero con pregunta explícita de precio.
  if (SENAL_PRECIO.patrones.some((p) => p.test(mensaje))) {
    return { tipo: 'pregunta_precio', perfilId: null, fuente: SENAL_PRECIO.fuente, calificacion };
  }

  // Fallback documentado: docs/agente_ia/reglas_de_decision.md, "Perfil desconocido".
  return {
    tipo: 'ambiguo',
    perfilId: 'clientes/bienestar_general',
    fuente: 'docs/agente_ia/reglas_de_decision.md#perfil-desconocido',
    calificacion,
  };
}
