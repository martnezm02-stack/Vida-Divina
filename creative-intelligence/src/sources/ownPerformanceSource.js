// ownPerformanceSource.js — contrato para una futura fuente de desempeño
// propio (Instagram, Facebook, y más adelante Meta Ads). NO importa ni
// envuelve instagramAccountReader.js/instagramMediaReader.js/
// instagramInsightsReader.js en esta fase — esos archivos permanecen
// exactamente como están. Conectar un motor real detrás de esta interfaz
// (ej. InstagramOwnPerformanceSource, reutilizando esos tres lectores tal
// cual) es un paso trivial y bien acotado para una fase futura autorizada,
// no ejecutado aquí.

export class OwnPerformanceSource {
  get name() {
    throw new Error('OwnPerformanceSource: la propiedad "name" debe implementarse en la subclase');
  }

  /**
   * @param {{ creativeCellId?: string, platform?: string, contentId?: string }} query
   * @returns {Promise<object[]>} lista de snapshots — forma esperada ver PerformanceMetricsShape más abajo.
   */
  // eslint-disable-next-line no-unused-vars
  async fetchPerformance(query) {
    throw new Error('OwnPerformanceSource.fetchPerformance() debe implementarse en la subclase');
  }
}

/**
 * Forma esperada de cada snapshot que un motor real entregaría —
 * compatible con lo que instagramInsightsReader.js YA devuelve hoy
 * (reach, likes, comments, saved, shares, total_interactions, views —
 * nunca impressions, confirmado no soportada por Meta).
 * @typedef {{
 *   platform: string,
 *   contentId: string,
 *   creativeCellId: string | null,
 *   date: string,
 *   reach: number | null,
 *   views: number | null,
 *   likes: number | null,
 *   comments: number | null,
 *   saved: number | null,
 *   shares: number | null,
 *   totalInteractions: number | null,
 * }} OwnPerformanceSnapshotShape
 */

/** Único motor real de esta fase: no conecta ninguna plataforma, nunca inventa un snapshot. */
export class NullOwnPerformanceSource extends OwnPerformanceSource {
  get name() {
    return 'null_own_performance_source';
  }

  async fetchPerformance() {
    return [];
  }
}
