// types.ts — DecisionProvider: abstracción provider-agnostic para
// decisiones/clasificación (distinta de generación de texto/razonamiento
// profundo). Motivo: Hermes usará eventualmente JEV (TypeSafe AI) como
// motor especializado de decisiones, separado de los modelos generativos --
// esta interfaz es el punto de enchufe, no un requisito.
//
// NO forma parte del Intelligence Store ni de MI-4: ningún archivo de
// detection/ importa nada de aquí. Es infraestructura extensible de Hermes
// que MI-4 (o cualquier otra capa) puede consultar opcionalmente en el
// futuro cuando una decisión concreta requiera juicio aprendido en vez de
// una regla determinista -- nunca al revés (una regla suficiente nunca se
// reemplaza por esto).
//
//   deterministic rule
//         ↓
//   ¿la decisión requiere juicio aprendido?
//         ↓
//   DecisionProvider -> (JEV u otro) -> confidence
//         ├── alta confianza -> aceptar
//         └── baja confianza -> escalar / razonamiento más pesado (Claude)

export interface DecisionConfidence {
  value: number; // 0..1
  /** De dónde sale esta decisión -- nunca se pierde al usar un provider aprendido. */
  provenance?: unknown;
}

export interface ClassifyInput {
  subject: unknown;
  labels: string[];
  context?: unknown;
}

export interface ClassifyResult {
  label: string;
  confidence: DecisionConfidence;
}

export interface ScoreInput {
  subject: unknown;
  criteria?: unknown;
  context?: unknown;
}

export interface ScoreResult {
  score: number;
  confidence: DecisionConfidence;
}

export interface ChooseInput<T = unknown> {
  options: T[];
  context?: unknown;
}

export interface ChooseResult<T = unknown> {
  choice: T;
  confidence: DecisionConfidence;
}

/**
 * Cualquier motor de decisión/clasificación -- determinista, JEV, o
 * cualquier otro -- implementa exactamente esta forma. Intercambiable: el
 * llamador nunca sabe (ni le importa) qué hay detrás.
 */
export interface DecisionProvider {
  readonly name: string;
  classify(input: ClassifyInput): Promise<ClassifyResult> | ClassifyResult;
  score(input: ScoreInput): Promise<ScoreResult> | ScoreResult;
  choose<T>(input: ChooseInput<T>): Promise<ChooseResult<T>> | ChooseResult<T>;
}
