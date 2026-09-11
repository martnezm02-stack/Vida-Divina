// mediaHostingService.js — punto de entrada único de esta fase.
// upload/getPublicUrl/delete/exists según el contrato pedido. Aplica el
// gate de seguridad (defensa en profundidad, mismo criterio que
// instagramPublicationAdapter.js/publishingService.js: nunca confía en que
// el llamador ya validó todo):
//
//   - solo assetKind === 'FINAL' (nunca RAW, GENERATED ni EDITED);
//   - solo approved === true (nunca contenido sin aprobación explícita);
//   - solo JPEG/PNG/MP4 (contentTypeForPath -- otra extensión, rechazo);
//   - nunca mueve el archivo local: siempre lee y sube una copia, el
//     original permanece intacto y no se toca ni se borra;
//   - la clave remota es `final/${assetId}` (SIN extensión) -- así
//     getPublicUrl/exists/delete son funciones puras de assetId, sin
//     necesitar estado en memoria que se pierda si el proceso reinicia
//     (importante: el PublishingScheduler corre en un tick posterior,
//     potencialmente tras un reinicio del servidor del dashboard).
//   - sin credenciales R2 configuradas, CONFIGURATION_REQUIRED explícito
//     en TODAS las operaciones reales -- nunca se intenta la red.
//
// URL ÚNICA POR OPERACIÓN DE PUBLICACIÓN (bug real diagnosticado
// 2026-09-11, publicación de Instagram con video/caption equivocados):
// confirmado con un experimento controlado contra el Graph API real que
// Meta reutiliza/asocia lo que ya procesó cuando recibe una URL pública que
// YA le habíamos dado antes -- mismos bytes + URL NUEVA = contenido/caption
// correctos; mismos bytes + MISMA URL (reusada porque la key es puramente
// `final/${assetId}`, direccionada por contenido) = Meta devuelve el
// video/caption de la primera vez. La key sigue siendo determinística por
// `assetId` (content-addressed) para el caso general -- el parámetro
// opcional `operationId` (abajo) SOLO lo usan los llamadores que preparan
// un archivo para publicar en Meta (autoHostIfNeeded en
// dashboard/server/routes/generation.js, PublishingScheduler#runOne), que
// ya tienen un identificador real de la operación (requestId del Final
// Asset Package / id del ScheduledPublication) -- nunca se inventa uno
// nuevo. Sin `operationId`, el comportamiento es EXACTAMENTE el de antes
// (`final/${assetId}`) -- ningún llamador existente cambia de
// comportamiento a menos que pase `operationId` explícitamente.

import { existsSync, statSync } from 'node:fs';
import { resolveR2Config, isR2Configured } from './r2Config.js';
import { R2Provider } from './r2Provider.js';
import { contentTypeForPath, createMediaHostingResult } from './mediaHostingContract.js';

const CONFIG_ERROR = 'MediaHostingService: faltan credenciales/configuración R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL) -- ninguna llamada de red fue intentada.';

export class MediaHostingService {
  /**
   * @param {{provider?: 'r2'|'mock', mockProvider?: object, r2Overrides?: object}} overrides
   * provider "mock" NUNCA es el default -- solo se activa si el llamador
   * (siempre un test o una herramienta de desarrollo, nunca el server real
   * del dashboard) pasa explícitamente `provider: 'mock'` + `mockProvider`.
   */
  constructor(overrides = {}) {
    this._providerMode = overrides.provider ?? 'r2';
    if (this._providerMode === 'mock') {
      if (!overrides.mockProvider) {
        throw new Error('MediaHostingService: providerMode "mock" requiere "overrides.mockProvider" real (MockMediaHostingProvider) -- nunca se crea uno implícito.');
      }
      this._provider = overrides.mockProvider;
      this._configured = true;
    } else {
      const config = resolveR2Config(overrides.r2Overrides ?? {});
      this._configured = isR2Configured(config);
      this._provider = this._configured ? new R2Provider(config) : null;
    }
  }

  isConfigured() {
    return this._configured;
  }

