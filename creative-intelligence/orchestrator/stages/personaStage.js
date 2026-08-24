// personaStage.js — Pillar 1 (Prompts 1 + 2) como etapa ejecutable.
//
// NO reimplementa ninguna regla de Persona — toda la validación real
// (TYPE OF CUSTOMER, no-awareness, 3-5 verbatim con fuente, coverage
// states, confidence/evidenceType) vive en src/persona.js y se invoca tal
// cual. Esta stage solo: (a) resuelve evidenceIds reales contra el
// evidenceIndex del ciclo — nunca acepta una frase suelta sin id real
// detrás, (b) clasifica automáticamente evidenceType/confidence a partir
// del dominio de la evidencia citada (nunca lo decide el candidato a
// mano), y (c) aísla candidatos inválidos como warnings en vez de abortar
// todo el lote.

import { createPersona, evaluateSubPersonaSplit } from '../../src/persona.js';
import { resolveEvidenceIds } from './evidenceIndex.js';

// Un candidato de Persona SOLO puede citar evidencia de estos 2 dominios
// — regla explícita de esta fase ("Competitive/Affiliate ≠ Customer"),
// ya establecida en fases anteriores (assertNotCompetitiveSourceForCustomerEvidence,
// evidenceProvenance.js) y aplicada aquí en el punto de construcción, no
// solo como convención.
const PERSONA_ALLOWED_DOMAINS = new Set(['MARKET_EVIDENCE', 'CUSTOMER_EVIDENCE']);

function deriveEvidenceClassification(resolvedEntries, { requestCustomerValidated }) {
  const offDomain = resolvedEntries.find((e) => !PERSONA_ALLOWED_DOMAINS.has(e.domain));
  if (offDomain) {
    throw new Error(
      `personaStage: la evidencia "${offDomain.record.evidenceId}" es de dominio ${offDomain.domain} — una Persona nunca puede fundamentarse en evidencia competitiva, de afiliados o de marca (esa evidencia puede aparecer como contexto de una Opportunity, nunca como base de una Persona).`
    );
  }
  const domains = new Set(resolvedEntries.map((e) => e.domain));
  if (domains.size === 1 && domains.has('CUSTOMER_EVIDENCE')) {
    return { evidenceType: 'CUSTOMER_EVIDENCE', confidence: requestCustomerValidated ? 'CUSTOMER_VALIDATED' : 'PROVISIONAL' };
  }
  // MARKET_EVIDENCE solo, o mezcla MARKET+CUSTOMER: el techo sigue siendo
  // PROVISIONAL — CUSTOMER_VALIDATED exige evidencia 100% de cliente real.
  return { evidenceType: 'MARKET_EVIDENCE', confidence: 'PROVISIONAL' };
}

/**
 * @param {{
 *   personaCandidates: Array<{
 *     name: string, lifeSituation: string, painContext?: string, relationshipToProblem: string,
 *     whatTheyveTried?: string, whatTheyFear?: string, whatTheyWant?: string,
 *     verbatimEvidenceIds: string[],           // 3-5 ids reales, nunca texto suelto
 *     whyRespondToBrand?: string, coverageState?: string, subPersonaOf?: string|null,
 *     requestCustomerValidated?: boolean,       // default false → confidence PROVISIONAL
 *     subPersonaSplitSignals?: object,          // opcional, ver evaluateSubPersonaSplit
 *   }>,
 *   evidenceIndex: Map,
 * }}
 */
export function runPersonaStage({ personaCandidates, evidenceIndex }) {
  if (!Array.isArray(personaCandidates) || personaCandidates.length === 0) {
    throw new Error('runPersonaStage: se requiere al menos 1 personaCandidate real.');
  }

  const personas = [];
  const subPersonaDecisions = [];
  const warnings = [];

  for (const candidate of personaCandidates) {
    try {
      const resolvedEntries = resolveEvidenceIds(evidenceIndex, candidate.verbatimEvidenceIds, { stageName: 'personaStage' });

      // El gate de dominio (¿puede esta evidencia fundamentar una Persona?)
      // corre ANTES de exigir la forma del record (verbatimQuote) — un
      // registro competitivo debe rechazarse por su dominio, no por
      // casualmente carecer de un campo que ese dominio nunca tuvo.
      const { evidenceType, confidence } = deriveEvidenceClassification(resolvedEntries, {
        requestCustomerValidated: candidate.requestCustomerValidated === true,
      });

      const verbatimPhrases = resolvedEntries.map(({ record }) => {
        if (!record.verbatimQuote?.trim()) {
          throw new Error(`personaStage: el registro "${record.evidenceId}" no tiene "verbatimQuote" real — no se puede citar como lenguaje espontáneo de cliente.`);
        }
        return { phrase: record.verbatimQuote, sourceCitation: `${record.evidenceId} — ${record.sourcePlatform ?? record.source ?? 'fuente no especificada'}` };
      });

      const persona = createPersona({
        name: candidate.name,
        lifeSituation: candidate.lifeSituation,
        painContext: candidate.painContext ?? null,
        relationshipToProblem: candidate.relationshipToProblem,
        whatTheyveTried: candidate.whatTheyveTried ?? null,
        whatTheyFear: candidate.whatTheyFear ?? null,
        whatTheyWant: candidate.whatTheyWant ?? null,
        verbatimPhrases,
        whyRespondToBrand: candidate.whyRespondToBrand ?? 'INSUFFICIENT_EVIDENCE',
        coverageState: candidate.coverageState ?? 'Not Running',
        subPersonaOf: candidate.subPersonaOf ?? null,
        confidence,
        evidenceType,
        evidenceIds: resolvedEntries.map((e) => e.record.evidenceId),
      });
      personas.push(persona);

      if (candidate.subPersonaSplitSignals) {
        subPersonaDecisions.push({ forPersonaName: candidate.name, decision: evaluateSubPersonaSplit(candidate.subPersonaSplitSignals) });
      }
    } catch (err) {
      warnings.push({ type: 'PERSONA_CANDIDATE_REJECTED', candidateName: candidate?.name ?? 'UNKNOWN', reason: err.message });
    }
  }

  if (personas.length === 0) {
    warnings.push({ type: 'INSUFFICIENT_DATA', stage: 'persona', reason: 'Ningún personaCandidate produjo una Persona válida — ver PERSONA_CANDIDATE_REJECTED arriba para el detalle.' });
  }

  return { personas, subPersonaDecisions, warnings };
}
