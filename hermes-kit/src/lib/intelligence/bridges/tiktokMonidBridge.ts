// tiktokMonidBridge.ts — Bridge: Hermes Desktop/Python (Monid MCP -> TikTok
// real) -> hermes-kit (Node/TS) -> TikTok SourceAdapter existente (MI-2).
//
// Arquitectura:
//   Hermes Desktop -> Monid MCP -> TikTok real -> [scripts/tiktok_bridge_search.py]
//     -> stdout JSON (TikTokBridgeItem[], contrato estable) -> este módulo
//     -> mapBridgeItemToRawAd() -> TikTokRawAd (tiktokAdapter.ts, sin tocar)
//     -> AvailableSource<TikTokRawAd> | UnavailableSource (multiSource.ts, sin tocar)
//
// Este archivo es SOLO transporte + reshaping determinista: ejecuta el
// script Python existente (que a su vez reutiliza tal cual
// tools.tiktok_search_tool.search_tiktok -- ni Monid ni ese módulo se
// tocan ni se reescriben) y traduce su salida al contrato ya existente de
// tiktokAdapter.ts. Ninguna interpretación/análisis ocurre aquí -- eso
// sigue viviendo exclusivamente en MI-3..MI-5. UNKNOWN permanece NULL: un
// item real sin url/advertiser/video utilizables se descarta, nunca se
// completa con datos inventados.
//
// Seguridad: este módulo nunca ve ni transporta credenciales/tokens OAuth
// de Monid -- esos permanecen enteramente dentro de Hermes Desktop
// (cargados por su propio `_load_mcp_config()` desde su config/.env local).
// Solo cruza la frontera stdout JSON con datos de contenido ya públicos.
import { spawn } from "node:child_process";
import path from "node:path";
import type { AvailableSource, UnavailableSource } from "../research/multiSource";
import { tiktokAdapter, type TikTokRawAd } from "../ingestion/adapters/tiktokAdapter";

/** Contrato estable emitido por scripts/tiktok_bridge_search.py (Hermes Desktop). Vendor-neutral: no expone nombres de campo de Apify/TikTok-scraper. */
export interface TikTokBridgeItem {
  source: "tiktok";
  external_id: string;
  canonical_url: string | null;
  actor: {
    external_id: string | null;
    handle: string | null;
    display_name: string | null;
    profile_url: string | null;
  };
  published_at: string | number | null;
  text: string | null;
  metrics: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    captured_at: string | number | null;
  } | null;
  media: {
    kind: "video";
    url: string | null;
    thumbnail_url: string | null;
    width: number | null;
    height: number | null;
    duration_seconds: number | null;
  } | null;
  source_metadata: {
    platform: "tiktok";
    provider: "monid";
    endpoint: string;
    hashtags: string[];
    language: string | null;
  };
  provenance: {
    acquired_via: "monid";
    keywords: string[];
    date_range: string;
    sort: string;
    location: string | null;
    fetched_at: string;
  };
}

export interface TikTokMonidBridgeOptions {
  keywords: string[];
  dateRange?: string;
  maxItems?: number;
  sort?: string;
  location?: string | null;
  /** Override para tests/runtimes alternativos. Por defecto: HERMES_DESKTOP_ROOT + HERMES_DESKTOP_PYTHON. */
  hermesDesktopRoot?: string;
  pythonExecutable?: string;
  timeoutMs?: number;
}

function resolvePythonExecutable(hermesDesktopRoot: string, override?: string): string {
  if (override) return override;
  if (process.env.HERMES_DESKTOP_PYTHON) return process.env.HERMES_DESKTOP_PYTHON;
  return process.platform === "win32"
    ? path.join(hermesDesktopRoot, "venv", "Scripts", "python.exe")
    : path.join(hermesDesktopRoot, "venv", "bin", "python");
}

