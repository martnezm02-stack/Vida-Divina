// costGuard.js — Control de costos y límites del análisis (§16 del encargo).
//
// max_llm_budget_usd por defecto es 0: un proveedor con costo real (ej.
// AnthropicLLMProvider, $0.01/documento estimado) NO PUEDE procesar nada
// hasta que alguien eleve explícitamente este valor. El proveedor heurístico
// de esta fase cuesta $0, así que funciona con el presupuesto por defecto.
//
// Regla dura: al alcanzar cualquier límite, se detiene — nunca se busca una
// ruta alternativa para seguir gastando o procesando.

export class CostGuard {
  constructor({ maxLlmBudgetUsd = 0, maxDocumentsPerRun = Infinity, maxTokensPerDocument = Infinity } = {}) {
    this.maxLlmBudgetUsd = maxLlmBudgetUsd;
    this.maxDocumentsPerRun = maxDocumentsPerRun;
    this.maxTokensPerDocument = maxTokensPerDocument;
    this.spentUsd = 0;
    this.documentsProcessed = 0;
  }

  /** Fase 5: verifica el límite de tokens por documento antes de enviarlo a un LLM real. */
  exceedsTokenLimit(estimatedTokens) {
    return estimatedTokens > this.maxTokensPerDocument;
  }

  canProcessOne(estimatedCostUsd = 0) {
    if (this.documentsProcessed >= this.maxDocumentsPerRun) {
      return { allowed: false, reason: 'max_documents_per_run_reached' };
    }
    if (this.spentUsd + estimatedCostUsd > this.maxLlmBudgetUsd) {
      return { allowed: false, reason: 'max_llm_budget_usd_reached' };
    }
    return { allowed: true };
  }

  recordProcessed(costUsd = 0) {
    this.spentUsd += costUsd;
    this.documentsProcessed += 1;
  }

  get summary() {
    return {
      spentUsd: this.spentUsd,
      documentsProcessed: this.documentsProcessed,
      maxLlmBudgetUsd: this.maxLlmBudgetUsd,
      maxDocumentsPerRun: this.maxDocumentsPerRun,
    };
  }
}
