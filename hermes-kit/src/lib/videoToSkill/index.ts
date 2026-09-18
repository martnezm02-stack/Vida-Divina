// index.ts — Orquesta el pipeline completo. Módulo nuevo y aislado de
// Hermes Desktop: VIDEO -> OBSERVACIÓN -> EVIDENCIA -> SKILL_SPEC ->
// SKILL.md (staging) -> VALIDACIÓN. No incluye HumanReview/ACTIVATE aquí
// a propósito -- esas son decisiones explícitas y separadas
// (skillReview.submitReview / skillRegistry.activate), nunca automáticas,
// para mantener el boundary OBSERVACIÓN -> CONOCIMIENTO -> IMPLEMENTACIÓN
// -> APROBACIÓN -> ACTIVACIÓN como pasos distintos y nunca saltados.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  probeVideo,
  extractEmbeddedSubtitles,
  extractAudio,
  extractRepresentativeFrames,
} from "./videoInput";
import { getTranscript } from "./speechProvider";
import { analyzeFrames } from "./visionProvider";
import { buildEvidence } from "./videoEvidence";
import { extractSkillSpec } from "./knowledgeExtractor";
import { buildSkillFiles } from "./skillBuilder";
import { validateSkill } from "./skillValidator";
import type { SkillSpec, ValidationResult } from "./types";

export * from "./types";
export { getTranscript } from "./speechProvider";
export { analyzeFrames } from "./visionProvider";
export { buildEvidence } from "./videoEvidence";
export { extractSkillSpec } from "./knowledgeExtractor";
export { buildSkillFiles, STAGING_ROOT } from "./skillBuilder";
export { validateSkill } from "./skillValidator";
export { submitReview, getReview } from "./skillReview";
export { activate, getState } from "./skillRegistry";

export interface PipelineResult {
  skillId: string;
  stagingDir: string;
  filesCreated: string[];
  spec: SkillSpec;
  validation: ValidationResult;
  diagnostics: {
    probeOk: boolean;
    transcriptStatus: string;
    visionStatus: string;
    framesExtracted: number;
  };
}

export async function runVideoToSkillPipeline(opts: {
  videoPath: string;
  skillName: string;
  purpose: string;
  trigger: string;
  requiredToolsHint?: string[];
  knownToolNames: string[];
}): Promise<PipelineResult | { ok: false; reason: string }> {
  const probeResult = await probeVideo(opts.videoPath);
  if (!probeResult.ok) return { ok: false, reason: probeResult.reason };
  const { probe } = probeResult;

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-to-skill-"));

  let embeddedSrtPath: string | null = null;
  if (probe.hasEmbeddedSubtitles && probe.subtitleStreamIndex !== null) {
    const sub = await extractEmbeddedSubtitles(opts.videoPath, probe.subtitleStreamIndex, workDir);
    if (sub.ok) embeddedSrtPath = sub.srtPath;
  }

  const audioResult = await extractAudio(opts.videoPath, workDir);
  const transcript = await getTranscript({
    embeddedSrtPath,
    audioPath: audioResult.ok ? audioResult.audioPath : "",
  });

  const framesResult = await extractRepresentativeFrames(opts.videoPath, probe.durationSeconds, workDir);
  const frames = framesResult.ok ? framesResult.frames : [];
  const vision = frames.length > 0 ? await analyzeFrames(frames) : { status: "NOT_CONFIGURED" as const, provider: null, frames: [], reason: "Sin frames extraídos." };

  const evidence = buildEvidence({ probe, transcript, vision, frames });

  const spec = extractSkillSpec({
    name: opts.skillName,
    purpose: opts.purpose,
    trigger: opts.trigger,
    evidence,
    requiredToolsHint: opts.requiredToolsHint,
  });

  const skillId = `${opts.skillName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${crypto.randomBytes(3).toString("hex")}`;
  const built = buildSkillFiles(spec, skillId);
  const validation = validateSkill(spec, built.stagingDir, opts.knownToolNames);

  return {
    skillId,
    stagingDir: built.stagingDir,
    filesCreated: built.filesCreated,
    spec,
    validation,
    diagnostics: {
      probeOk: true,
      transcriptStatus: transcript.status,
      visionStatus: vision.status,
      framesExtracted: frames.length,
    },
  };
}
