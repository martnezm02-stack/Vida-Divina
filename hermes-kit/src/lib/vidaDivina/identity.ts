// identity.ts — Identidad administrativa real de Hermes (FASE "Identidad
// administrativa y permisos de Hermes", 2026-09-04).
//
// REGLA DE SEGURIDAD NO NEGOCIABLE: la autorización de ADMIN depende
// EXCLUSIVAMENTE del teléfono real del remitente (el mismo que ya resuelve
// baileys/handler.ts#canonicalPhone -- nunca de lo que el usuario ESCRIBA
// en el chat. "Soy Manuel"/"soy el administrador" NUNCA otorga permisos:
// esta capa ni siquiera lee el texto del mensaje, solo el teléfono real.
//
// HERMES_ADMIN_PHONE vive SOLO en hermes-kit/.env.local (nunca en
// prompts/negocio.md, nunca en el system prompt, nunca hardcodeado aquí) --
// ya cargado por scripts/env-loader.ts (bloque .env.local, sin cambios
// necesarios: ese bloque ya vuelca TODO .env.local a process.env).

export type HermesRole = "ADMIN" | "CLIENT";

export interface HermesIdentity {
  role: HermesRole;
  name: string | null;
  phone: string;
}

/**
 * Normaliza un teléfono a su representación canónica: solo dígitos, sin
 * "+", espacios, guiones ni paréntesis. "+52 222 524 0044", "522225240044"
 * y "+522225240044" normalizan al mismo valor real.
 */
export function normalizePhone(raw: string): string {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

function adminPhoneCanonico(): string | null {
  const raw = process.env.HERMES_ADMIN_PHONE;
  if (!raw?.trim()) return null;
  return normalizePhone(raw);
}

/** true solo si el teléfono REAL (ya normalizado) coincide con HERMES_ADMIN_PHONE. Nunca considera el texto del mensaje. */
export function isAdminPhone(phone: string): boolean {
  const admin = adminPhoneCanonico();
  if (!admin) return false; // sin HERMES_ADMIN_PHONE configurado -- nadie es admin, nunca se asume.
  return normalizePhone(phone) === admin;
}

/**
 * Resuelve la identidad real a partir del teléfono del remitente -- la
 * única fuente de verdad para permisos. `name` solo se rellena para el
 * ADMIN real (HERMES_ADMIN_NAME); para CLIENT nunca se asume un nombre
 * (aunque el propio cliente diga cómo se llama en el chat -- eso es dato
 * conversacional normal, gestionado por guardarLead, nunca identidad/permiso).
 */
export function resolveIdentity(phone: string): HermesIdentity {
  if (isAdminPhone(phone)) {
    return { role: "ADMIN", name: process.env.HERMES_ADMIN_NAME?.trim() || "Administrador", phone };
  }
  return { role: "CLIENT", name: null, phone };
}
