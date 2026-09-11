// publishingScheduler.js — ejecutor real. Orquesta media-hosting/
// (MediaHostingService) y content-orchestrator/src/publishing/
// publishingService.js#publish (MetaAdapter/FacebookAdapter reales) SIN
// reimplementar ninguno de los dos -- ambos se inyectan por constructor
// (mismo criterio que decision-engine/ conectando recommendation-engine/ y
// simulator/ sin modificarlos).
//
// APPROVAL_GATE (defensa en profundidad, mismo criterio que
// instagramPublicationAdapter.js/publishingService.js de content-strategy:
// nunca confía en que approve()/schedule() ya garantizan el estado -- lo
// re-verifica de forma independiente en el momento real de publicar):
//   - solo se publica un registro con approvedAt real (pasó por approve());
//   - solo si su assetPackageSnapshot sigue status "COMPLETED" (FINAL real);
//   - nunca se publica un externalPublicationId ya existente (idempotencia:
//     si Meta ya confirmó éxito una vez, jamás se reintenta esa publicación).
//
// RETRIES: límite MAX_RETRY_COUNT (scheduledPublication.js) -- superado,
// el registro pasa a FAILED terminal, nunca reintentos infinitos.

import { zonedTimeToUtcIso } from './timezone.js';
import { MAX_RETRY_COUNT } from './scheduledPublication.js';
import * as defaultStore from './scheduledPublicationStore.js';

export class PublishingScheduler {
  /**
   * @param {{mediaHostingService:object, publish:Function, store?:object, now?:Function}} deps
   * `publish` debe ser la función real
   * content-orchestrator/src/publishing/publishingService.js#publish (o un
   * override de test con la misma firma) -- este módulo nunca llama a Meta
   * directamente.
   */
  constructor({ mediaHostingService, publish, store = defaultStore, now = () => new Date() }) {
    if (!mediaHostingService) throw new Error('PublishingScheduler: "mediaHostingService" es obligatorio.');
    if (typeof publish !== 'function') throw new Error('PublishingScheduler: "publish" (content-orchestrator publishingService#publish real) es obligatorio.');
    this._mediaHostingService = mediaHostingService;
    this._publish = publish;
    this._store = store;
    this._now = now;
  }

  /** DRAFT -> APPROVED. Re-verifica que el Final Asset Package siga siendo FINAL real. */
  approve(id, { approvedBy }) {
    const record = this._store.get(id);
    if (!record) throw new Error(`PublishingScheduler.approve: no existe ScheduledPublication "${id}".`);
    if (record.status !== 'DRAFT') throw new Error(`PublishingScheduler.approve: solo se aprueba desde DRAFT (estado actual: "${record.status}").`);
    if (!approvedBy?.trim()) throw new Error('PublishingScheduler.approve: "approvedBy" es obligatorio -- nunca una aprobación anónima.');
    if (record.assetPackageSnapshot?.status !== 'COMPLETED') {
      throw new Error(`PublishingScheduler.approve: el Final Asset Package no está "COMPLETED" (estado: "${record.assetPackageSnapshot?.status}") -- solo contenido FINAL puede aprobarse.`);
    }
    const nowIso = this._now().toISOString();
    return this._store.save({ ...record, status: 'APPROVED', approvedAt: nowIso, approvedBy: approvedBy.trim(), updatedAt: nowIso });
  }

