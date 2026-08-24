// rawStore.js — Almacenamiento RAW (capa A).
//
// Append-only JSONL, un archivo por fuente (data/raw/<source>.jsonl). Nunca se
// mezcla con inteligencia derivada — esa vive en intelligenceStore.js, en un
// directorio distinto. Deduplica por content_hash antes de escribir: si el
// contenido ya existe, no se vuelve a guardar (ver también QueryCache en
// cache.js, que evita incluso volver a *consultar* la fuente).

import { mkdirSync, existsSync, readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class RawStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
    this._hashIndex = new Map(); // content_hash -> record_id
    this._loadedSources = new Set();
  }

  _filePath(source) {
    return join(this.baseDir, `${source}.jsonl`);
  }

  _ensureLoaded(source) {
    if (this._loadedSources.has(source)) return;
    const path = this._filePath(source);
    if (existsSync(path)) {
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          this._hashIndex.set(record.content_hash, record.record_id);
        } catch {
          // Línea corrupta: se ignora, no bloquea la carga del resto del archivo.
        }
      }
    }
    this._loadedSources.add(source);
  }

  has(contentHash) {
    return this._hashIndex.has(contentHash);
  }

  /**
   * Persiste un registro RAW. Devuelve { stored: false, reason: 'duplicate_content_hash' }
   * si ya existe contenido idéntico — nunca lanza por esto, es un caso esperado.
   */
  save(record) {
    this._ensureLoaded(record.source);
    if (this._hashIndex.has(record.content_hash)) {
      return { stored: false, reason: 'duplicate_content_hash', existing_record_id: this._hashIndex.get(record.content_hash) };
    }
    appendFileSync(this._filePath(record.source), JSON.stringify(record) + '\n', 'utf8');
    this._hashIndex.set(record.content_hash, record.record_id);
    return { stored: true };
  }

  loadAll(source) {
    this._ensureLoaded(source);
    const path = this._filePath(source);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  }

  loadByRecordId(recordId) {
    if (!existsSync(this.baseDir)) return null;
    const files = readdirSync(this.baseDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
      const source = file.replace(/\.jsonl$/, '');
      const found = this.loadAll(source).find((r) => r.record_id === recordId);
      if (found) return found;
    }
    return null;
  }
}
