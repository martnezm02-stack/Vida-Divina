// normalize.ts — Funciones deterministas de normalización (MI-2).
//
// Ninguna de estas funciones infiere/inventa: si la entrada es ausente o
// inválida, el resultado es `null`, nunca un valor fabricado (ni "ahora"
// para timestamps, ni 0 para métricas).

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ttclid",
]);

/**
 * Normaliza una URL para uso como clave de idempotencia (canonical_url):
 * protocolo/host en minúsculas, sin barra final en el path, sin parámetros
 * de tracking, resto de query params ordenados para que la misma URL
 * siempre normalice igual sin importar el orden en que llegó.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed; // no es una URL parseable (p.ej. un id) -- se conserva tal cual, no se descarta
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();

  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname;

  return url.toString();
}

/**
 * Normaliza un timestamp a segundos unix (convención de MI-1). Acepta
 * segundos, milisegundos (heurística: > 10^12 se asume ms), ISO string o
 * Date. Devuelve null si no se puede interpretar -- nunca "ahora".
 */
export function normalizeTimestamp(
  raw: number | string | Date | null | undefined
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
  }

  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber) && raw.trim() !== "") {
    return asNumber > 1e12 ? Math.floor(asNumber / 1000) : Math.floor(asNumber);
  }

  const parsedMs = Date.parse(raw);
  if (Number.isNaN(parsedMs)) return null;
  return Math.floor(parsedMs / 1000);
}

const SOURCE_ALIASES: Record<string, string> = {
  tiktok: "tiktok",
  "tik tok": "tiktok",
  instagram: "instagram",
  ig: "instagram",
  "meta ads": "meta_ads",
  "meta ad library": "meta_ads",
  facebook: "meta_ads",
  "facebook ads": "meta_ads",
  youtube: "youtube",
  yt: "youtube",
  reddit: "reddit",
  x: "x",
  twitter: "x",
  "google ads": "google_ads",
  google: "google_ads",
};

/** Normaliza el identificador de una fuente/plataforma a su slug canónico. */
export function normalizeSourceSlug(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (SOURCE_ALIASES[key]) return SOURCE_ALIASES[key];
  return key.replace(/\s+/g, "_");
}

const CONTENT_TYPE_ALIASES: Record<string, string> = {
  ad: "ad",
  advertisement: "ad",
  anuncio: "ad",
  post: "post",
  publicacion: "post",
  publication: "post",
  video: "video",
  story: "story",
  reel: "video",
};

/** Normaliza el tipo de contenido (ad/post/video/creator_content/otro). */
export function normalizeContentType(raw: string): string {
  const key = raw.trim().toLowerCase();
  return CONTENT_TYPE_ALIASES[key] ?? key.replace(/\s+/g, "_");
}

const ASSET_KIND_ALIASES: Record<string, string> = {
  img: "image",
  image: "image",
  photo: "image",
  video: "video",
  thumb: "thumbnail",
  thumbnail: "thumbnail",
  audio: "audio",
  doc: "document",
  document: "document",
};

/** Normaliza el tipo de un asset a un vocabulario estable. */
export function normalizeAssetKind(raw: string): string {
  const key = raw.trim().toLowerCase();
  return ASSET_KIND_ALIASES[key] ?? key.replace(/\s+/g, "_");
}

/** Normaliza un handle de actor: sin "@" inicial, sin espacios, minúsculas (identificador de match, no de display). */
export function normalizeActorHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@/, "").toLowerCase();
}

/**
 * Coerciona un valor de métrica a número o null. Acepta números y strings
 * numéricos (p.ej. "1.2K" NO se interpreta -- eso requeriría inferencia,
 * fuera de alcance de MI-2: si no es un número limpio, se descarta a null
 * en vez de adivinar).
 */
export function normalizeMetricValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    return Number.isNaN(n) ? null : n;
  }
  return null;
}
