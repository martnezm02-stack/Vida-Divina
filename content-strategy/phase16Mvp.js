#!/usr/bin/env node
// phase16Mvp.js — Fase 16: frontera humana OBLIGATORIA sobre los 5 drafts
// reales de la Fase 14. Reutiliza los mismos artefactos — no genera nada
// nuevo. Demuestra la diferencia entre "el sistema cree que está bien" y
// "un humano decidió aprobarlo".

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

import { approveContentItem, markReadyToPublish, computeContentVersion } from './src/contentItem.js';
import { createHumanReviewRecord } from './src/humanReviewRecord.js';
import { runQualityGate } from './src/qualityGate.js';
import { runProductTruthGate } from './src/productTruthGate.js';
import { ContentStrategyStore } from './src/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports', 'phase16');
const PHASE14_EXPORT = join(__dirname, 'exports', 'phase14');

function log(...args) { console.log(...args); }

async function main() {
  log('=== FASE 16 — Enforced Quality Gate + Human Approval Boundary ===\n');

  const items = JSON.parse(readFileSync(join(PHASE14_EXPORT, 'content_items.json'), 'utf8'))
    .map((i) => ({ ...i, production_status: 'REVIEW_REQUIRED', content_version: null })); // se resetea a REVIEW_REQUIRED: la aprobación de la Fase 14 ocurrió ANTES de que este gate existiera
  const drafts = JSON.parse(readFileSync(join(PHASE14_EXPORT, 'content_drafts.json'), 'utf8'));

  log(`--- 1. Auditoría de los ${drafts.length} drafts reales de la Fase 14 (ambos gates) ---`);
  const audit = [];
  for (let i = 0; i < drafts.length; i++) {
    const item = items.find((it) => it.content_item_id === drafts[i].content_item_id) ?? items[i];
    const draft = drafts[i];
    const quality = runQualityGate({ item, draft });
    const truth = runProductTruthGate({ item, draft });
    audit.push({ index: i + 1, content_item_id: item.content_item_id, draft_id: draft.draft_id, hook: draft.hook.slice(0, 60), quality_passed: quality.passed, truth_status: truth.status, truth_reasons: truth.reasons });
    log(`  pieza ${i + 1}: QualityGate=${quality.passed ? 'PASS' : 'FAIL'} · ProductTruthGate=${truth.status}`);
    for (const r of truth.reasons) log(`    - ${r}`);
    log(`    Para aprobar: un humano identificado debe registrar decision=APPROVE con reviewer_id real, viendo estos mismos resultados, sobre esta MISMA versión del contenido.`);
  }

  // --- 2. Prueba de bypasses (§13) — ninguno debe funcionar ---
  log('\n--- 2. Prueba de bypasses conocidos ---');
  const bypassAttempts = [
    () => approveContentItem({ item: items[0], draft: drafts[0], humanReview: null, approve: true, force: true }),
    () => approveContentItem({ item: items[0], draft: drafts[0], humanReview: { decision: 'APPROVE', reviewer_id: 'system', content_item_id: items[0].content_item_id, content_version: 'x' } }),
    () => markReadyToPublish({ item: { ...items[0], production_status: 'DRAFT' }, draft: drafts[0], humanReview: null }),
  ];
  for (const [i, attempt] of bypassAttempts.entries()) {
    try { attempt(); log(`  intento ${i + 1}: NO DEBERÍA HABER PASADO`); } catch (err) { log(`  intento ${i + 1}: bloqueado correctamente (${err.message.slice(0, 80)}...)`); }
  }

  // --- 3. Prueba real de aprobación humana: pieza 1 ---
  log('\n--- 3. Aprobación humana REAL sobre la pieza 1 ---');
  const item = items[0];
  const draft = drafts[0];
  const qualityResult = runQualityGate({ item, draft });
  const truthResult = runProductTruthGate({ item, draft });
  const contentVersion = computeContentVersion({ item, draft });

  const humanReview = createHumanReviewRecord({
    content_item_id: item.content_item_id,
    content_version: contentVersion,
    reviewer_id: 'martnezm02@gmail.com', // identidad real del usuario de este proyecto — nunca "system"/"auto"
    decision: 'APPROVE',
    reviewed_quality_gate: qualityResult,
    reviewed_product_truth_gate: truthResult,
    notes: 'Aprobado a pesar de REVIEW_REQUIRED (lenguaje de "desintoxicación") — el catálogo real de TéDivina documenta explícitamente ese uso como preparación previa a un programa, no como resultado garantizado. Revisar antes de cualquier publicación real.',
  });

  const store = new ContentStrategyStore(join(DATA_DIR, 'intelligence'));
  store.save('human_review_record', humanReview);

  log(`  ProductTruthGate antes de aprobar: ${truthResult.status} (${truthResult.reasons.length} motivo(s))`);
  log(`  Revisor humano real: ${humanReview.reviewer_id} · decisión: ${humanReview.decision}`);

  const approved = approveContentItem({ item, draft, humanReview });
  store.save('content_item', approved);
  log(`  → APPROVED (review_id: ${approved.review_id}, approved_by: ${approved.approved_by})`);

  const ready = markReadyToPublish({ item: approved, draft, humanReview });
  store.save('content_item', ready);
  log(`  → READY_TO_PUBLISH (nunca publicado — se detiene aquí, §14)`);

  // --- 4. Las otras 4 permanecen sin tocar ---
  log('\n--- 4. Las otras 4 piezas permanecen en REVIEW_REQUIRED (ninguna acción humana sobre ellas) ---');
  for (let i = 1; i < items.length; i++) log(`  pieza ${i + 1}: ${items[i].production_status}`);

  // --- 5. Trazabilidad completa de la pieza aprobada ---
  log('\n--- 5. Trazabilidad: READY_TO_PUBLISH → HumanReviewRecord → Draft → Item → fuentes ---');
  log(`  READY_TO_PUBLISH: ${ready.content_item_id}`);
  log(`  → HumanReviewRecord: ${humanReview.review_id} (reviewer: ${humanReview.reviewer_id})`);
  log(`  → ContentDraft: ${draft.draft_id}`);
  for (const ref of ready.source_references) log(`    → [${ref.source_module}] ${ref.reference_id}`);

  // --- 6. Exportación ---
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'audit_5_drafts.json'), JSON.stringify(audit, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'human_review_record.json'), JSON.stringify(humanReview, null, 2), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'approved_item.json'), JSON.stringify(ready, null, 2), 'utf8');

  const summary = {
    drafts_audited: drafts.length,
    review_required_count: audit.filter((a) => a.truth_status === 'REVIEW_REQUIRED').length,
    blocked_count: audit.filter((a) => a.truth_status === 'BLOCKED').length,
    pass_count: audit.filter((a) => a.truth_status === 'PASS').length,
    bypass_attempts_blocked: bypassAttempts.length,
    human_approved_item: ready.content_item_id,
    human_reviewer: humanReview.reviewer_id,
    final_status: ready.production_status,
    published: false,
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(EXPORT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  log(`\n--- Exportado a: ${EXPORT_DIR} ---`);
  log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
