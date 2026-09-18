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

// Hallazgo real 2026-09-17 (fallo confirmado en producción): WhatsApp
// antepone un "1" extra tras el código de país "52" para el remitente REAL
// de números móviles mexicanos (comportamiento real y documentado de
// WhatsApp para México, no un caso especial de ningún número en
// particular -- ej. "522225240044" puede llegar como "5212225240044").
// Sin esto, `isAdminPhone` nunca coincidía consigo mismo cuando WhatsApp
// entregaba la variante con el "1", sin importar qué tan bien configurado
// estuviera HERMES_ADMIN_PHONE. Genera ambas formas reales (con y sin el
// "1") para comparar, cualquiera sea la forma en que llegue el teléfono real
// o esté guardado HERMES_ADMIN_PHONE -- nunca compara contra un número
// hardcodeado, solo aplica la misma regla real a cualquier número mexicano.
function variantesMexicanasReales(digitos: string): string[] {
  const variantes = [digitos];
  if (digitos.length === 13 && digitos.startsWith("521")) {
    variantes.push(`52${digitos.slice(3)}`); // quita el "1" móvil real
  } else if (digitos.length === 12 && digitos.startsWith("52")) {
    variantes.push(`521${digitos.slice(2)}`); // agrega el "1" móvil real
  }
  return variantes;
}

/** true solo si el teléfono REAL (ya normalizado, incluidas sus variantes reales con/sin el "1" móvil mexicano) coincide con HERMES_ADMIN_PHONE. Nunca considera el texto del mensaje. */
export function isAdminPhone(phone: string): boolean {
  const admin = adminPhoneCanonico();
  if (!admin) return false; // sin HERMES_ADMIN_PHONE configurado -- nadie es admin, nunca se asume.
  const candidatos = variantesMexicanasReales(normalizePhone(phone));
  return candidatos.includes(admin);
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
