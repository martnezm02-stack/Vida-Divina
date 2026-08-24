// analysisCache.js — Evita volver a ANALIZAR (con costo potencial) un
// registro RAW cuyo contenido ya fue procesado por el mismo proveedor.
//
// Distinto de QueryCache (evita volver a CONSULTAR una fuente) y del
// deduplicado por content_hash de RawStore (evita volver a ALMACENAR
// contenido idéntico). Esta capa opera un nivel más arriba: evita volver a
// PAGAR/EJECUTAR el análisis de algo que ya se analizó.
//
// La clave incluye el nombre del proveedor: si se cambia de proveedor
// heurístico a uno más capaz, el contenido se reanaliza — no se reutiliza a
// ciegas un resultado de menor calidad.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class AnalysisCache {
  constructor(baseDir) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
    this.path = join(this.baseDir, 'analysis_index.json');
    this.index = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : {};
  }

  _key(contentHash, providerName) {
    return `${contentHash}::${providerName}`;
  }

  hasAnalyzed(contentHash, providerName) {
    return Boolean(this.index[this._key(contentHash, providerName)]);
  }

  get(contentHash, providerName) {
    return this.index[this._key(contentHash, providerName)] ?? null;
  }

  markAnalyzed(contentHash, providerName, detail) {
    this.index[this._key(contentHash, providerName)] = { ...detail, analyzed_at: new Date().toISOString() };
    writeFileSync(this.path, JSON.stringify(this.index, null, 2), 'utf8');
  }
}
