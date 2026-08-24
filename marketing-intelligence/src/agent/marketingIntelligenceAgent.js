// marketingIntelligenceAgent.js — El cerebro de Marketing Intelligence.
//
// Desacoplado de los adapters: recibe únicamente registros RAW ya
// normalizados por el contrato (src/contract.js) — nunca sabe si vinieron de
// Web, RSS, GitHub, o (en el futuro) X/Meta/YouTube. También está desacoplado
// del proveedor de análisis: solo conoce la interfaz LLMProvider
// (src/llm/llmProvider.js), nunca su implementación concreta — incluida la
// Fase 5 (AnthropicLLMProvider real): el agente nunca importa ni referencia
// Anthropic directamente.
//
// Todo contenido sigue siendo UNTRUSTED EXTERNAL DATA: se etiqueta con
// detectInjectionFlags antes de analizarse, y esas etiquetas viajan con cada
// Observation/Claim generado — nunca alteran el comportamiento del agente.

import { randomUUID } from 'node:crypto';
import { detectInjectionFlags } from '../security/untrustedContent.js';
import { detectClaims } from './heuristics/claims.js';

// Aproximación gruesa de tokens sin tokenizador real — suficiente para un
// límite de seguridad conservador antes de enviar contenido a un LLM real.
const CHARS_PER_TOKEN_ESTIMATE = 4;

export class MarketingIntelligenceAgent {
  constructor({ provider, intelligenceStore, analysisCache, costGuard }) {
    this.provider = provider;
    this.intelligenceStore = intelligenceStore;
    this.analysisCache = analysisCache;
    this.costGuard = costGuard;
  }

  /** Identidad de análisis (Fase 5): provider + model + prompt_version. Cambiar el prompt versiona la identidad — no se reutiliza a ciegas un análisis hecho con un prompt anterior. */
  _analysisIdentity() {
    return `${this.provider.name}::${this.provider.model ?? 'n/a'}::${this.provider.promptVersion ?? 'n/a'}`;
  }

  async analyzeRecord(rawRecord, { forceReanalyze = false } = {}) {
    const identity = this._analysisIdentity();

    if (!forceReanalyze && this.analysisCache.hasAnalyzed(rawRecord.content_hash, identity)) {
      return { skipped: true, reason: 'already_analyzed', ...this.analysisCache.get(rawRecord.content_hash, identity) };
    }

    const estimatedTokens = Math.ceil((rawRecord.content?.length ?? 0) / CHARS_PER_TOKEN_ESTIMATE);
    if (this.costGuard.exceedsTokenLimit(estimatedTokens)) {
      return { skipped: true, reason: 'max_tokens_per_document_exceeded', estimatedTokens };
    }

    const guardCheck = this.costGuard.canProcessOne(this.provider.costPerDocumentUsd);
    if (!guardCheck.allowed) {
      return { skipped: true, reason: guardCheck.reason };
    }

    const contentFlags = detectInjectionFlags(rawRecord.content);
    const context = {
      title: rawRecord.title,
      url: rawRecord.url,
      source: rawRecord.source,
      platform_object_type: rawRecord.platform_object_type,
      metadata: rawRecord.metadata,
    };

    const candidates = await this.provider.analyze(rawRecord.content, context);
    const observations = candidates.map((candidate) => this._toObservation(candidate, rawRecord, contentFlags));
    for (const observation of observations) this.intelligenceStore.save('observation', observation);

    const claimCandidates = detectClaims(rawRecord.content);
    const claims = claimCandidates.map((candidate) => this._toClaim(candidate, rawRecord, contentFlags));
    for (const claim of claims) this.intelligenceStore.save('claim', claim);

    this.costGuard.recordProcessed(this.provider.costPerDocumentUsd);

    // Auditoría de costos (Fase 5, §13): solo se registra cuando el
    // proveedor reportó uso real de una llamada real — nunca para el
    // proveedor heurístico (lastUsage siempre null ahí). Nunca contiene
    // secretos: solo tokens, modelo, prompt_version y costo estimado.
    const usage = this.provider.lastUsage;
    if (usage) {
      this.intelligenceStore.save('cost_audit', {
        audit_id: randomUUID(),
        raw_id: rawRecord.record_id,
        content_hash: rawRecord.content_hash,
        ...usage,
      });
    }

    const detail = {
      observationIds: observations.map((o) => o.observation_id),
      claimIds: claims.map((c) => c.claim_id),
      provider: this.provider.name,
      model: this.provider.model,
      prompt_version: this.provider.promptVersion,
    };
    this.analysisCache.markAnalyzed(rawRecord.content_hash, identity, detail);

    return { skipped: false, observations, claims };
  }

  async analyzeBatch(rawRecords, options = {}) {
    const results = [];
    for (const record of rawRecords) {
      results.push({ raw_id: record.record_id, ...(await this.analyzeRecord(record, options)) });
    }
    return results;
  }

  _toObservation(candidate, rawRecord, contentFlags) {
    const observation = {
      observation_id: randomUUID(),
      raw_id: rawRecord.record_id,
      dimension: candidate.dimension,
      value: candidate.value,
      basis: 'OBSERVADO',
      evidence_quote: candidate.evidence_quote,
      confidence: candidate.confidence,
      confidence_basis: candidate.confidence_basis,
      // requires_human_review (Fase 5, §5): toda observación derivada de una
      // fuente externa es candidata a revisión humana antes de usarse en
      // generación de contenido — nunca se promueve a hecho automáticamente.
      requires_human_review: true,
      detector: this.provider.name,
      model: this.provider.model,
      prompt_version: this.provider.promptVersion,
      content_flags: contentFlags,
      retrieved_at: new Date().toISOString(),
    };
    if (candidate.audience_basis) observation.audience_basis = candidate.audience_basis;
    return observation;
  }

  _toClaim(candidate, rawRecord, contentFlags) {
    return {
      claim_id: randomUUID(),
      raw_id: rawRecord.record_id,
      claim_text: candidate.claim_text,
      claim_type: candidate.claim_type,
      verification_status: 'UNVERIFIED',
      requires_human_review: true,
      confidence: candidate.confidence,
      confidence_basis: candidate.confidence_basis,
      detector: this.provider.name,
      content_flags: contentFlags,
      retrieved_at: new Date().toISOString(),
    };
  }
}