  /** `operationId` opcional: ver nota de cabecera "URL ÚNICA POR OPERACIÓN DE PUBLICACIÓN". */
  _keyFor(assetId, operationId = null) {
    return operationId ? `publish/${operationId}/${assetId}` : `final/${assetId}`;
  }

  /**
   * @param {{assetId:string, localPath:string, assetKind:string, approved:boolean, operationId?:string|null}} asset
   */
  async upload(asset) {
    const { assetId, localPath, assetKind, approved, operationId = null } = asset ?? {};
    if (!assetId || !localPath) {
      return createMediaHostingResult({ status: 'REJECTED', assetId: assetId ?? 'n/a', providerMode: this._providerMode, error: 'MediaHostingService.upload: "assetId" y "localPath" son obligatorios.' });
    }
    if (assetKind !== 'FINAL') {
      return createMediaHostingResult({ status: 'REJECTED', assetId, providerMode: this._providerMode, error: `MediaHostingService.upload: solo se aloja assetKind "FINAL" (recibido "${assetKind}") -- RAW/GENERATED/EDITED nunca se suben.` });
    }
    if (approved !== true) {
      return createMediaHostingResult({ status: 'REJECTED', assetId, providerMode: this._providerMode, error: 'MediaHostingService.upload: el asset debe llegar con approved=true -- nunca se aloja contenido sin aprobación explícita.' });
    }
    if (!existsSync(localPath) || !statSync(localPath).isFile()) {
      return createMediaHostingResult({ status: 'REJECTED', assetId, providerMode: this._providerMode, error: `MediaHostingService.upload: "${localPath}" no es un archivo real existente.` });
    }
    const contentType = contentTypeForPath(localPath);
    if (!contentType) {
      return createMediaHostingResult({ status: 'REJECTED', assetId, providerMode: this._providerMode, error: 'MediaHostingService.upload: solo se soportan JPEG/PNG/MP4.' });
    }
    if (!this._configured) {
      return createMediaHostingResult({ status: 'CONFIGURATION_REQUIRED', assetId, providerMode: this._providerMode, error: CONFIG_ERROR });
    }

    const key = this._keyFor(assetId, operationId);
    const result = await this._provider.upload(key, localPath, contentType);
    if (!result.ok) {
      return createMediaHostingResult({ status: 'FAILED', assetId, providerMode: this._providerMode, error: result.error });
    }
    return createMediaHostingResult({ status: 'UPLOADED', assetId, publicUrl: this._provider.getPublicUrl(key), providerMode: this._providerMode });
  }

  /** Solo construye la URL (determinística por assetId, o por assetId+operationId si se pasa) -- no confirma que el objeto exista realmente; para eso usar exists(). */
  getPublicUrl(assetId, operationId = null) {
    if (!this._configured) return null;
    return this._provider.getPublicUrl(this._keyFor(assetId, operationId));
  }

  async exists(assetId, operationId = null) {
    if (!this._configured) {
      return createMediaHostingResult({ status: 'CONFIGURATION_REQUIRED', assetId, providerMode: this._providerMode, error: CONFIG_ERROR });
    }
    const key = this._keyFor(assetId, operationId);
    const ok = await this._provider.exists(key);
    return createMediaHostingResult({ status: ok ? 'UPLOADED' : 'NOT_FOUND', assetId, publicUrl: ok ? this._provider.getPublicUrl(key) : null, providerMode: this._providerMode });
  }

  async delete(assetId, operationId = null) {
    if (!this._configured) {
      return createMediaHostingResult({ status: 'CONFIGURATION_REQUIRED', assetId, providerMode: this._providerMode, error: CONFIG_ERROR });
    }
    const key = this._keyFor(assetId, operationId);
    const ok = await this._provider.delete(key);
    return createMediaHostingResult({
      status: ok ? 'DELETED' : 'FAILED', assetId, providerMode: this._providerMode,
      error: ok ? null : 'MediaHostingService.delete: el provider no confirmó el borrado.',
    });
  }
}
