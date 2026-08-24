// store.js — ContentStrategyStore (Fase 13). Append-only, propio (mismo
// criterio de independencia ya usado en viral-content-intelligence y
// performance-learning-intelligence: entidades conceptualmente distintas de
// las de otros módulos, aunque la CLASE tenga la misma forma).

import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = Object.freeze({
  content_strategy: 'content_strategies.jsonl',
  content_experiment: 'content_experiments.jsonl',
  content_plan: 'content_plans.jsonl',
  content_item: 'content_items.jsonl',
  content_draft: 'content_drafts.jsonl',
  human_review_record: 'human_review_records.jsonl', // Fase 16 — registro append-only de cada decisión humana real
});

export class ContentStrategyStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
  }

  _path(kind) {
    if (!FILES[kind]) throw new Error(`ContentStrategyStore: tipo desconocido "${kind}" (válidos: ${Object.keys(FILES).join(', ')})`);
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
