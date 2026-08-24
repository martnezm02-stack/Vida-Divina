// claims.js — Detección de CLAIMS de marketing (afirmaciones de beneficio,
// salud o resultado). Un claim encontrado en el contenido NUNCA se registra
// como hecho verdadero — solo como "el contenido afirma X", con
// verification_status=UNVERIFIED y requires_human_review=true SIEMPRE por
// defecto en esta fase (ningún proceso automático de este sistema puede
// cambiar esos dos valores — solo una revisión humana de Vida Divina).

const CLAIM_PATTERNS = [
  { regex: /\belimina(?:r|s)?\s+[a-záéíóúñ\s]{3,40}/gi, claim_type: 'health_benefit_claim' },
  { regex: /\bcura(?:r|s)?\s+[a-záéíóúñ\s]{3,40}/gi, claim_type: 'health_benefit_claim' },
  { regex: /\b(?:eliminates?|cures?|heals?|reverses?|prevents?)\s+[a-z\s]{3,40}/gi, claim_type: 'health_benefit_claim' },
  { regex: /\b(?:aumenta|incrementa|increases?|boosts?)\s+[a-záéíóúñ\s]{3,40}\s+(?:en|by)\s+\d+%/gi, claim_type: 'performance_claim' },
  { regex: /\bresultados\s+garantizados\b|\bguaranteed\s+results\b/gi, claim_type: 'result_claim' },
];

export function detectClaims(content) {
  const claims = [];
  for (const { regex, claim_type } of CLAIM_PATTERNS) {
    for (const match of content.matchAll(regex)) {
      claims.push({
        claim_text: match[0].trim(),
        claim_type,
        confidence: 0.5,
        confidence_basis: 'Coincidencia de patrón lingüístico típico de afirmación de beneficio/resultado — no implica verificación de veracidad.',
      });
    }
  }
  return claims;
}