function runPythonBridge(
  pythonExecutable: string,
  scriptPath: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath, ...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`tiktok_bridge_search.py excedió el timeout de ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * Traduce un TikTokBridgeItem real al contrato YA EXISTENTE de
 * tiktokAdapter.ts (TikTokRawAd) -- sin crear un adapter nuevo. Campos
 * obligatorios de TikTokRawAd (url/advertiser.id/advertiser.name/video.url)
 * que el bridge no pudo obtener producen `null`: nunca se fabrica un valor
 * para satisfacer el contrato.
 */
export function mapBridgeItemToRawAd(item: TikTokBridgeItem): TikTokRawAd | null {
  if (!item.canonical_url) return null;
  if (!item.actor.external_id || !item.actor.display_name) return null;
  if (!item.media?.url) return null;

  return {
    id: item.external_id,
    url: item.canonical_url,
    content_type: "post", // resultado orgánico real de búsqueda TikTok -- nunca "ad"
    advertiser: {
      id: item.actor.external_id,
      name: item.actor.display_name,
      ...(item.actor.handle ? { handle: item.actor.handle } : {}),
      ...(item.actor.profile_url ? { profile_url: item.actor.profile_url } : {}),
    },
    ...(item.text ? { caption: item.text } : {}),
    ...(item.published_at !== null ? { publish_time: item.published_at } : {}),
    video: {
      url: item.media.url,
      ...(item.media.thumbnail_url ? { thumbnail_url: item.media.thumbnail_url } : {}),
      ...(item.media.width !== null ? { width: item.media.width } : {}),
      ...(item.media.height !== null ? { height: item.media.height } : {}),
      ...(item.media.duration_seconds !== null ? { duration_seconds: item.media.duration_seconds } : {}),
    },
    ...(item.metrics
      ? {
          stats: {
            ...(item.metrics.views !== null ? { play_count: item.metrics.views } : {}),
            ...(item.metrics.likes !== null ? { digg_count: item.metrics.likes } : {}),
            ...(item.metrics.comments !== null ? { comment_count: item.metrics.comments } : {}),
            ...(item.metrics.shares !== null ? { share_count: item.metrics.shares } : {}),
            ...(item.metrics.saves !== null ? { bookmark_count: item.metrics.saves } : {}),
          },
        }
      : {}),
    ...(item.provenance.location ? { market: item.provenance.location } : {}),
    ...(item.source_metadata.language ? { language: item.source_metadata.language } : {}),
    ...(item.metrics?.captured_at ? { metrics_captured_at: item.metrics.captured_at } : {}),
  };
}

/**
 * Ejecuta una búsqueda TikTok REAL a través del bridge Hermes
 * Desktop/Monid y devuelve una entrada lista para
 * runMultiSourceResearchQuery()'s `sources`. Nunca lanza: cualquier fallo
 * de runtime/config produce un UnavailableSource con la razón real -- nunca
 * se fabrica evidencia en su lugar.
 */
export async function fetchTikTokViaMonidBridge(
  options: TikTokMonidBridgeOptions
): Promise<AvailableSource<TikTokRawAd> | UnavailableSource> {
  const name = "tiktok";
  const hermesDesktopRoot = options.hermesDesktopRoot ?? process.env.HERMES_DESKTOP_ROOT;
  if (!hermesDesktopRoot) {
    return { name, unavailable: true, reason: "sin conector Monid alcanzable desde este runtime (HERMES_DESKTOP_ROOT sin configurar)" };
  }
  if (!options.keywords || options.keywords.length === 0) {
    return { name, unavailable: true, reason: "sin keywords -- búsqueda TikTok no puede ejecutarse" };
  }

  const scriptPath = path.join(hermesDesktopRoot, "scripts", "tiktok_bridge_search.py");
  const pythonExecutable = resolvePythonExecutable(hermesDesktopRoot, options.pythonExecutable);
  const args = [
    "--keywords",
    options.keywords.join(","),
    "--date-range",
    options.dateRange ?? "THIS_MONTH",
    "--max-items",
    String(options.maxItems ?? 25),
    "--sort",
    options.sort ?? "MOST_LIKED",
    ...(options.location ? ["--location", options.location] : []),
  ];

  let result: { stdout: string; stderr: string; code: number | null };
  try {
    result = await runPythonBridge(pythonExecutable, scriptPath, args, options.timeoutMs ?? 300_000);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { name, unavailable: true, reason: `sin conector Monid alcanzable desde este runtime (${reason})` };
  }

  if (result.code !== 0) {
    return {
      name,
      unavailable: true,
      reason: `sin conector Monid alcanzable desde este runtime (tiktok_bridge_search.py salió con código ${result.code}: ${result.stderr.trim().slice(0, 300)})`,
    };
  }

  let parsed: TikTokBridgeItem[];
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    return {
      name,
      unavailable: true,
      reason: "sin conector Monid alcanzable desde este runtime (respuesta del bridge no es JSON válido)",
    };
  }
  if (!Array.isArray(parsed)) {
    return { name, unavailable: true, reason: "sin conector Monid alcanzable desde este runtime (contrato de bridge inesperado)" };
  }

  const raw = parsed
    .map(mapBridgeItemToRawAd)
    .filter((item): item is TikTokRawAd => item !== null);

  return { name, adapter: tiktokAdapter, raw };
}
