// assetRegistry.js — registro mínimo de assets visuales REALES (fotografías
// de producto). No existía ningún mecanismo de asset registry en el
// proyecto antes de esta fase — esta es la estructura mínima necesaria, no
// un sistema genérico de gestión de medios.
//
// REGLA CENTRAL: nunca fabrica packaging, nunca reescribe el texto impreso
// en una fotografía, nunca convierte texto visible en la foto en un
// Product Fact automáticamente. Solo describe metadata real y verificable
// del archivo (dimensiones reales, tamaño real, hash real) — nunca
// interpreta el contenido de la imagen.

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';

export const ASSET_ROLES = Object.freeze(['PRODUCT_PRIMARY', 'PRODUCT_SECONDARY_REFERENCE']);
export const ASSET_STATUS = Object.freeze(['PRODUCT_REFERENCE_AVAILABLE', 'PRODUCT_REFERENCE_REQUIRED']);

/**
 * Lee width/height reales de un JPEG leyendo sus marcadores SOF (Start Of
 * Frame) — sin librerías de imagen, solo lectura de bytes. Soporta JPEG
 * baseline (SOF0) y progresivo (SOF2), que cubren prácticamente cualquier
 * foto real de cámara/teléfono.
 */
function leerDimensionesJpeg(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('leerDimensionesJpeg: el archivo no empieza con el marcador JPEG (0xFFD8) — no es un JPEG real.');
  }
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 — todos los marcadores
    // "Start Of Frame" reales que codifican width/height. Excluye DHT (0xC4),
    // JPG (0xC8), DAC (0xCC), que comparten el rango pero no son SOF.
    const esSOF = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (esSOF) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }
  throw new Error('leerDimensionesJpeg: no se encontró ningún marcador SOF real en el archivo.');
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Lee width/height reales de un PNG desde su chunk IHDR (siempre el
 * primer chunk de un PNG real, byte 8 en adelante) — sin librerías de
 * imagen, solo lectura de bytes, mismo criterio que leerDimensionesJpeg().
 * Necesario porque las fotografías RAW reales de varios productos (ej.
 * Divina Ripped Capsules) son PNG, no JPEG (auditoría "Video Workspace +
 * Voice Engine", 2026-08-23).
 */
function leerDimensionesPng(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('leerDimensionesPng: el archivo no empieza con la firma PNG real (0x89504E470D0A1A0A) — no es un PNG real.');
  }
  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType !== 'IHDR') {
    throw new Error('leerDimensionesPng: no se encontró el chunk IHDR real como primer chunk — PNG no estándar o corrupto.');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function leerDimensionesReales(sourcePath, buffer) {
  const ext = extname(sourcePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return leerDimensionesJpeg(buffer);
  if (ext === '.png') return leerDimensionesPng(buffer);
  throw new Error(`leerDimensionesReales: formato "${ext}" no soportado por este registro mínimo (JPEG/PNG hoy) — no se inventa un valor.`);
}

/**
 * Registra un asset visual real a partir de un archivo REAL en disco.
 * Nunca fabrica el archivo, nunca lo mueve — solo lo describe.
 *
 * @param {{ sourcePath: string, productId: string, role: string }} args
 * @returns {{assetId, productId, sourcePath, originalFilename, width, height, format, role, status}}
 */
export function registerImageAsset({ sourcePath, productId, role }) {
  if (!sourcePath?.trim()) throw new Error('registerImageAsset: "sourcePath" es obligatorio.');
  if (!productId?.trim()) throw new Error('registerImageAsset: "productId" es obligatorio.');
  if (!ASSET_ROLES.includes(role)) {
    throw new Error(`registerImageAsset: "role" inválido "${role}" (válidos: ${ASSET_ROLES.join(', ')}).`);
  }

  let stat;
  try {
    stat = statSync(sourcePath);
  } catch {
    return Object.freeze({
      assetId: null,
      productId,
      sourcePath,
      originalFilename: basename(sourcePath),
      width: null,
      height: null,
      format: null,
      role,
      status: 'PRODUCT_REFERENCE_REQUIRED',
    });
  }

  const buffer = readFileSync(sourcePath);
  const { width, height } = leerDimensionesReales(sourcePath, buffer);
  const assetId = createHash('sha256').update(buffer).digest('hex'); // content-addressed: el mismo archivo real siempre produce el mismo id.

  return Object.freeze({
    assetId,
    productId,
    sourcePath,
    originalFilename: basename(sourcePath),
    width,
    height,
    format: extname(sourcePath).replace('.', '').toLowerCase(),
    role,
    status: 'PRODUCT_REFERENCE_AVAILABLE',
    fileSizeBytes: stat.size,
  });
}
