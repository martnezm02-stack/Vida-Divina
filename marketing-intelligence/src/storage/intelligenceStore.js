// intelligenceStore.js — Almacenamiento de inteligencia derivada (capa B).
//
// Nunca contiene el contenido RAW completo — solo evidence_quote corto (en las
// observaciones) y referencias por id a la capa A (rawStore.js). Tres archivos
// JSONL separados: observations, inferences, hypotheses — ver src/pipeline/
// para cómo se generan y docs de arquitectura para la cadena de trazabilidad
// SOURCE → OBSERVATION → INFERENCE → HYPOTHESIS.

import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = {
  observation: 'observations.jsonl',
  inference: 'inferences.jsonl',
  hypothesis: 'hypotheses.jsonl',
  claim: 'claims.jsonl', // Fase 3
  trend: 'trends.jsonl', // Fase 3
  cost_audit: 'cost_audit.jsonl', // Fase 5 — un registro por llamada REAL a un LLM, nunca contiene secretos
};

export class IntelligenceStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
  }

  _path(kind) {
    if (!FILES[kind]) throw new Error(`IntelligenceStore: tipo desconocido "${kind}"`);
    return join(this.baseDir, FILES[kind]);
  }

  save(kind, entry) {
    appendFileSync(this._path(kind), JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  }

  loadAll(kind) {
    const path = this._path(kind);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  }
}
