// videoEvidence.ts — Construye el contrato estructurado de evidencia a
// partir de lo que REALMENTE devolvieron los providers. Nunca inventa
// pasos: si transcript y visión no están disponibles, la evidencia se
// limita a los hechos técnicos de ffprobe (OBSERVED) y todo lo demás
// queda UNKNOWN con la razón explícita.

import type {
  ExtractedFrame,
  TranscriptResult,
  VideoEvidenceItem,
  VideoProbe,
  VisionResult,
} from "./types";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

export function buildEvidence(opts: {
  probe: VideoProbe;
  transcript: TranscriptResult;
  vision: VisionResult;
  frames: ExtractedFrame[];
}): VideoEvidenceItem[] {
  const { probe, transcript, vision, frames } = opts;
  const evidence: VideoEvidenceItem[] = [];

  // Hecho técnico siempre disponible ($0, ffprobe real).
  evidence.push({
    id: nextId("ev"),
    timestampSeconds: null,
    kind: "OBSERVED",
    sourceType: "technical",
    confidence: 1,
    evidenceRef: "ffprobe.format+streams",
    procedureStep: null,
    rule: null,
    exception: null,
    input: null,
    output: null,
    actionObserved: null,
    interfaceObserved: null,
    transcriptSnippet: `duración=${probe.durationSeconds}s, resolución=${probe.width}x${probe.height}, formato=${probe.format}`,
  });

  if (transcript.status === "OBSERVED") {
    for (const seg of transcript.segments) {
      evidence.push({
        id: nextId("ev"),
        timestampSeconds: seg.startSeconds,
        kind: "OBSERVED",
        sourceType: "transcript",
        confidence: transcript.provider === "embedded_captions" ? 1 : 0.85,
        evidenceRef: `transcript@${seg.startSeconds.toFixed(1)}s-${seg.endSeconds.toFixed(1)}s via ${transcript.provider}`,
        transcriptSnippet: seg.text,
        actionObserved: null,
        interfaceObserved: null,
        input: null,
        output: null,
        procedureStep: seg.text,
        rule: null,
        exception: null,
      });
    }
  } else {
    evidence.push({
      id: nextId("ev"),
      timestampSeconds: null,
      kind: "UNKNOWN",
      sourceType: "transcript",
      confidence: 0,
      evidenceRef: `transcript:${transcript.status}`,
      transcriptSnippet: null,
      actionObserved: null,
      interfaceObserved: null,
      input: null,
      output: null,
      procedureStep: null,
      rule: null,
      exception: `Sin transcript real: ${transcript.reason ?? transcript.status}`,
    });
  }

  if (vision.status === "OBSERVED") {
    for (const frameObs of vision.frames) {
      if (frameObs.status !== "OBSERVED") {
        evidence.push({
          id: nextId("ev"),
          timestampSeconds: frameObs.timestampSeconds,
          kind: "UNKNOWN",
          sourceType: "frame",
          frameId: frameObs.frameId,
          confidence: 0,
          evidenceRef: `frame:${frameObs.frameId}:${frameObs.status}`,
          exception: frameObs.reason ?? "Frame sin observación válida",
        });
        continue;
      }
      evidence.push({
        id: nextId("ev"),
        timestampSeconds: frameObs.timestampSeconds,
        kind: "OBSERVED",
        sourceType: "frame",
        frameId: frameObs.frameId,
        confidence: 0.75, // visión de un solo frame vía modelo económico: confianza moderada, nunca 1.
        evidenceRef: `frame@${frameObs.timestampSeconds}s via ${vision.provider}`,
        interfaceObserved: frameObs.interfaceObserved ?? null,
        actionObserved: frameObs.actionObserved ?? null,
        transcriptSnippet: frameObs.textVisible ?? null,
        procedureStep: frameObs.actionObserved ?? null,
      });
    }
  } else {
    evidence.push({
      id: nextId("ev"),
      timestampSeconds: null,
      kind: "UNKNOWN",
      sourceType: "frame",
      confidence: 0,
      evidenceRef: `vision:${vision.status}`,
      exception: `Sin análisis visual real: ${vision.reason ?? vision.status}`,
    });
  }

  // Nota de cobertura: si hay frames extraídos pero no analizados por
  // ausencia de provider, se listan como UNKNOWN individual arriba solo
  // si vision.status !== OBSERVED (ya cubierto). No se duplica.
  void frames;

  return evidence;
}
