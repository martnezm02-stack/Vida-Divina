// llmProvider.js — Interfaz abstracta para cualquier motor de análisis
// (heurístico hoy, un modelo de lenguaje real más adelante).
//
// El Marketing Intelligence Agent (src/agent/marketingIntelligenceAgent.js)
// SOLO conoce esta interfaz — nunca sabe si el proveedor concreto es
// heurístico, Anthropic, OpenAI o cualquier otro. Cambiar de proveedor no
// requiere tocar el agente, solo instanciar una subclase distinta.
//
// Contrato de analyze(content, context):
//   - content: string — el contenido crudo de UN registro RAW. Es siempre
//     UNTRUSTED EXTERNAL DATA (ver src/security/untrustedContent.js):
//     un proveedor real debe pasarlo aislado del system prompt, nunca
//     concatenado con instrucciones (ver src/llm/promptIsolation.js).
//   - context: { title, url, source, platform_object_type, metadata } —
//     metadata normalizada del contrato (src/contract.js). NUNCA incluye
//     credenciales ni información de cuentas.
//   - devuelve: array de "candidatos" { dimension, value, evidence_quote,
//     confidence, confidence_basis, audience_basis? } — el agente es quien
//     les asigna ids, basis OBSERVADO, raw_id y los persiste.

export class LLMProvider {
  get name() {
    throw new Error('LLMProvider: la propiedad "name" debe implementarse en la subclase');
  }

  /** Costo estimado en USD de analizar UN documento — 0 para proveedores sin costo real. */
  get costPerDocumentUsd() {
    return 0;
  }

  /** Id de modelo real usado (Fase 5) — null si el proveedor no llama a un modelo (ej. heurístico). */
  get model() {
    return null;
  }

  /** Versión del prompt usado (Fase 5) — null si no aplica. Forma parte de la identidad del análisis en AnalysisCache. */
  get promptVersion() {
    return null;
  }

  /** Uso/costo real de la última llamada (Fase 5) — null si no hubo llamada real o el proveedor no la reporta. */
  get lastUsage() {
    return null;
  }

  // eslint-disable-next-line no-unused-vars
  async analyze(content, context) {
    throw new Error('LLMProvider.analyze() debe implementarse en la subclase');
  }
}
