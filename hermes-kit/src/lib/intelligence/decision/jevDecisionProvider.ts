// jevDecisionProvider.ts — Adaptador de JEV (TypeSafe AI) al contrato
// DecisionProvider. Deja la integración runtime PREPARADA sin bloquear
// nada: sin credenciales/cliente real, cada método lanza
// JevNotConfiguredError en vez de intentar una llamada -- nunca se piden
// credenciales aquí, y ningún camino de MI-4 depende de esto (MI-4 es
// puramente determinista; ver detection/).
//
// Cuando se integre el SDK real de TypeSafe AI, solo este archivo cambia:
// el contrato DecisionProvider y todo lo que lo consuma quedan intactos.
import type {
  ChooseInput,
  ChooseResult,
  ClassifyInput,
  ClassifyResult,
  DecisionProvider,
  ScoreInput,
  ScoreResult,
} from "./types";

export class JevNotConfiguredError extends Error {
  constructor(method: string) {
    super(
      `JevDecisionProvider.${method}: JEV no está configurado en este entorno (sin cliente/API key). ` +
        `Pasa un JevClientConfig real a createJevDecisionProvider() para habilitarlo.`
    );
    this.name = "JevNotConfiguredError";
  }
}

export interface JevClientConfig {
  /** Forma placeholder -- la define el SDK real de TypeSafe AI (Jev) cuando se integre. No se lee ni se valida ningún secreto en esta fase. */
  apiKey?: string;
  [key: string]: unknown;
}

/**
 * Crea el DecisionProvider respaldado por JEV. Sin `config.apiKey`, queda
 * en modo "no configurado": la forma (classify/score/choose) es válida y
 * asignable a DecisionProvider, pero invocar cualquier método lanza
 * JevNotConfiguredError de inmediato -- determinista, sin red, sin
 * bloquear a quien lo llame.
 */
export function createJevDecisionProvider(config?: JevClientConfig): DecisionProvider {
  const configured = Boolean(config?.apiKey);

  return {
    name: "jev",

    classify(_input: ClassifyInput): ClassifyResult {
      if (!configured) throw new JevNotConfiguredError("classify");
      throw new Error("JevDecisionProvider.classify: integración real con el SDK de TypeSafe AI pendiente");
    },

    score(_input: ScoreInput): ScoreResult {
      if (!configured) throw new JevNotConfiguredError("score");
      throw new Error("JevDecisionProvider.score: integración real con el SDK de TypeSafe AI pendiente");
    },

    choose<T>(_input: ChooseInput<T>): ChooseResult<T> {
      if (!configured) throw new JevNotConfiguredError("choose");
      throw new Error("JevDecisionProvider.choose: integración real con el SDK de TypeSafe AI pendiente");
    },
  };
}
