// internetAccessLayer.js — Punto único de entrada para Marketing Intelligence.
//
// Marketing Intelligence solo conoce fetch(source, query) — nunca los
// adapters ni sus backends internos directamente. Si un adapter cambia de
// implementación (ej. Web deja de usar Jina y pasa a usar Agent Reach
// instalado, o X pasa de cuenta de investigación a API oficial), esta clase
// no cambia.

export class InternetAccessLayer {
  constructor({ rawStore, cache }) {
    this.rawStore = rawStore;
    this.cache = cache;
    this.adapters = new Map();
  }

  registerAdapter(source, adapterFn) {
    this.adapters.set(source, adapterFn);
  }

  async fetch(source, query, options = {}) {
    const adapter = this.adapters.get(source);
    if (!adapter) throw new Error(`InternetAccessLayer: no hay adapter registrado para "${source}"`);

    if (!options.forceRefresh && this.cache.isFresh(source, query)) {
      const cached = this.cache.get(source, query);
      return {
        records: cached.record_ids.map((id) => this.rawStore.loadByRecordId(id)).filter(Boolean),
        fromCache: true,
      };
    }

    const records = await adapter(query, options);
    const storageDetail = records.map((record) => ({ record, ...this.rawStore.save(record) }));
    this.cache.markFetched(source, query, records.map((r) => r.record_id));

    return { records, fromCache: false, storageDetail };
  }
}
