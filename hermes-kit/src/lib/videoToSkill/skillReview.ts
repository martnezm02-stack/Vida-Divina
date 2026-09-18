// skillReview.ts — Gate de revisión humana, propio y aislado de este
// módulo. Deliberadamente NO reutiliza derivarHumano (src/lib/tools/
// derivar-humano.ts): ese escribe al CRM real de Vida Divina (fuera de
// scope -- "no modificar Vida Divina"). Aquí la persistencia es un simple
// review.json en el propio staging dir de la skill, suficiente para el
// contrato APPROVED/REJECTED/NEEDS_REVISION que pide este pipeline.

import fs from "node:fs";
import path from "node:path";
import type { ReviewDecision, ReviewRecord, ReviewSummary } from "./types";

function reviewPath(stagingDir: string): string {
  return path.join(stagingDir, "review.json");
}

export function submitReview(
  stagingDir: string,
  decision: ReviewDecision,
  reviewedBy: string,
  reviewerNote: string,
  summary: ReviewSummary
): ReviewRecord {
  const record: ReviewRecord = {
    decision,
    reviewerNote,
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    summary,
  };
  fs.writeFileSync(reviewPath(stagingDir), JSON.stringify(record, null, 2), "utf-8");
  return record;
}

export function getReview(stagingDir: string): ReviewRecord | null {
  const p = reviewPath(stagingDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}
