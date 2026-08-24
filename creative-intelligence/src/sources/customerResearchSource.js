// customerResearchSource.js — contrato para una futura fuente de
// investigación de clientes (sales calls, reviews, Reddit, TikTok, YouTube,
// Quora, support tickets). NO existe ningún dataset real de esto en el
// repositorio hoy — este archivo no inventa customer research, solo define
// la forma en que Persona/Pain podrían alimentarse de una fuente real
// cuando exista.

export class CustomerResearchSource {
  get name() {
    throw new Error('CustomerResearchSource: la propiedad "name" debe implementarse en la subclase');
  }

  /**
   * @param {{ personaHint?: string }} query
   * @returns {Promise<{ persona: object|null, pains: object[], verbatimQuotes: object[] }>}
   */
  // eslint-disable-next-line no-unused-vars
  async fetchResearch(query) {
    throw new Error('CustomerResearchSource.fetchResearch() debe implementarse en la subclase');
  }
}

/**
 * @typedef {{ text: string, source: string, frequency: number, confidence: string }} VerbatimQuoteRecord
 * NOTA (Fase 4C): este typedef nunca se implementó ni se usó en ningún
 * lugar del código real (verificado por búsqueda antes de esta fase) --
 * era un boceto aspiracional. StructuredCustomerResearchSource (abajo)
 * devuelve verbatimQuotes con la forma real de CustomerEvidenceRecord
 * (customerEvidenceRecord.js: evidenceId/verbatimQuote/sourcePlatform/
 * provenance), que sí es un contrato real ya consumido por
 * evidenceIndex.js/personaStage.js/painStage.js -- "el contrato real
 * equivalente que determine la arquitectura existente", como pide esta
 * fase, en vez de forzar una forma nunca implementada.
 */

/** Único motor real de esta fase: no hay dataset de customer research todavía, nunca se inventa uno. */
export class NullCustomerResearchSource extends CustomerResearchSource {
  get name() {
    return 'null_customer_research_source';
  }

  async fetchResearch() {
    return { persona: null, pains: [], verbatimQuotes: [] };
  }
}

/**
 * Fase 4C — primera fuente REAL de Customer Research Ingestion. Recibe
 * evidencia YA estructurada y ya vetted por un humano (un arreglo de
 * CustomerEvidenceRecord reales, construidos vía
 * createCustomerEvidenceRecord()) -- nunca hace scraping, crawling,
 * llamadas a un LLM, integración de WhatsApp automático ni ningún
 * conector externo (todo eso, fuera de alcance de esta fase). Es
 * deliberadamente solo INGESTIÓN + RECUPERACIÓN.
 *
 * REGLA CENTRAL (Fase 4, Human Review): fetchResearch() SIEMPRE devuelve
 * persona:null y pains:[] -- esta fuente nunca sintetiza una Persona ni
 * un Pain a partir de la evidencia real. Construir un personaCandidate/
 * painCandidate real a partir de estos verbatims sigue siendo una
 * decisión humana explícita (ver orchestrator/stages/personaStage.js) --
 * exactamente la distinción entre RAW CUSTOMER EVIDENCE (lo que esta
 * fuente ingiere y devuelve) y VALIDATED CUSTOMER INSIGHT (una Persona/
 * Pain real, construida a mano, y solo CUSTOMER_VALIDATED cuando además
 * se solicita explícitamente -- ver Fase 7 para cómo una IA futura podría
 * asistir en ese paso sin fabricar evidencia).
 */
export class StructuredCustomerResearchSource extends CustomerResearchSource {
  #records;

  /** @param {Array<{evidenceId:string, verbatimQuote:string, sourcePlatform:string, provenance:object}>} records */
  constructor(records) {
    super();
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error('StructuredCustomerResearchSource: se requiere un arreglo real de CustomerEvidenceRecord (createCustomerEvidenceRecord()) con al menos 1 elemento -- nunca una fuente vacía o inventada.');
    }
    for (const record of records) {
      if (!record?.evidenceId?.trim?.() || !record?.verbatimQuote?.trim?.() || !record?.sourcePlatform?.trim?.() || !record?.provenance) {
        throw new Error('StructuredCustomerResearchSource: cada registro debe ser un CustomerEvidenceRecord real (evidenceId/verbatimQuote/sourcePlatform/provenance) -- usa createCustomerEvidenceRecord(), nunca un objeto suelto sin esos campos.');
      }
    }
    this.#records = Object.freeze([...records]);
  }

  get name() {
    return 'structured_customer_research_source';
  }

  /**
   * @param {{ personaHint?: string }} query — si se provee, filtra por
   *   coincidencia textual literal contra el verbatim real (nunca
   *   comprensión semántica) -- sin personaHint, devuelve toda la
   *   evidencia real ingerida.
   * @returns {Promise<{ persona: null, pains: [], verbatimQuotes: object[] }>}
   */
  async fetchResearch({ personaHint } = {}) {
    const hint = personaHint?.trim().toLowerCase();
    const matched = hint
      ? this.#records.filter((r) => r.verbatimQuote.toLowerCase().includes(hint))
      : this.#records;
    return { persona: null, pains: [], verbatimQuotes: Object.freeze([...matched]) };
  }

  /** Acceso directo de solo lectura a todos los registros reales ingeridos -- útil para construir un evidenceBatch real sin volver a llamar fetchResearch(). */
  get records() {
    return this.#records;
  }
}
