// mockMediaHostingProvider.js — provider de desarrollo/tests, NUNCA
// publicación real. Copia el archivo real a un directorio local (nunca
// mueve/borra el original) y sirve una URL bajo el dominio reservado
// `mock-media-host.invalid` (TLD ".invalid" reservado por RFC 2606 -- nunca
// resuelve en DNS real, así que no puede confundirse con un alojamiento
// público real). MediaHostingService SOLO usa este provider si se le
// inyecta explícitamente vía `overrides.mockProvider` -- nunca por
// defecto, nunca en el código de producción del dashboard/scheduler.

import { mkdirSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export class MockMediaHostingProvider {
  constructor(baseDir) {
    this._baseDir = baseDir;
    mkdirSync(this._baseDir, { recursive: true });
  }

  _localCopyPath(key) {
    return join(this._baseDir, key.replace(/\//g, '__'));
  }

  getPublicUrl(key) {
    return `https://mock-media-host.invalid/${key}`;
  }

  async upload(key, localPath) {
    copyFileSync(localPath, this._localCopyPath(key));
    return { ok: true };
  }

  async exists(key) {
    return existsSync(this._localCopyPath(key));
  }

  async delete(key) {
    const p = this._localCopyPath(key);
    if (existsSync(p)) unlinkSync(p);
    return true;
  }
}
