// skillBuilder.ts — SKILL_SPEC -> SKILL.md + evidence.json en staging.
//
// Nunca escribe fuera de un workspace de staging, y nunca activa nada.
// "Activar" es responsabilidad exclusiva de skillRegistry.ts, y solo tras
// pasar por skillReview.ts con decisión APPROVED.

import fs from "node:fs";
import path from "node:path";
import type { SkillSpec } from "./types";

export const STAGING_ROOT = path.join(process.cwd(), "videoToSkill-staging");

function renderSkillMd(spec: SkillSpec): string {
  const lines: string[] = [];
  lines.push(`# ${spec.name}`);
  lines.push("");
  lines.push(`**Purpose**: ${spec.purpose}`);
  lines.push(`**Trigger**: ${spec.trigger}`);
  lines.push(`**Confidence**: ${spec.confidence}`);
  lines.push("");
  lines.push("## Prerequisites");
  lines.push(spec.prerequisites.length ? spec.prerequisites.map((p) => `- ${p}`).join("\n") : "- (ninguno identificado)");
  lines.push("");
  lines.push("## Inputs");
  lines.push(spec.inputs.length ? spec.inputs.map((p) => `- ${p}`).join("\n") : "- (no observado)");
  lines.push("");
  lines.push("## Outputs");
  lines.push(spec.outputs.length ? spec.outputs.map((p) => `- ${p}`).join("\n") : "- (no observado)");
  lines.push("");
  lines.push("## Procedure");
  if (spec.procedure.length === 0) {
    lines.push("(sin pasos verificables -- ver Limitations)");
  } else {
    spec.procedure.forEach((step, i) => {
      lines.push(`${i + 1}. ${step.step} _[${step.kind}, evidence: ${step.evidenceIds.join(", ")}]_`);
    });
  }
  lines.push("");
  lines.push("## Decision Rules");
  lines.push(spec.decisionRules.length ? spec.decisionRules.map((r) => `- ${r}`).join("\n") : "- (ninguna observada)");
  lines.push("");
  lines.push("## Failure Modes");
  lines.push(spec.failureModes.length ? spec.failureModes.map((r) => `- ${r}`).join("\n") : "- (ninguno observado)");
  lines.push("");
  lines.push("## Required Tools");
  lines.push(spec.requiredTools.length ? spec.requiredTools.map((r) => `- ${r}`).join("\n") : "- (ninguna)");
  lines.push("");
  lines.push("## Dependencies");
  lines.push(spec.dependencies.length ? spec.dependencies.map((r) => `- ${r}`).join("\n") : "- (ninguna)");
  lines.push("");
  lines.push("## Limitations");
  lines.push(spec.limitations.length ? spec.limitations.map((r) => `- ${r}`).join("\n") : "- (ninguna)");
  lines.push("");
  lines.push(`## Evidence (${spec.evidence.length} items)`);
  lines.push("Ver `evidence.json` en este mismo directorio para el detalle trazable completo.");
  lines.push("");
  return lines.join("\n");
}

export interface BuildResult {
  skillId: string;
  stagingDir: string;
  filesCreated: string[];
}

export function buildSkillFiles(spec: SkillSpec, skillId: string): BuildResult {
  const stagingDir = path.join(STAGING_ROOT, skillId);
  fs.mkdirSync(stagingDir, { recursive: true });

  const skillMdPath = path.join(stagingDir, "SKILL.md");
  fs.writeFileSync(skillMdPath, renderSkillMd(spec), "utf-8");

  const evidencePath = path.join(stagingDir, "evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(spec.evidence, null, 2), "utf-8");

  const specPath = path.join(stagingDir, "skill-spec.json");
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf-8");

  return {
    skillId,
    stagingDir,
    filesCreated: [skillMdPath, evidencePath, specPath],
  };
}
