// media.js — sirve archivos reales (fotografías RAW, MP4 finales) desde
// las raíces permitidas únicamente (safePaths.js). Soporta Range requests
// (necesario para que <video> pueda buscar/adelantar en el preview real).
// Nunca sirve nada fuera de ALLOWED_MEDIA_ROOTS -- ninguna ruta llega sin
// pasar por resolveSafeMediaPath().

import { createReadStream, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { ALLOWED_MEDIA_ROOTS, resolveSafeMediaPath } from '../lib/safePaths.js';
import { notFound } from '../lib/http.js';

const CONTENT_TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav' };

const ROOT_NAME_TO_INDEX = { 'assets-products': 0, 'video-production': 1 };

export async function handleMedia(req, res, urlPath) {
  // urlPath = "/media/<rootName>/<...resto codificado>"
  const partes = urlPath.replace(/^\/media\//, '').split('/');
  const rootName = partes.shift();
  const rootIndex = ROOT_NAME_TO_INDEX[rootName];
  if (rootIndex === undefined) { notFound(res); return; }

  const relativo = partes.map((p) => decodeURIComponent(p)).join('/');
  const candidato = join(ALLOWED_MEDIA_ROOTS[rootIndex], relativo);
  const real = resolveSafeMediaPath(candidato);
  if (!real) { notFound(res, 'Archivo no encontrado o fuera de las raíces permitidas.'); return; }

  const stat = statSync(real);
  if (!stat.isFile()) { notFound(res); return; }
  const contentType = CONTENT_TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream';

  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
    });
    createReadStream(real, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
  createReadStream(real).pipe(res);
}
