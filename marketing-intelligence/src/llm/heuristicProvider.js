// heuristicProvider.js — Proveedor por defecto de esta fase: implementa
// LLMProvider con detectores basados en reglas (NO un modelo de lenguaje).
//
// Es un "stand-in" honesto: cumple exactamente la misma interfaz que usaría
// un proveedor real (Anthropic, etc.), así que sustituirlo más adelante no
// requiere cambiar el agente ni el resto del pipeline — solo instanciar otra
// clase. Costo por documento: $0 (no hay llamada de red).

import { LLMProvider } from './llmProvider.js';
import { detectHooksAndAngles } from '../agent/heuristics/hooksAndAngles.js';
import { detectPersuasionSignals } from '../agent/heuristics/persuasionSignals.js';
import { detectAudience } from '../agent/heuristics/audience.js';
import { detectFormat } from '../agent/heuristics/format.js';

export class HeuristicLLMProvider extends LLMProvider {
  get name() {
    return 'heuristic_v1';
  }

  get costPerDocumentUsd() {
    return 0;
  }

  async analyze(content, context) {
    return [
      ...detectHooksAndAngles(content, context),
      ...detectPersuasionSignals(content),
      ...detectAudience(content),
      ...detectFormat(content, context),
    ];
  }
}
