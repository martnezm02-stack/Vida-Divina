// hooksAndAngles.js — Detectores basados en reglas de texto (NO en un modelo
// de lenguaje) para HOOK, CURIOSITY_GAP y ANGLE. Cada detección incluye un
// evidence_quote literal tomado del propio contenido y una confidence con su
// justificación explícita (§9 del encargo).

function quoteAround(text, index, matchLength, pad = 25) {
  return text.slice(Math.max(0, index - pad), index + matchLength + pad).trim();
}

const CURIOSITY_KEYWORDS = ['secreto', 'secret', "you won't believe", 'no vas a creer', 'lo que nadie te dice'];
const STAT_PATTERN = /\b\d{1,3}(\.\d+)?%|\b\d+\s*(?:de|of)\s*\d+\b/i;
const COMPARISON_PATTERN = /\bvs\.?\b|\bbetter than\b|\bmejor que\b/i;
const HOWTO_PATTERN = /\bhow to\b|\bcómo\s+\w*\s*(hacer|lograr|crear|conseguir)/i;

export function detectHooksAndAngles(content, context) {
  const results = [];
  const opening = `${context?.title ?? ''} ${content.slice(0, 200)}`;
  const lowerOpening = opening.toLowerCase();

  const questionMatch = opening.match(/[^.?!]*\?/);
  if (questionMatch) {
    results.push({
      dimension: 'HOOK',
      value: 'pregunta',
      evidence_quote: questionMatch[0].trim(),
      confidence: 0.7,
      confidence_basis: 'Coincidencia directa de signo de interrogación en la apertura/título.',
    });
  }

  const statMatch = opening.match(STAT_PATTERN);
  if (statMatch) {
    results.push({
      dimension: 'HOOK',
      value: 'estadística',
      evidence_quote: quoteAround(opening, statMatch.index, statMatch[0].length),
      confidence: 0.6,
      confidence_basis: 'Coincidencia de patrón numérico/porcentual en la apertura.',
    });
  }

  for (const kw of CURIOSITY_KEYWORDS) {
    const idx = lowerOpening.indexOf(kw);
    if (idx !== -1) {
      const quote = quoteAround(opening, idx, kw.length);
      results.push({
        dimension: 'HOOK', value: 'curiosidad', evidence_quote: quote,
        confidence: 0.5, confidence_basis: `Coincidencia de palabra clave de curiosidad ("${kw}").`,
      });
      results.push({
        dimension: 'CURIOSITY_GAP', value: 'brecha_de_curiosidad_explicita', evidence_quote: quote,
        confidence: 0.5, confidence_basis: `Misma coincidencia ("${kw}") interpretada como brecha de curiosidad deliberada.`,
      });
      break;
    }
  }

  const lowerFull = content.toLowerCase();
  const comparisonMatch = lowerFull.match(COMPARISON_PATTERN);
  if (comparisonMatch) {
    results.push({
      dimension: 'ANGLE', value: 'comparación',
      evidence_quote: quoteAround(content, comparisonMatch.index, comparisonMatch[0].length),
      confidence: 0.5, confidence_basis: 'Coincidencia de marcador de comparación ("vs", "mejor que").',
    });
  }

  const howToMatch = lowerFull.match(HOWTO_PATTERN);
  if (howToMatch) {
    results.push({
      dimension: 'ANGLE', value: 'educación',
      evidence_quote: quoteAround(content, howToMatch.index, howToMatch[0].length),
      confidence: 0.5, confidence_basis: 'Patrón instruccional ("how to" / "cómo hacer/lograr/conseguir...").',
    });
  }

  return results;
}
