// passwordHash.js — hash de contraseñas real, node:crypto puro (mismo
// criterio zero-dependency del resto de dashboard/, ver package.json). No
// es una implementación criptográfica propia: scrypt es la KDF que el
// propio Node recomienda para contraseñas (docs oficiales de node:crypto),
// nunca un algoritmo inventado aquí. Comparación en tiempo constante
// (timingSafeEqual) para que el tiempo de respuesta nunca filtre si el hash
// coincide byte a byte.

import crypto from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** Genera { salt, hash } (ambos hex) para una contraseña en texto plano -- nunca se guarda la contraseña real. */
export function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('passwordHash.hashPassword: se requiere una contraseña real.');
  }
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto.scryptSync(plainPassword, salt, KEY_LENGTH).toString('hex');
  return { salt, hash };
}

/** true si `plainPassword` corresponde al { salt, hash } ya guardados -- comparación en tiempo constante real. */
export function verifyPassword(plainPassword, salt, hash) {
  if (!plainPassword || !salt || !hash) return false;
  const hashReal = Buffer.from(hash, 'hex');
  const hashIntento = crypto.scryptSync(plainPassword, salt, KEY_LENGTH);
  if (hashReal.length !== hashIntento.length) return false;
  return crypto.timingSafeEqual(hashReal, hashIntento);
}
