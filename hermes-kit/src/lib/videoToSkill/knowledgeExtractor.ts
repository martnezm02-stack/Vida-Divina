// knowledgeExtractor.ts — Evidencia -> SKILL_SPEC.
//
// Deliberadamente determinista (no una segunda llamada a LLM "resumiendo
// libremente"): cada paso del procedimiento es una transformación mecánica
// de la evidencia OBSERVED, ordenada por timestamp, con evidenceIds
// explícitos. Esto es lo que exige la regla "no convertir video en un
// resumen libre" -- un resumen generativo no puede garantizar trazabilidad
// 1:1 a evidencia; esta función sí.

import type { ProcedureStep, SkillSpec, VideoEvidenceItem } from "./types";

export function extractSkillSpec(opts: {
  name: string;
  purpose: string;
  trigger: string;
  evidence: VideoEvidenceItem[];
  requiredToolsHint?: string[];
}): SkillSpec {
  const { evidence } = opts;

  const observed = evidence
    .filter((e) => e.kind === "OBSERVED" && e.sourceType !== "technical")
    .sort((a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0));

  const procedure: ProcedureStep[] = observed
    .filter((e) => e.procedureStep)
    .map((e) => ({
      step: e.procedureStep as string,
      evidenceIds: [e.id],
      kind: e.kind,
    }));

  const decisionRules = evidence
    .filter((e) => e.rule)
    .map((e) => `${e.rule} (evidencia: ${e.id})`);

  const failureModes = evidence
    .filter((e) => e.exception)
    .map((e) => `${e.exception} (evidencia: ${e.id})`);

  const unknownGaps = evidence.filter((e) => e.kind === "UNKNOWN");
  const limitations = unknownGaps.map(
    (e) => `Sin evidencia suficiente en ${e.sourceType} (${e.evidenceRef}) -- marcado UNKNOWN, no se rellenó.`
  );

  const observedConfidences = observed.map((e) => e.confidence).filter((c) => c > 0);
  const confidence = observedConfidences.length
    ? Number((observedConfidences.reduce((a, b) => a + b, 0) / observedConfidences.length).toFixed(2))
    : 0;

  if (procedure.length === 0) {
    limitations.push("Ningún paso de procedimiento pudo derivarse de evidencia OBSERVED -- SKILL_SPEC queda como esqueleto sin procedimiento verificable.");
  }

  return {
    name: opts.name,
    purpose: opts.purpose,
    trigger: opts.trigger,
    prerequisites: [],
    inputs: [],
    outputs: [],
    procedure,
    decisionRules,
    failureModes,
    requiredTools: opts.requiredToolsHint ?? [],
    dependencies: [],
    evidence,
    confidence,
    limitations,
  };
}
