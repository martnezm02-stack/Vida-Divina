// performanceSource.js — Interfaz PerformanceSource + ManualPerformanceSource
// (Fase 12, §11).
//
// Mismo patrón arquitectónico que AcquisitionBackend en marketing-intelligence
// (Fase 4): una interfaz abstracta + un motor intercambiable. En este MVP el
// ÚNICO motor real es ManualPerformanceSource — permite introducir un
// dataset pequeño y controlado (fixture sintético o, si existiera, un
// dataset real ya presente en el proyecto) sin ninguna credencial, cuenta ni
// dependencia nueva. Conectar TikTok/Instagram/Facebook/YouTube reales sería
// un futuro PerformanceSource adicional detrás de esta misma interfaz — no
// implementado ni autorizado en esta fase.

export class PerformanceSource {
  get name() {
    throw new Error('PerformanceSource: la propiedad "name" debe implementarse en la subclase');
  }

  // eslint-disable-next-line no-unused-vars
  async fetch(query) {
    throw new Error('PerformanceSource.fetch() debe implementarse en la subclase');
  }
}

export class ManualPerformanceSource extends PerformanceSource {
  constructor(records = []) {
    super();
    this._records = records;
  }

  get name() {
    return 'manual_performance_source';
  }

  // query se ignora deliberadamente en este MVP: el dataset manual completo
  // se entrega tal cual, ya que su propósito es probar el pipeline, no
  // filtrar una fuente real.
  async fetch() {
    return this._records;
  }
}
