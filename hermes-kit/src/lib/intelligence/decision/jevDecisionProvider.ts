// jevDecisionProvider.ts — Adaptador REAL de JEV (TypeSafe AI, paquete
// @typesafe-ai/sdk) al contrato DecisionProvider.
//
// Sin API key (ni explícita ni vía TYPESAFE_API_KEY), cada método lanza
// JevNotConfiguredError de forma SÍNCRONA e inmediata -- nunca intenta una
// llamada de red, nunca bloquea a quien lo llama. La detección de "¿hay
// key?" no se reimplementa aquí: se delega por completo al propio
// `TypeSafeClient` del SDK (que ya resuelve config.apiKey ->
// TYPESAFE_API_KEY -> ausente, y lanza si falta) -- un solo lugar decide
// esa regla, nunca duplicada.
//
// Con key presente, cada método hace una llamada real a
// `client.systemOne()` y mapea la respuesta real del SDK (choice/score) a
// la forma de DecisionProvider, incluyendo `confidence` tal cual la
// devuelve JEV. Un fallo de la llamada (red, 4xx/5xx, timeout) se
// propaga como rejection -- este archivo nunca lo silencia; degradar a un
// fallback determinista es responsabilidad de quien lo llama (ver
// synthesis/contextOptimizer.ts#withFallback, ya existente, no duplicado
// aquí).
//
// JEV nunca decide si algo se guarda en el Intelligence Store: este
// archivo no importa nada de intelligence/items.ts, connection.ts ni
// ninguna tabla -- solo produce una clasificación/score/elección que el
// caller usa para priorizar, nunca para mutar evidencia canónica.
import { TypeSafeClient, choice, score as typesafeScore } from "@typesafe-ai/sdk";
import type { TypeSafeClientConfig, ChoiceCriteria, Questions, RequestOptions, SystemOneRequest, SystemOneResult } from "@typesafe-ai/sdk";
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
      `JevDecisionProvider.${method}: JEV no está configurado en este entorno (sin TYPESAFE_API_KEY ni config.apiKey explícito). ` +
        `Define TYPESAFE_API_KEY (mismo mecanismo de .env.local/env-loader ya usado en el proyecto) o pasa { apiKey } a createJevDecisionProvider().`
    );
    this.name = "JevNotConfiguredError";
  }
}

/**
 * Subconjunto de TypeSafeClient realmente usado aquí -- permite inyectar un
 * cliente real o un doble de prueba sin depender del constructor real del
 * SDK (que exige una key válida). Solo pide una `Promise` (no la subclase
 * `APIPromise` real): un `TypeSafeClient` real sigue siendo asignable aquí
 * (APIPromise extiende Promise), pero un doble de test puede devolver una
 * Promise común sin construir una `Response` real.
 */
export interface TypeSafeClientLike {
  systemOne<const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: RequestOptions
  ): Promise<SystemOneResult<Q>>;
}

export interface JevClientConfig extends TypeSafeClientConfig {
  /** Solo para tests: inyecta un cliente ya construido (real o doble de prueba), evitando el constructor real del SDK. Nunca se usa en producción -- ahí siempre se construye un TypeSafeClient real. */
  client?: TypeSafeClientLike;
}

/** Niveles de relevancia por defecto para score() -- rúbrica genérica, reutilizable para cualquier "qué tan relevante/prioritario es esto". */
const RELEVANCE_LEVELS = [
  "Nada relevante para el objetivo indicado",
  "Poco relevante",
  "Relevante",
  "Muy relevante, debería priorizarse",
] as const;

const MAX_STATE_CHARS = 6000;

/** Empaqueta subject/criteria/context en un `state` seguro para JEV -- nunca incluye config/apiKey, y acota el tamaño (nunca trunca de forma que invente contenido, solo recorta). */
function buildState(parts: Record<string, unknown>): string {
  const json = JSON.stringify(parts, null, 0);
  if (json.length <= MAX_STATE_CHARS) return json;
  return `${json.slice(0, MAX_STATE_CHARS)}…(truncado, ${json.length} caracteres originales)`;
}

/**
 * Crea el DecisionProvider respaldado por JEV. Sin key (explícita o
 * TYPESAFE_API_KEY), cada método lanza JevNotConfiguredError de inmediato.
 * Con key, cada método hace una llamada real vía @typesafe-ai/sdk.
 */
export function createJevDecisionProvider(config?: JevClientConfig): DecisionProvider {
  let cachedClient: TypeSafeClientLike | null = config?.client ?? null;

  function getClientOrThrow(method: string): TypeSafeClientLike {
    if (cachedClient) return cachedClient;
    try {
      // El propio SDK resuelve config.apiKey -> process.env.TYPESAFE_API_KEY
      // -> lanza si ninguno está presente. Nunca se lee process.env aquí.
      cachedClient = new TypeSafeClient(config);
      return cachedClient;
    } catch {
      throw new JevNotConfiguredError(method);
    }
  }

  return {
    name: "jev",

    classify({ subject, labels, context }: ClassifyInput): ClassifyResult | Promise<ClassifyResult> {
      const client = getClientOrThrow("classify"); // síncrono: lanza de inmediato si no hay key
      if (labels.length === 0) throw new Error("JevDecisionProvider.classify: se requiere al menos una label.");

      return (async () => {
        const criteria: ChoiceCriteria = Object.fromEntries(labels.map((label) => [label, null]));
        const state = buildState({ subject, context: context ?? null });
        const result = await client.systemOne({
          state,
          questions: { result: choice("¿Cuál de estas categorías corresponde mejor al `subject` dado?", criteria) },
        });
        const answer = result.answers.result;
        return {
          label: answer.choice,
          confidence: {
            value: answer.confidence,
            provenance: { model: result.model, probabilities: answer.probabilities },
          },
        };
      })();
    },

    score({ subject, criteria, context }: ScoreInput): ScoreResult | Promise<ScoreResult> {
      const client = getClientOrThrow("score");

      return (async () => {
        const state = buildState({ subject, criteria: criteria ?? null, context: context ?? null });
        const result = await client.systemOne({
          state,
          questions: {
            result: typesafeScore(
              "¿Qué tan relevante/prioritario es el `subject` dado para el objetivo descrito en `criteria`/`context`?",
              RELEVANCE_LEVELS
            ),
          },
        });
        const answer = result.answers.result;
        // Normaliza a [0,1] -- RELEVANCE_LEVELS tiene 4 niveles (índices 0..3).
        const normalized = answer.score / (RELEVANCE_LEVELS.length - 1);
        return {
          score: normalized,
          confidence: {
            value: answer.confidence,
            provenance: { model: result.model, probabilities: answer.probabilities, legend: answer.legend },
          },
        };
      })();
    },

    choose<T>({ options, context }: ChooseInput<T>): ChooseResult<T> | Promise<ChooseResult<T>> {
      const client = getClientOrThrow("choose");
      if (options.length === 0) throw new Error("JevDecisionProvider.choose: options vacío.");

      return (async () => {
        const criteria: ChoiceCriteria = Object.fromEntries(
          options.map((option, index) => [String(index), JSON.stringify(option)])
        );
        const state = buildState({ options_count: options.length, context: context ?? null });
        const result = await client.systemOne({
          state,
          questions: { result: choice("Elige la mejor opción entre las disponibles en `criteria`.", criteria) },
        });
        const answer = result.answers.result;
        const chosenIndex = Number(answer.choice);
        return {
          choice: options[chosenIndex],
          confidence: {
            value: answer.confidence,
            provenance: { model: result.model, probabilities: answer.probabilities },
          },
        };
      })();
    },
  };
}