  /**
   * APPROVED -> SCHEDULED. Guarda scheduledAt (instante UTC real) + timezone
   * explícito (nunca se asume UTC sin convertir).
   *
   * Corrección "Persistencia de fecha/hora/timezone desde DRAFT"
   * (2026-09-04): date/time/timezone ahora son OPCIONALES aquí -- si el
   * llamador los manda explícitos, esos SIEMPRE mandan (el usuario puede
   * cambiar de opinión justo antes de programar); si no los manda, se
   * reutilizan record.pendingDate/pendingTime/timezone ya persistidos desde
   * createScheduledPublication() (nunca un Map de frontend). Un registro
   * histórico sin pending* (creado antes de esta corrección) sigue
   * exigiendo los tres explícitos -- zonedTimeToUtcIso lanza el mismo error
   * real de siempre si faltan.
   */
  schedule(id, { date, time, timezone } = {}) {
    const record = this._store.get(id);
    if (!record) throw new Error(`PublishingScheduler.schedule: no existe ScheduledPublication "${id}".`);
    if (record.status !== 'APPROVED') throw new Error(`PublishingScheduler.schedule: solo se programa desde APPROVED (estado actual: "${record.status}").`);
    const finalDate = date ?? record.pendingDate;
    const finalTime = time ?? record.pendingTime;
    const finalTimezone = timezone ?? record.timezone;
    const scheduledAt = zonedTimeToUtcIso(finalDate, finalTime, finalTimezone);
    const nowIso = this._now().toISOString();
    // pendingDate/pendingTime ya cumplieron su propósito (prellenar antes de
    // aprobar) -- se limpian al confirmar SCHEDULED para que scheduledAt +
    // timezone vuelvan a ser la única fuente de verdad, igual que antes de
    // esta corrección.
    return this._store.save({ ...record, status: 'SCHEDULED', scheduledAt, timezone: finalTimezone, pendingDate: null, pendingTime: null, updatedAt: nowIso });
  }

  /** Cancela desde cualquier estado no terminal. */
  cancel(id) {
    const record = this._store.get(id);
    if (!record) throw new Error(`PublishingScheduler.cancel: no existe ScheduledPublication "${id}".`);
    if (record.status === 'PUBLISHED' || record.status === 'CANCELLED') {
      throw new Error(`PublishingScheduler.cancel: no se puede cancelar desde "${record.status}".`);
    }
    return this._store.save({ ...record, status: 'CANCELLED', updatedAt: this._now().toISOString() });
  }

  /** Publicaciones SCHEDULED cuyo scheduledAt ya venció -- lectura pura, no ejecuta nada. */
  findDuePublications() {
    const nowMs = this._now().getTime();
    return this._store.list().filter((r) => r.status === 'SCHEDULED' && new Date(r.scheduledAt).getTime() <= nowMs);
  }

  /** `operationId` (record.id real) -- ver nota "URL ÚNICA POR OPERACIÓN DE PUBLICACIÓN" en mediaHostingService.js: debe ser el MISMO que se usó en upload() para que delete() apunte a la key real subida, nunca a `final/${assetId}`. */
  async _deleteHosted(hostedAssetIds, operationId) {
    for (const assetId of hostedAssetIds) {
      try { await this._mediaHostingService.delete(assetId, operationId); } catch { /* borrar la copia remota es best-effort -- nunca invalida un resultado ya decidido (PUBLISHED/FAILED) */ }
    }
  }

  async _retryOrFail(record, error, hostedAssetIds = [], operationId = null) {
    await this._deleteHosted(hostedAssetIds, operationId);
    const retryCount = (record.retryCount ?? 0) + 1;
    const nowIso = this._now().toISOString();
    if (retryCount > MAX_RETRY_COUNT) {
      return this._store.save({ ...record, status: 'FAILED', error, retryCount, updatedAt: nowIso });
    }
    // Vuelve a SCHEDULED con el mismo scheduledAt (ya vencido) -- el próximo tick del scheduler lo vuelve a recoger como "vencido".
    return this._store.save({ ...record, status: 'SCHEDULED', error, retryCount, updatedAt: nowIso });
  }

