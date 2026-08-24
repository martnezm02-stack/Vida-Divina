// observation.js — Etapa A del pipeline de Marketing Intelligence: Observación.
//
// Extracción heurística (basada en reglas de texto, NO en un modelo de IA) para
// esta primera versión del MVP. Cada observación queda anclada a un
// evidence_quote tomado literalmente del registro RAW — nunca se afirma algo
// que no esté presente en el texto.
//
// LIMITACIÓN DOCUMENTADA: estas heurísticas son deliberadamente simples
// (búsqueda de patrones de texto). No sustituyen el análisis semántico que
// hará el Marketing Intelligence Agent con un modelo de lenguaje en una fase
// posterior. El objetivo aquí es validar el pipeline completo y la
// trazabilidad extremo a extremo, no la calidad del análisis de marketing.

import { randomUUID } from 'node:crypto';

const CTA_KEYWORDS = [
  'compra ahora', 'haz clic', 'regístrate', 'suscríbete', 'descubre', 'aprende más',
  'buy now', 'sign up', 'click here', 'learn more', 'get started', 'shop now', 'subscribe',
];

const URGENCY_KEYWORDS = [
  'ahora mismo', 'por tiempo limitado', 'solo hoy',
  'limited time', 'today only', 'last chance', 'act now', "don't miss",
];

function findFirstMatch(text, keywords) {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      return text.slice(Math.max(0, idx - 20), idx + kw.length + 20).trim();
    }
  }
  return null;
}

function makeObservation(rawRecord, dimension, value, evidenceQuote) {
  return {
    observation_id: randomUUID(),
    source_record_id: rawRecord.record_id,
    source: rawRecord.source,
    dimension,
    value,
    basis: 'OBSERVADO',
    evidence_quote: evidenceQuote,
    retrieved_at: new Date().toISOString(),
  };
}

/** Extrae observaciones de UN registro RAW individual (Etapa A). */
export function extractObservations(rawRecord) {
  const observations = [];
  const text = rawRecord.content || '';
  const titleAndOpening = `${rawRecord.title ?? ''} ${text.slice(0, 200)}`;

  const questionMatch = titleAndOpening.match(/[^.?!]*\?/);
  if (questionMatch) {
    observations.push(makeObservation(rawRecord, 'hook', 'Apertura o título con pregunta', questionMatch[0].trim()));
  }

  const ctaQuote = findFirstMatch(text, CTA_KEYWORDS);
  if (ctaQuote) {
    observations.push(makeObservation(rawRecord, 'cta', 'Llamada a la acción explícita', ctaQuote));
  }

  const urgencyQuote = findFirstMatch(text, URGENCY_KEYWORDS);
  if (urgencyQuote) {
    observations.push(makeObservation(rawRecord, 'mecanismo', 'Urgencia o escasez', urgencyQuote));
  }

  return observations;
}
