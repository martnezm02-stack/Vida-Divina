// authStore.js — persistencia real de usuarios del Dashboard (FASE
// "Autenticación nativa del Dashboard", 2026-09-19). Mismo patrón exacto ya
// usado por assetOverrideStore.js/productionWorkspace.json: JSON plano en
// server/data/, con override de test vía env var para que un test NUNCA
// toque los usuarios reales de Manuel.
//
// Arquitectura preparada para roles (ADMIN/OPERADOR) sin implementarlos
// todavía -- el campo `role` ya existe en cada usuario y se guarda desde el
// primer momento, pero hoy solo se crea (bootstrap) y se autentica un único
// rol real: ADMIN.
//
// Nunca guarda la contraseña en texto plano -- solo { salt, passwordHash }
// (ver passwordHash.js). El bootstrap inicial lee DASHBOARD_ADMIN_EMAIL/
// DASHBOARD_ADMIN_PASSWORD de process.env UNA SOLA VEZ (si no existe ya
// ningún usuario real) -- después de crear el usuario, esas variables ya no
// se vuelven a leer para autenticar (el login siempre compara contra el
// hash guardado, nunca contra el env var).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './passwordHash.js';

const DATA_DIR = process.env.AUTH_DATA_ROOT
  ? path.resolve(process.env.AUTH_DATA_ROOT)
  : fileURLToPath(new URL('../data', import.meta.url));
const USERS_PATH = path.join(DATA_DIR, 'users.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(USERS_PATH)) return { users: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
    return Array.isArray(parsed?.users) ? parsed : { users: [] };
  } catch {
    return { users: [] };
  }
}

function writeAll(data) {
  ensureDir();
  fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function normalizarEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function getUserByEmail(email) {
  const data = readAll();
  const normalizado = normalizarEmail(email);
  return data.users.find((u) => normalizarEmail(u.email) === normalizado) ?? null;
}

export function countUsers() {
  return readAll().users.length;
}

/**
 * Bootstrap real del primer usuario ADMIN -- SOLO si todavía no existe
 * ningún usuario real. Lee DASHBOARD_ADMIN_EMAIL/DASHBOARD_ADMIN_PASSWORD
 * de process.env (nunca hardcodeados aquí). Si ya hay usuarios, no hace
 * nada (nunca resetea la contraseña real de un usuario existente solo
 * porque el env var sigue puesto). Devuelve el usuario creado, o null si no
 * hizo falta/no se pudo (env vars ausentes -- se reporta, nunca se inventa
 * una credencial).
 */
export function ensureBootstrapAdmin() {
  if (countUsers() > 0) return null;

  const email = process.env.DASHBOARD_ADMIN_EMAIL;
  const password = process.env.DASHBOARD_ADMIN_PASSWORD;
  if (!email?.trim() || !password) {
    return null;
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email: normalizarEmail(email),
    salt,
    passwordHash: hash,
    role: 'ADMIN',
    createdAt: new Date().toISOString(),
  };
  const data = readAll();
  data.users.push(user);
  writeAll(data);
  return { id: user.id, email: user.email, role: user.role };
}
