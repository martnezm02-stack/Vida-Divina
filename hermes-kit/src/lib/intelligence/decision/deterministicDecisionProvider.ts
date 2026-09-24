// deterministicDecisionProvider.ts — Implementación de referencia del
// contrato DecisionProvider, sin IA. Demuestra que la interfaz es usable
// sin JEV -- deliberadamente simple (match exacto / clamp numérico /
// primera opción): no sustituye ninguna regla determinista ya escrita en
// MI-4 (esas siguen siendo código directo, no pasan por aquí).
import type {
  ChooseInput,
  ChooseResult,
  ClassifyInput,
  ClassifyResult,
  DecisionProvider,
  ScoreInput,
  ScoreResult,
} from "./types";

export const deterministicDecisionProvider: DecisionProvider = {
  name: "deterministic",

  classify({ subject, labels }: ClassifyInput): ClassifyResult {
    if (labels.length === 0) {
      return { label: "", confidence: { value: 0, provenance: "no labels provided" } };
    }
    const subjectText = typeof subject === "string" ? subject.trim().toLowerCase() : null;
    if (subjectText) {
      const exact = labels.find((label) => label.trim().toLowerCase() === subjectText);
      if (exact) {
        return { label: exact, confidence: { value: 1, provenance: "exact string match" } };
      }
    }
    return {
      label: labels[0],
      confidence: { value: 1 / labels.length, provenance: "no exact match -- defaulted to first label" },
    };
  },

  score({ subject }: ScoreInput): ScoreResult {
    const numeric = typeof subject === "number" ? subject : Number(subject);
    if (Number.isFinite(numeric)) {
      return {
        score: Math.max(0, Math.min(1, numeric)),
        confidence: { value: 1, provenance: "numeric subject clamped to [0,1]" },
      };
    }
    return { score: 0, confidence: { value: 0, provenance: "subject is not numeric" } };
  },

  choose<T>({ options }: ChooseInput<T>): ChooseResult<T> {
    if (options.length === 0) {
      throw new Error("deterministicDecisionProvider.choose: options vacío");
    }
    return {
      choice: options[0],
      confidence: { value: 1 / options.length, provenance: "default: primera opción" },
    };
  },
};
