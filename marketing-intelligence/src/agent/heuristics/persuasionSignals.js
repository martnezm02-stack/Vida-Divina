// persuasionSignals.js — Detectores basados en reglas para la mayoría de las
// dimensiones de persuasión de la taxonomía (src/taxonomy.js): PROBLEM,
// PAIN_POINT, DESIRE, BENEFIT, PROMISE, MECHANISM, OBJECTION, AUTHORITY,
// URGENCY, SOCIAL_PROOF, CTA, OFFER y EMOTIONAL_TRIGGER.
//
// Un solo escáner genérico de palabras clave evita repetir el mismo bloque
// una docena de veces; cada dimensión declara su propia lista de patrones y
// su propia justificación de confianza — nunca se afirma nada sin un
// evidence_quote literal del contenido.

function quoteAround(text, index, matchLength, pad = 25) {
  return text.slice(Math.max(0, index - pad), index + matchLength + pad).trim();
}

function findMatch(lowerText, pattern) {
  if (pattern instanceof RegExp) {
    const m = lowerText.match(pattern);
    return m ? { index: m.index, length: m[0].length } : null;
  }
  const idx = lowerText.indexOf(pattern);
  return idx === -1 ? null : { index: idx, length: pattern.length };
}

const KEYWORD_DIMENSIONS = [
  {
    dimension: 'PROBLEM', value: 'problema_explicito',
    patterns: ['problema de', 'struggle with', 'dificultad para', 'cansado de', 'tired of', 'frustrado', 'frustrated'],
    confidence: 0.5, confidenceBasis: 'Coincidencia de palabra clave asociada a un problema/frustración explícita.',
  },
  {
    dimension: 'PAIN_POINT', value: 'punto_de_dolor',
    patterns: ['no puedes', "can't seem to", 'te cuesta', "it's hard to", 'nunca logras', 'never manage to'],
    confidence: 0.4, confidenceBasis: 'Coincidencia de expresión de dificultad persistente.',
  },
  {
    dimension: 'DESIRE', value: 'deseo_explicito',
    patterns: ['quieres', 'you want', 'imagina', 'imagine', 'sueñas con', 'wish you could'],
    confidence: 0.5, confidenceBasis: 'Coincidencia de palabra clave de deseo/aspiración.',
  },
  {
    dimension: 'BENEFIT', value: 'beneficio_explicito',
    patterns: ['te ayuda a', 'helps you', 'lograrás', "you'll achieve", 'beneficios'],
    confidence: 0.5, confidenceBasis: 'Coincidencia de palabra clave de beneficio directo.',
  },
  {
    dimension: 'PROMISE', value: 'promesa_explicita',
    patterns: ['garantizado', 'guaranteed', 'te aseguramos', 'we promise', "you'll get"],
    confidence: 0.5, confidenceBasis: 'Coincidencia de lenguaje de garantía/promesa.',
  },
  {
    dimension: 'MECHANISM', value: 'mecanismo_explicado',
    patterns: ['cómo funciona', 'how it works', 'gracias a', 'thanks to', 'utilizando'],
    confidence: 0.5, confidenceBasis: 'Coincidencia de lenguaje explicativo de mecanismo/funcionamiento.',
  },
  {
    dimension: 'OBJECTION', value: 'objecion_anticipada',
    patterns: ['sé que estás pensando', "i know what you're thinking", 'quizás pienses', 'you might think'],
    confidence: 0.45, confidenceBasis: 'Coincidencia de lenguaje que anticipa una duda del lector.',
  },
  {
    dimension: 'AUTHORITY', value: 'autoridad_o_evidencia_citada',
    patterns: ['experto', 'expert', 'estudios demuestran', 'studies show', 'certificado', 'certified', 'según la ciencia', 'años de experiencia'],
    confidence: 0.55, confidenceBasis: 'Coincidencia de palabra clave de autoridad/credencial/evidencia citada.',
  },
  {
    dimension: 'URGENCY', value: 'urgencia_o_escasez',
    patterns: ['ahora mismo', 'por tiempo limitado', 'solo hoy', 'limited time', 'today only', 'last chance', 'act now', "don't miss", 'últimas unidades', 'while supplies last'],
    confidence: 0.6, confidenceBasis: 'Coincidencia de palabra clave de urgencia/escasez temporal.',
  },
  {
    dimension: 'SOCIAL_PROOF', value: 'prueba_social',
    patterns: ['testimonials', 'reviews', 'clientes dicen', '5 estrellas', '5 stars', 'verified buyers', 'miles de personas', 'thousands of people'],
    confidence: 0.55, confidenceBasis: 'Coincidencia de palabra clave de prueba social (testimonios/reseñas/volumen de clientes).',
  },
  {
    dimension: 'CTA', value: 'llamada_a_la_accion',
    patterns: ['compra ahora', 'buy now', 'haz clic', 'click here', 'regístrate', 'sign up', 'suscríbete', 'subscribe', 'aprende más', 'learn more', 'descarga', 'download', 'reserva', 'book now', 'síguenos', 'follow us', 'comparte', 'share this', 'envía un mensaje', 'send a message', 'comenta', 'leave a comment', 'shop now', 'get started'],
    confidence: 0.65, confidenceBasis: 'Coincidencia directa con una frase de llamada a la acción conocida.',
  },
];

const OFFER_PATTERNS = [/\$\d+(?:\.\d{2})?/, /\d{1,3}%\s*(?:off|de descuento)/i, 'gratis', 'free shipping', 'descuento'];

const EMOTION_MAP = {
  miedo_riesgo: ['miedo', 'riesgo', 'peligro', 'fear', 'risk'],
  entusiasmo: ['increíble', 'amazing', 'emocionante', 'exciting'],
  pertenencia: ['únete', 'join us', 'comunidad', 'community'],
};

export function detectPersuasionSignals(content) {
  const results = [];
  const lower = content.toLowerCase();

  for (const spec of KEYWORD_DIMENSIONS) {
    for (const pattern of spec.patterns) {
      const match = findMatch(lower, pattern.toLowerCase());
      if (match) {
        results.push({
          dimension: spec.dimension,
          value: spec.value,
          evidence_quote: quoteAround(content, match.index, match.length),
          confidence: spec.confidence,
          confidence_basis: spec.confidenceBasis,
        });
        break; // una detección por dimensión es suficiente para esta fase
      }
    }
  }

  for (const pattern of OFFER_PATTERNS) {
    const match = findMatch(lower, pattern);
    if (match) {
      results.push({
        dimension: 'OFFER', value: 'oferta_con_precio_o_descuento',
        evidence_quote: quoteAround(content, match.index, match.length),
        confidence: 0.6, confidence_basis: 'Coincidencia de patrón de precio, porcentaje de descuento o "gratis".',
      });
      break;
    }
  }

  for (const [emotion, keywords] of Object.entries(EMOTION_MAP)) {
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx !== -1) {
        results.push({
          dimension: 'EMOTIONAL_TRIGGER', value: emotion,
          evidence_quote: quoteAround(content, idx, kw.length),
          confidence: 0.4, confidence_basis: `Coincidencia de palabra clave asociada a la emoción "${emotion}".`,
        });
        break;
      }
    }
  }

  return results;
}
