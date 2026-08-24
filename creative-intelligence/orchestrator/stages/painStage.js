// painStage.js — Pillar 2 (Prompts 3 + 4) como etapa ejecutable.
//
// NO reimplementa ninguna regla de Pain — la validación real (verbatim +
// fuente obligatorios, HIGH-FREQUENCY ANCHOR a partir de frequency≥3)
// vive en src/pain.js. El único valor que esta stage agrega: `frequency`
// se DERIVA contando cuántos evidenceIds reales distintos respaldan el
// mismo painCandidate — nunca se acepta como número declarado a mano, que
// es exactamente el punto donde un ciclo manual podría inflar un anchor
// sin evidencia real detrás.

import { createPain, comparePainDepth, groupByCluster } from '../../src/pain.js';
import { resolveEvidenceIds } from './evidenceIndex.js';

// Mismo límite que personaStage: un Pain de cliente nunca se funda en
// evidencia competitiva/de afiliados/de marca.
const PAIN_ALLOWED_DOMAINS = new Set(['MARKET_EVIDENCE', 'CUSTOMER_EVIDENCE']);

/**
 * @param {{
 *   painCandidates: Array<{
 *     personaId: string, painPoint: string, plainCustomerLanguage?: string,
 *     supportingEvidenceIds: string[],   // frequency = supportingEvidenceIds.length, derivado
 *     cluster?: string, confidence?: string,
 *     pressureTest?: { surfaceSymptom: string, rootPain: string },
 *   }>,
 *   evidenceIndex: Map,
 * }}
 */
export function runPainStage({ painCandidates, evidenceIndex }) {
  if (!Array.isArray(painCandidates) || painCandidates.length === 0) {
    throw new Error('runPainStage: se requiere al menos 1 painCandidate real.');
  }

  const pains = [];
  const pressureTests = [];
  const warnings = [];

  for (const candidate of painCandidates) {
    try {
      const resolved = resolveEvidenceIds(evidenceIndex, candidate.supportingEvidenceIds, { stageName: 'painStage' });
      const offDomain = resolved.find((e) => !PAIN_ALLOWED_DOMAINS.has(e.domain));
      if (offDomain) {
        throw new Error(
          `painStage: la evidencia "${offDomain.record.evidenceId}" es de dominio ${offDomain.domain} — un Pain de cliente nunca puede fundarse en evidencia competitiva, de afiliados o de marca convertida en pain de cliente.`
        );
      }
      const primary = resolved[0];
      if (!primary.record.verbatimQuote?.trim()) {
        throw new Error(`painStage: el registro "${primary.record.evidenceId}" no tiene "verbatimQuote" real.`);
      }

      const pain = createPain({
        personaId: candidate.personaId,
        painPoint: candidate.painPoint,
        plainCustomerLanguage: candidate.plainCustomerLanguage ?? null,
        verbatimQuote: primary.record.verbatimQuote,
        sourcePlatform: primary.record.sourcePlatform ?? primary.record.source ?? 'UNKNOWN',
        frequency: resolved.length,
        cluster: candidate.cluster ?? null,
        confidence: candidate.confidence ?? 'PROVISIONAL',
      });
      pains.push(pain);

      if (candidate.pressureTest) {
        pressureTests.push({ painId: pain.painId, result: comparePainDepth(candidate.pressureTest) });
      }
    } catch (err) {
      warnings.push({ type: 'PAIN_CANDIDATE_REJECTED', painPoint: candidate?.painPoint ?? 'UNKNOWN', reason: err.message });
    }
  }

  if (pains.length === 0) {
    warnings.push({ type: 'INSUFFICIENT_DATA', stage: 'pain', reason: 'Ningún painCandidate produjo un Pain válido — ver PAIN_CANDIDATE_REJECTED arriba para el detalle.' });
  }

  return { pains, pressureTests, clusters: groupByCluster(pains), warnings };
}
