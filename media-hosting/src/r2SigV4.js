// r2SigV4.js — firma AWS Signature V4 para peticiones S3-compatibles
// contra Cloudflare R2, implementada solo con node:crypto (sin
// @aws-sdk/*, sin dependencias nuevas -- mismo criterio zero-dependency de
// todo el proyecto, ver whatsapp-adapter/src/httpServer.js). Cloudflare R2
// documenta compatibilidad con el algoritmo SigV4 estándar de S3 (region
// "auto", service "s3").
//
// Usa `x-amz-content-sha256: UNSIGNED-PAYLOAD` (patrón estándar S3 para
// peticiones con cuerpo, sin firma "chunked") -- evita tener que leer y
// hashear en memoria un MP4 completo antes de poder firmar la petición; el
// cuerpo real se transmite por streaming después de firmar los headers.

import { createHmac, createHash } from 'node:crypto';

function hmac(key, msg) {
  return createHmac('sha256', key).update(msg, 'utf8').digest();
}

function sha256Hex(msg) {
  return createHash('sha256').update(msg, 'utf8').digest('hex');
}

function amzTimestamp(now) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/** Codifica cada segmento de la ruta del objeto (RFC 3986), preservando "/" -- regla de "canonical URI" de SigV4. */
export function encodeS3Path(rawPath) {
  return rawPath.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

/**
 * Firma UNA petición real (PUT/HEAD/DELETE de un objeto) contra el host
 * S3-compatible de R2. Devuelve solo los headers que deben agregarse a la
 * petición real (authorization, x-amz-date, x-amz-content-sha256) -- quien
 * llama arma y envía la petición HTTP (ver r2Provider.js).
 */
export function signS3Request({ method, host, path, region = 'auto', service = 's3', accessKeyId, secretAccessKey, extraHeaders = {}, now = new Date() }) {
  if (!accessKeyId || !secretAccessKey) throw new Error('signS3Request: "accessKeyId" y "secretAccessKey" son obligatorios.');
  const { amzDate, dateStamp } = amzTimestamp(now);
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const headersToSign = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...extraHeaders };
  const sortedNames = Object.keys(headersToSign).map((h) => h.toLowerCase()).sort();
  const lookup = new Map(Object.keys(headersToSign).map((k) => [k.toLowerCase(), headersToSign[k]]));
  const canonicalHeaders = sortedNames.map((h) => `${h}:${String(lookup.get(h)).trim()}\n`).join('');
  const signedHeaders = sortedNames.join(';');

  const canonicalRequest = [method, encodeS3Path(path), '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, authorization };
}
