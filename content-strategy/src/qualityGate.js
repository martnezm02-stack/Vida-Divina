// qualityGate.js — Fase 14, §15. Puerta de calidad NO-lanzante (a
// diferencia de los guards de contentItem.js/contentDraft.js, que sí
// lanzan en construcción): reporta pass/fail con motivos, para decidir si
// se autoriza continuar hacia approveContentItem()/markReadyToPublish().
// No sustituye la revisión humana — es la red de seguridad ANTES de
// ofrecerle un item a un humano para revisión.

import { detectInventedCertainty, detectCausalLanguage, detectCopiedFragment } from './textSafetyChecks.js';

export function runQualityGate({ item, draft, externalExampleTexts = [], batchDiversityResult = null }) {
  const failures = [];

  if (!item?.product_ref) failures.push('product_ref ausente o inválido');
  if (!item?.objective) failures.push('objective ausente');
  if (!item?.hook) failures.push('hook ausente');
  if (!item?.angle) failures.push('angle ausente');
  if (!item?.format) failures.push('format ausente');
  if (!item?.pillar) failures.push('pillar ausente');
  if (!Array.isArray(item?.source_references) || item.source_references.length === 0) failures.push('source_references ausentes');
  if (!Array.isArray(item?.claims)) failures.push('claims no identificados (debe ser un arreglo, aunque esté vacío)');

  for (const claim of item?.claims ?? []) {
    if (claim.verified_by_vida_divina !== false) failures.push(`claim "${claim.claim_text ?? '(sin texto)'}" no está marcado verified_by_vida_divina=false`);
    if (claim.requires_human_review !== true) failures.push(`claim "${claim.claim_text ?? '(sin texto)'}" no tiene requires_human_review=true`);
  }

  if (item?.requires_human_review !== true) failures.push('ContentItem.requires_human_review no es true');
  if (draft?.requires_human_review !== true) failures.push('ContentDraft.requires_human_review no es true');

  const fullText = [draft?.title, draft?.hook, draft?.body, draft?.caption].filter(Boolean).join(' ');
  const copiedFragment = detectCopiedFragment(fullText, externalExampleTexts);
  if (copiedFragment) failures.push(`contenido copiado de una fuente externa ("${copiedFragment}")`);

  const causalMatch = detectCausalLanguage(fullText);
  if (causalMatch) failures.push(`lenguaje de causalidad detectado (${causalMatch})`);

  const inventedPhrase = detectInventedCertainty(fullText);
  if (inventedPhrase) failures.push(`afirmación de certeza no verificada ("${inventedPhrase}")`);

  if (batchDiversityResult && !batchDiversityResult.valid) {
    failures.push(`diversidad de batch inválida: ${batchDiversityResult.violations.map((v) => v.check).join(', ')}`);
  }

  return { passed: failures.length === 0, failures };
}
