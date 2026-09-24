// index.ts — Punto de entrada del DecisionProvider (complemento a MI-4).
//
// Capacidad extensible de Hermes, NO parte del Intelligence Store: separa
// DECISION (JEV u otro motor de clasificación/scoring) de GENERATION/DEEP
// REASONING (Claude u otro LLM). Nada en detection/ (MI-4) importa de aquí
// -- es un punto de enchufe opcional para el futuro, no un requisito.
export * from "./types";
export { deterministicDecisionProvider } from "./deterministicDecisionProvider";
export { createJevDecisionProvider, JevNotConfiguredError } from "./jevDecisionProvider";
export type { JevClientConfig } from "./jevDecisionProvider";