  /** Ejecuta UNA publicación vencida real. Público para poder testear/operar un registro a la vez. */
  async runOne(record) {
    const current = this._store.get(record.id);
    if (!current || current.status !== 'SCHEDULED') return current;

    // Idempotencia dura: si Meta ya confirmó éxito una vez, jamás se reintenta.
    if (current.externalPublicationId) {
      return this._store.save({ ...current, status: 'PUBLISHED', updatedAt: this._now().toISOString() });
    }
    if (!current.approvedAt) {
      return this._store.save({ ...current, status: 'FAILED', error: 'PublishingScheduler: registro SCHEDULED sin approvedAt -- estado inválido, nunca se publica sin una aprobación verificada.', updatedAt: this._now().toISOString() });
    }
    const pkg = current.assetPackageSnapshot;
    if (pkg?.status !== 'COMPLETED') {
      return this._store.save({ ...current, status: 'FAILED', error: `PublishingScheduler: el Final Asset Package ya no es "COMPLETED" (estado: "${pkg?.status}").`, updatedAt: this._now().toISOString() });
    }

    let publishing = this._store.save({ ...current, status: 'PUBLISHING', updatedAt: this._now().toISOString() });

    // URL ÚNICA POR OPERACIÓN DE PUBLICACIÓN (ver mediaHostingService.js):
    // record.id real + retryCount real (ambos ya existentes, nunca
    // inventados) -- así CADA intento real (incluidos los reintentos, que
    // vuelven a subir tras borrar la copia anterior) recibe su propia URL
    // pública, nunca la reutilizada de un intento previo de este mismo
    // registro.
    const operationId = `${current.id}:${current.retryCount ?? 0}`;

    const isCarousel = pkg.assetPackageType === 'CAROUSEL';
    const assetsToHost = isCarousel ? (pkg.assetPackage?.assets ?? []) : (pkg.outputAssets ?? []).slice(0, 1);
    if (assetsToHost.length === 0) {
      return this._store.save({ ...publishing, status: 'FAILED', error: 'PublishingScheduler: el Final Asset Package no tiene ningún asset real que publicar.', updatedAt: this._now().toISOString() });
    }

    const hostedAssetIds = [];
    const hostedUrls = [];
    for (const asset of assetsToHost) {
      const uploadResult = await this._mediaHostingService.upload({ assetId: asset.assetId, localPath: asset.path, assetKind: 'FINAL', approved: true, operationId });
      if (uploadResult.status === 'CONFIGURATION_REQUIRED') {
        await this._deleteHosted(hostedAssetIds, operationId);
        return this._store.save({ ...publishing, status: 'CONFIGURATION_REQUIRED', error: uploadResult.error, updatedAt: this._now().toISOString() });
      }
      if (uploadResult.status !== 'UPLOADED') {
        return this._retryOrFail(publishing, uploadResult.error ?? 'MediaHostingService: fallo desconocido al subir el asset.', hostedAssetIds, operationId);
      }
      hostedAssetIds.push(asset.assetId);
      hostedUrls.push(uploadResult.publicUrl);
    }

    const metadata = { caption: current.caption };
    if (isCarousel) metadata.mediaUrls = hostedUrls;
    else metadata.mediaUrl = hostedUrls[0];

    let publishResult;
    try {
      publishResult = await this._publish(pkg, current.platform, current.destination, metadata);
    } catch (err) {
      return this._retryOrFail(publishing, `publish() lanzó inesperadamente: ${err.message}`, hostedAssetIds, operationId);
    }

    if (publishResult.status === 'CONFIGURATION_REQUIRED') {
      await this._deleteHosted(hostedAssetIds, operationId);
      return this._store.save({ ...publishing, status: 'CONFIGURATION_REQUIRED', error: publishResult.detail ?? publishResult.error, updatedAt: this._now().toISOString() });
    }
    if (publishResult.status !== 'PUBLISHED') {
      return this._retryOrFail(publishing, publishResult.error ?? `publish: status real inesperado "${publishResult.status}".`, hostedAssetIds, operationId);
    }

    // Publicado real: se borra la copia remota (Meta ya la ingirió a su propio almacenamiento) -- best-effort, nunca revierte el PUBLISHED ya confirmado.
    await this._deleteHosted(hostedAssetIds, operationId);
    return this._store.save({
      ...publishing, status: 'PUBLISHED', externalPublicationId: publishResult.externalId,
      publishedAt: this._now().toISOString(), error: null, updatedAt: this._now().toISOString(),
    });
  }

  /** Corre todas las publicaciones vencidas reales, secuencialmente (nunca en paralelo -- evita condiciones de carrera sobre el mismo store de archivos). */
  async runDuePublications() {
    const due = this.findDuePublications();
    const results = [];
    for (const record of due) results.push(await this.runOne(record));
    return results;
  }
}
