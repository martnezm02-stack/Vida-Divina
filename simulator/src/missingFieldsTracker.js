// missingFieldsTracker.js
// Acumula, durante la ejecución del simulador, cada caso en que el
// asesor experto (según el proceso documentado) necesitaría información,
// una regla o un criterio que hoy NO existe en docs/KNOWLEDGE_MODEL.md ni
// en el Knowledge Compiler. No se inventa el dato — se registra el
// hallazgo con las 4 dimensiones pedidas para este sprint, más la
// conversación de prueba que lo evidenció.
//
// Principio rector de este sprint: "el simulador no debe inventar el
// proceso comercial". Este archivo es el mecanismo concreto para cumplir
// esa regla sin fallar silenciosamente — cuando falta algo, se declara.

const hallazgos = new Map(); // key: informacionFaltante -> registro acumulado

/**
 * @param {Object} params
 * @param {string} params.informacionFaltante - qué información falta
 * @param {string} params.momento - en qué momento de la conversación fue necesaria
 * @param {string} params.porQue - por qué es necesaria
 * @param {string} params.dondeIncorporar - dónde debería incorporarse en la arquitectura
 * @param {string} params.conversacionEvidencia - qué conversación de prueba lo evidenció
 */
export function registrarHallazgo({ informacionFaltante, momento, porQue, dondeIncorporar, conversacionEvidencia }) {
  if (!hallazgos.has(informacionFaltante)) {
    hallazgos.set(informacionFaltante, {
      informacion_faltante: informacionFaltante,
      momento_de_la_conversacion: momento,
      por_que_es_necesaria: porQue,
      donde_deberia_incorporarse: dondeIncorporar,
      conversaciones_que_lo_evidenciaron: [],
    });
  }
  const registro = hallazgos.get(informacionFaltante);
  if (!registro.conversaciones_que_lo_evidenciaron.includes(conversacionEvidencia)) {
    registro.conversaciones_que_lo_evidenciaron.push(conversacionEvidencia);
  }
}

export function obtenerHallazgos() {
  return [...hallazgos.values()];
}

export function reiniciarHallazgos() {
  hallazgos.clear();
}
