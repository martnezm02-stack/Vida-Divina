// rawStore.js — Almacenamiento RAW de Website Intelligence (capa A, Fase 8).
//
// Append-only JSONL, un archivo por sitio (data/raw/<hostname>.jsonl) —
// mismo principio de partición que marketing-intelligence, pero agrupado por
// dominio en vez de por plataforma.
//
// Diferencia deliberada frente a marketing-intelligence/src/storage/rawStore.js:
// un post social es inmutable una vez publicado, así que deduplicar solo por
// content_hash tiene sentido. Una página web CAMBIA con el tiempo — la misma
// URL puede legítimamente producir contenido distinto en dos capturas. Por
// eso este store distingue tres casos, nunca los confunde:
//
//   1. Misma URL + mismo content_hash  → duplicado real, no se vuelve a guardar.
//   2. Misma URL + content_hash distinto → NUEVA VERSIÓN de la misma página;
//      se guarda y se enlaza automáticamente a la versión anterior
//      (version_of), permitiendo detección de cambios futura sin programar
//      ningún proceso de re-visita aquí (eso es una decisión de scheduling,
//      fuera de esta fase).
//   3. URLs distintas + mismo content_hash → contenido idéntico en otra
//      dirección (ej. mirror, duplicado, redirect canónico distinto). NO se
//      trata como duplicado (son identidades distintas) — se informa como
//      dato, nunca se descarta.
//
// Nunca se mezcla con inteligencia derivada (WebsitePatternObservation vive
// en otro store, todavía no construido — ver traceability.js, que documenta
// esa dependencia pendiente).

import { mkdirSync, existsSync, readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class WebsiteRawStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
    this._byUrl = new Map(); // url -> [{ raw_id, content_hash, retrieved_at }] ordenado por retrieved_at asc
    this._byHash = new Map(); // content_hash -> Set<url>
    this._loadedSites = new Set();
  }

  _filePath(site) {
    return join(this.baseDir, `${site}.jsonl`);
  }

  _indexRecord(record) {
    const entries = this._byUrl.get(record.url) ?? [];
    entries.push({ raw_id: record.raw_id, content_hash: record.content_hash, retrieved_at: record.retrieved_at });
    this._byUrl.set(record.url, entries);

    const urls = this._byHash.get(record.content_hash) ?? new Set();
    urls.add(record.url);
    this._byHash.set(record.content_hash, urls);
  }

  _ensureLoaded(site) {
    if (this._loadedSites.has(site)) return;
    const path = this._filePath(site);
    if (existsSync(path)) {
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          this._indexRecord(JSON.parse(line));
        } catch {
          // Línea corrupta: se ignora, no bloquea la carga del resto del archivo.
        }
      }
    }
    this._loadedSites.add(site);
  }

  /**
   * Persiste un WebsiteRawRecord. Devuelve siempre un objeto descriptivo del
   * resultado — nunca lanza para los casos 1-3 descritos arriba, son
   * resultados esperados de un store que modela contenido mutable.
   */
  save(record) {
    this._ensureLoaded(record.site);

    const sameUrlEntries = this._byUrl.get(record.url) ?? [];
    const exactDuplicate = sameUrlEntries.find((e) => e.content_hash === record.content_hash);
    if (exactDuplicate) {
      return { stored: false, reason: 'duplicate_content_same_url', existing_raw_id: exactDuplicate.raw_id };
    }

    const isNewVersion = sameUrlEntries.length > 0;
    const previousEntry = isNewVersion ? sameUrlEntries[sameUrlEntries.length - 1] : null;
    const finalRecord = isNewVersion && !record.version_of
      ? Object.freeze({ ...record, version_of: previousEntry.raw_id })
      : record;

    const sameContentOtherUrls = [...(this._byHash.get(record.content_hash) ?? new Set())].filter((u) => u !== record.url);

    appendFileSync(this._filePath(record.site), JSON.stringify(finalRecord) + '\n', 'utf8');
    this._indexRecord(finalRecord);

    return {
      stored: true,
      raw_id: finalRecord.raw_id,
      is_new_version: isNewVersion,
      previous_raw_id: previousEntry?.raw_id ?? null,
      same_content_as_urls: sameContentOtherUrls, // informativo — nunca se trata como duplicado
    };
  }

  loadAll(site) {
    this._ensureLoaded(site);
    const path = this._filePath(site);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  }

  loadByRawId(rawId) {
    if (!existsSync(this.baseDir)) return null;
    const files = readdirSync(this.baseDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
      const site = file.replace(/\.jsonl$/, '');
      const found = this.loadAll(site).find((r) => r.raw_id === rawId);
      if (found) return found;
    }
    return null;
  }

  /** Todas las capturas de una URL, ordenadas cronológicamente (versionado). */
  loadVersions(url, site) {
    return this.loadAll(site)
      .filter((r) => r.url === url)
      .sort((a, b) => new Date(a.retrieved_at) - new Date(b.retrieved_at));
  }

  loadLatest(url, site) {
    const versions = this.loadVersions(url, site);
    return versions.length > 0 ? versions[versions.length - 1] : null;
  }
}
