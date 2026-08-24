// cache.js — Evita volver a CONSULTAR una fuente si ya se hizo la misma
// consulta hace poco (independiente de la deduplicación por content_hash de
// rawStore.js, que actúa a nivel de registro individual ya descargado).
//
// TTL por fuente — deliberadamente conservador para esta fase (sin scheduling
// productivo todavía, ver docs de arquitectura §8/§16).

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DEFAULT_TTL_MS = {
  web: 24 * 60 * 60 * 1000,
  rss: 60 * 60 * 1000,
  github: 6 * 60 * 60 * 1000,
};
const FALLBACK_TTL_MS = 60 * 60 * 1000;

export class QueryCache {
  constructor(baseDir) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
    this.path = join(this.baseDir, 'index.json');
    this.index = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : {};
  }

  _key(source, query) {
    return createHash('sha256').update(`${source}::${query}`).digest('hex');
  }

  isFresh(source, query) {
    const entry = this.index[this._key(source, query)];
    if (!entry) return false;
    const ttl = DEFAULT_TTL_MS[source] ?? FALLBACK_TTL_MS;
    return Date.now() - new Date(entry.retrieved_at).getTime() < ttl;
  }

  get(source, query) {
    return this.index[this._key(source, query)] ?? null;
  }

  markFetched(source, query, recordIds) {
    const key = this._key(source, query);
    this.index[key] = { source, query, retrieved_at: new Date().toISOString(), record_ids: recordIds };
    writeFileSync(this.path, JSON.stringify(this.index, null, 2), 'utf8');
  }
}
