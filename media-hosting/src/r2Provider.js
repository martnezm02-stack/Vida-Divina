// r2Provider.js — cliente real de Cloudflare R2 (S3-compatible) vía
// node:https + r2SigV4.js. Nunca mueve el archivo local: siempre PUT del
// contenido leído por streaming (createReadStream), el original en disco
// nunca se toca ni se borra. Sin dependencias nuevas (sin aws-sdk, sin
// axios) -- mismo criterio zero-dependency del resto del proyecto.

import https from 'node:https';
import { createReadStream, statSync } from 'node:fs';
import { signS3Request } from './r2SigV4.js';

export class R2Provider {
  constructor({ accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl }) {
    this._accountId = accountId;
    this._accessKeyId = accessKeyId;
    this._secretAccessKey = secretAccessKey;
    this._bucket = bucket;
    this._publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
    this._host = `${accountId}.r2.cloudflarestorage.com`;
  }

  _objectPath(key) {
    return `/${this._bucket}/${key}`;
  }

  /** URL pública real (dominio r2.dev habilitado o dominio propio conectado) -- nunca el host privado de la API S3. */
  getPublicUrl(key) {
    return `${this._publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  _request(method, key, { localPath, contentType } = {}) {
    const objectPath = this._objectPath(key);
    const extraHeaders = {};
    if (contentType) extraHeaders['content-type'] = contentType;
    if (method === 'PUT') extraHeaders['content-length'] = String(statSync(localPath).size);

    const signed = signS3Request({
      method, host: this._host, path: objectPath,
      accessKeyId: this._accessKeyId, secretAccessKey: this._secretAccessKey,
      extraHeaders,
    });

    return new Promise((resolve, reject) => {
      const req = https.request(
        { method, host: this._host, path: encodeURI(objectPath), headers: { host: this._host, ...extraHeaders, ...signed } },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        }
      );
      req.on('error', reject);
      if (method === 'PUT') {
        const stream = createReadStream(localPath);
        stream.on('error', reject);
        stream.pipe(req);
      } else {
        req.end();
      }
    });
  }

  async upload(key, localPath, contentType) {
    const resp = await this._request('PUT', key, { localPath, contentType });
    if (resp.statusCode >= 200 && resp.statusCode < 300) return { ok: true };
    return { ok: false, error: `R2Provider.upload: HTTP ${resp.statusCode} — ${resp.body.slice(0, 500)}` };
  }

  async exists(key) {
    const resp = await this._request('HEAD', key);
    return resp.statusCode === 200;
  }

  /** true tanto si se borró como si ya no existía (204/200/404) -- delete() es idempotente por diseño. */
  async delete(key) {
    const resp = await this._request('DELETE', key);
    return resp.statusCode === 204 || resp.statusCode === 200 || resp.statusCode === 404;
  }
}
