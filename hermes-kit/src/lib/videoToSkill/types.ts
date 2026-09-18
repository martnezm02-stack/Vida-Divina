// types.ts — Contratos del pipeline VIDEO -> KNOWLEDGE -> SKILL (Hermes Desktop).
//
// Aislado de Vida Divina comercial: no importa nada de content-orchestrator/
// ni toca CRM/WhatsApp de negocio. Solo usa hermes-kit como huésped porque
// es donde vive el patrón real de registro de tools (src/lib/tools/index.ts).
//
// Principio evidence-first: toda afirmación de un SkillSpec debe poder
// rastrearse a un VideoEvidenceItem con EvidenceKind explícito. Nunca se
// rellenan huecos con imaginación -- lo no observable se marca UNKNOWN.

export type EvidenceKind = "OBSERVED" | "INFERRED" | "UNKNOWN";

export type EvidenceSourceType = "transcript" | "frame" | "technical" | "both";

export interface VideoEvidenceItem {
  id: string;
  timestampSeconds: number | null;
  kind: EvidenceKind;
  sourceType: EvidenceSourceType;
  frameId?: string | null;
  transcriptSnippet?: string | null;
  actionObserved?: string | null;
  interfaceObserved?: string | null;
  input?: string | null;
  output?: string | null;
  procedureStep?: string | null;
  rule?: string | null;
  exception?: string | null;
  confidence: number; // 0..1. 0 cuando kind === UNKNOWN.
  evidenceRef: string; // de dónde salió literalmente (ej. "transcript@00:00:03-00:00:05", "frame@t=4.2s via vision:openrouter/gpt-4o-mini", "ffprobe.format")
}

export interface ProcedureStep {
  step: string;
  evidenceIds: string[]; // trazabilidad obligatoria -- nunca vacío para un paso OBSERVED
  kind: EvidenceKind;
}

export interface SkillSpec {
  name: string;
  purpose: string;
  trigger: string;
  prerequisites: string[];
  inputs: string[];
  outputs: string[];
  procedure: ProcedureStep[];
  decisionRules: string[];
  failureModes: string[];
  requiredTools: string[];
  dependencies: string[];
  evidence: VideoEvidenceItem[];
  confidence: number; // agregado, promedio ponderado de la evidencia OBSERVED
  limitations: string[];
}

export type ProviderStatus = "OBSERVED" | "NOT_CONFIGURED" | "ERROR";

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface TranscriptResult {
  status: ProviderStatus;
  provider: "embedded_captions" | "groq_whisper" | "openai_whisper" | null;
  segments: TranscriptSegment[];
  reason?: string;
}

export interface FrameObservation {
  frameId: string;
  timestampSeconds: number;
  status: ProviderStatus;
  interfaceObserved?: string | null;
  actionObserved?: string | null;
  textVisible?: string | null;
  notes?: string | null;
  reason?: string;
}

export interface VisionResult {
  status: ProviderStatus;
  provider: string | null;
  frames: FrameObservation[];
  reason?: string;
}

export interface ExtractedFrame {
  id: string;
  path: string;
  timestampSeconds: number;
}

export interface VideoProbe {
  path: string;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  hasEmbeddedSubtitles: boolean;
  subtitleStreamIndex: number | null;
  format: string;
}

export type ValidationCheckStatus = "PASS" | "FAIL" | "UNABLE_TO_VERIFY";

export interface ValidationCheck {
  name: string;
  status: ValidationCheckStatus;
  detail: string;
}

export interface ValidationResult {
  overall: ValidationCheckStatus;
  checks: ValidationCheck[];
}

export type ReviewDecision = "APPROVED" | "REJECTED" | "NEEDS_REVISION";

export interface ReviewSummary {
  whatWasLearned: string;
  whatWasImplemented: string;
  filesCreated: string[];
  evidenceHighlights: string[];
  testsPassed: string[];
  unverified: string[];
  externalDependencies: string[];
  risks: string[];
}

export interface ReviewRecord {
  decision: ReviewDecision;
  reviewerNote: string;
  reviewedAt: string;
  reviewedBy: string; // debe ser explícito si es un humano real o un harness de prueba
  summary: ReviewSummary;
}

export type RegistryState = "STAGED" | "REVIEWED" | "ACTIVATED_PENDING_MANUAL_MERGE" | "REJECTED_NOT_ACTIVATED";
