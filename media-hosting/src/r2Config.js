// r2Config.js — configuración de Cloudflare R2 SOLO por variable de
// entorno, mismo patrón que content-strategy/src/instagramConfig.js y
// content-orchestrator/src/publishing/facebookAdapter.js#resolveFacebookConfig:
// nunca hardcodeada, nunca inventada aquí.
//
// Variables de entorno reconocidas:
//   R2_ACCOUNT_ID        → id de cuenta Cloudflare (host: `${accountId}.r2.cloudflarestorage.com`).
//   R2_ACCESS_KEY_ID      → access key del token de API R2 (permisos Object Read & Write).
//   R2_SECRET_ACCESS_KEY  → secret key correspondiente. Nunca se loguea ni se imprime.
//   R2_BUCKET             → nombre del bucket real.
//   R2_PUBLIC_BASE_URL    → URL pública base del bucket (dominio r2.dev habilitado o dominio
//                           propio conectado) -- desde aquí se construyen las URLs https que
//                           Meta necesita para consumir el medio. Sin este valor no hay forma
//                           real de dar una URL pública, aunque el resto de credenciales exista.
//
// Ninguna de estas variables tiene un valor configurado en este repositorio
// -- su ausencia es el estado esperado hasta que exista configuración real
// (ver docs de esta fase). isR2Configured() es la única función que decide
// si hay suficiente configuración para intentar una llamada real.

export function resolveR2Config(overrides = {}) {
  return {
    accountId: overrides.accountId ?? process.env.R2_ACCOUNT_ID ?? null,
    accessKeyId: overrides.accessKeyId ?? process.env.R2_ACCESS_KEY_ID ?? null,
    secretAccessKey: overrides.secretAccessKey ?? process.env.R2_SECRET_ACCESS_KEY ?? null,
    bucket: overrides.bucket ?? process.env.R2_BUCKET ?? null,
    publicBaseUrl: overrides.publicBaseUrl ?? process.env.R2_PUBLIC_BASE_URL ?? null,
  };
}

export function isR2Configured(config) {
  return Boolean(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucket && config.publicBaseUrl);
}
