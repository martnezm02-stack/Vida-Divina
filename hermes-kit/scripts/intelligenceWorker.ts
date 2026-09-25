// scripts/intelligenceWorker.ts — entrypoint de proceso para el
// Continuous Intelligence Worker (createIntelligenceWorker(),
// src/lib/intelligence/watchlist/worker.ts, sin tocar).
//
// Responde EXCLUSIVAMENTE "¿quién arranca el Worker y cómo se conectan
// sus dependencias?" -- no reimplementa Scheduler/Watchlist Runner/
// Change Detection/Relevance/Signals/Insights/Brief, todos ya existentes
// y sin tocar. Este archivo es el ÚNICO lugar del repo con permiso para
// importar TODO junto (bridge de TikTok + JEV + relevance + signalInsights)
// -- el propio Worker (worker.ts) sigue sin importar ninguno de ellos.
//
// No arranca nada al importarse: main() solo corre si este archivo se
// ejecuta directamente (`tsx scripts/intelligenceWorker.ts` / `npm run
// intelligence:worker`), nunca por un simple `import`. Los tests importan
// las piezas puras/testeables (createTikTokAcquireDispatcher,
// createRelevanceInsightsHandler, buildWorkerConfigFromEnv) sin disparar main().
import "./env-loader"; // PRIMER import -- ver el mismo patrón ya establecido en start-bot.ts

import { pathToFileURL } from "node:url";
import pino from "pino";
import {
  createIntelligenceWorker,
  fetchTikTokViaMonidBridge,
  createJevDecisionProvider,
  processWatchlistSignals,
} from "../src/lib/intelligence";
import type {
  IntelligenceWorker,
  WatchlistAcquireFn,
  WatchlistEntry,
  Watchlist,
  WatchlistRunResult,
  DecisionProvider,
  WorkerTickResult,
} from "../src/lib/intelligence";

const logger = pino({ level: (process.env.LOG_LEVEL as pino.Level | undefined) ?? "info" });

// ---------------------------------------------------------------------------
// SOURCE DISPATCH -- mínimo, sin normalización (eso lo sigue haciendo el
// SourceAdapter de cada bridge). Convención: una watchlist_entry con
// kind que empieza por "tiktok" (p.ej. "tiktok:keyword") se enruta al
// bridge TikTok/Monid REAL ya existente (bc054eb) -- ninguna otra fuente
// tiene un conector real disponible en este runtime todavía (Instagram/
// Meta Ads no tienen bridge propio, solo adapters de normalización), así
// que cualquier otra watchlist devuelve UNAVAILABLE honesto, nunca se
// inventa un conector.
// ---------------------------------------------------------------------------
export interface TikTokDispatchConfig {
  maxItems?: number;
  dateRange?: string;
  sort?: string;
}

function findTikTokEntry(entries: WatchlistEntry[]): WatchlistEntry | undefined {
  return entries.find((e) => (e.kind ?? "").toLowerCase().startsWith("tiktok"));
}

/**
 * watchlist/source -> implementación de adquisición YA existente ->
 * rawItems (AvailableSource/UnavailableSource, sin normalizar). Única
 * fuente real disponible: TikTok/Monid. Cualquier otra devuelve
 * UNAVAILABLE explícito, nunca fabrica una ejecución exitosa.
 */
export function createTikTokAcquireDispatcher(config: TikTokDispatchConfig = {}): WatchlistAcquireFn {
  return async (watchlist: Watchlist, entries: WatchlistEntry[]) => {
    const tiktokEntry = findTikTokEntry(entries);
    if (!tiktokEntry) {
      return {
        name: watchlist.watchlist_type || "unknown",
        unavailable: true as const,
        reason: `sin fuente soportada para esta watchlist en este runtime (kinds de entries: ${
          entries.map((e) => e.kind ?? "(sin kind)").join(", ") || "ninguna entry"
        })`,
      };
    }
    return fetchTikTokViaMonidBridge({
      keywords: [tiktokEntry.value],
      maxItems: config.maxItems,
      dateRange: config.dateRange,
      sort: config.sort,
    });
  };
}

// ---------------------------------------------------------------------------
// onWatchlistRan -- conecta el resultado real del Watchlist Runner con el
// pipeline YA existente (relevance -> signals -> insights -> brief
// opcional, processWatchlistSignals, sin tocar). Ninguna lógica nueva de
// relevance/signal/insight se agrega aquí -- solo se invoca lo existente
// con la configuración de este proceso (decisionProvider real/fallback).
// ---------------------------------------------------------------------------
export interface RelevanceInsightsHandlerOptions {
  decisionProvider: DecisionProvider | null;
  buildBrief: boolean;
}

export function createRelevanceInsightsHandler(
  options: RelevanceInsightsHandlerOptions
): (runResult: WatchlistRunResult, watchlistId: number) => Promise<void> {
  return async (runResult: WatchlistRunResult, watchlistId: number) => {
    const processed = await processWatchlistSignals(runResult, {
      decisionProvider: options.decisionProvider,
      buildBrief: options.buildBrief,
    });

    logger.info(
      {
        watchlistId,
        discovered: runResult.discovered,
        relevanceEvaluated: processed.relevance.length,
        signals: processed.relevance.filter((r) => r.signal !== null).length,
        insights: processed.insights.status,
      },
      "[intelligence-worker] WATCHLIST RESULT"
    );

    if (processed.insights.status === "ok") {
      for (const insight of processed.insights.insights) {
        logger.info(
          { insightId: insight.id, version: insight.version, summary: insight.summary },
          "[intelligence-worker] INSIGHT RESULT"
        );
      }
    } else {
      logger.info({ reason: processed.insights.reason }, "[intelligence-worker] INSIGHT RESULT insufficient_evidence");
    }

    if (processed.brief?.status === "ok") {
      logger.info(
        { keyFindings: processed.brief.brief.key_findings.length, totalItems: processed.brief.brief.observed_evidence.total_items_examined },
        "[intelligence-worker] BRIEF RESULT"
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Configuración -- solo variables de entorno ya cargadas por env-loader.ts
// (mismo mecanismo que start-bot.ts, ningún sistema de config nuevo).
// Ningún secreto vive en este archivo: TYPESAFE_API_KEY/HERMES_DESKTOP_ROOT
// ya viven en .env.local (gitignored), leídos por createJevDecisionProvider()
// y fetchTikTokViaMonidBridge() respectivamente -- este archivo nunca los toca directamente.
// ---------------------------------------------------------------------------
export interface WorkerConfigFromEnv {
  tickIntervalMs: number;
  projectId?: number;
  maxItems: number;
  buildBrief: boolean;
  jevConfigured: boolean;
}

/** Default 5 minutos: ningún negocio hardcodeado -- suficientemente frecuente para no retrasar watchlists "hourly" sin sondear en exceso. Configurable vía INTELLIGENCE_WORKER_TICK_MS. */
const DEFAULT_TICK_INTERVAL_MS = 5 * 60_000;
const DEFAULT_MAX_ITEMS = 25;

export function buildWorkerConfigFromEnv(): WorkerConfigFromEnv {
  const tickIntervalMs = Number(process.env.INTELLIGENCE_WORKER_TICK_MS ?? DEFAULT_TICK_INTERVAL_MS);
  const projectIdRaw = process.env.INTELLIGENCE_WORKER_PROJECT_ID;
  const maxItems = Number(process.env.INTELLIGENCE_WORKER_MAX_ITEMS ?? DEFAULT_MAX_ITEMS);
  const buildBrief = process.env.INTELLIGENCE_WORKER_BUILD_BRIEF !== "0";

  return {
    tickIntervalMs: Number.isFinite(tickIntervalMs) && tickIntervalMs > 0 ? tickIntervalMs : DEFAULT_TICK_INTERVAL_MS,
    projectId: projectIdRaw ? Number(projectIdRaw) : undefined,
    maxItems: Number.isFinite(maxItems) && maxItems > 0 ? maxItems : DEFAULT_MAX_ITEMS,
    buildBrief,
    jevConfigured: Boolean(process.env.TYPESAFE_API_KEY),
  };
}

export function buildIntelligenceWorker(config: WorkerConfigFromEnv): IntelligenceWorker {
  const decisionProvider = config.jevConfigured ? createJevDecisionProvider() : null;

  return createIntelligenceWorker({
    acquire: createTikTokAcquireDispatcher({ maxItems: config.maxItems }),
    tickIntervalMs: config.tickIntervalMs,
    projectId: config.projectId,
    onWatchlistRan: createRelevanceInsightsHandler({ decisionProvider, buildBrief: config.buildBrief }),
    onTick: (result: WorkerTickResult) => {
      logger.info(
        { watchlistsDue: result.watchlistsDue, ran: result.ran, unavailable: result.unavailable, failed: result.failed },
        "[intelligence-worker] TICK"
      );
    },
    onError: (err, ctx) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), watchlistId: ctx.watchlistId, phase: ctx.phase },
        "[intelligence-worker] ERROR"
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Lifecycle: START -> crear dependencias -> crear Worker -> start().
// SHUTDOWN: SIGINT/SIGTERM -> worker.stop() -> salir limpiamente. Nunca
// toca el lifecycle de Monid/MCP -- solo deja de llamar a `acquire`.
//
// registerShutdownHandlers() queda separada de main() (que sí llama a
// process.exit(), inejecutable en un test) para poder probar el cableado
// SIGINT/SIGTERM -> worker.stop() de forma real sin matar el proceso de
// test -- se le inyecta `exit` (por defecto process.exit, reemplazable en
// tests) y devuelve una función de limpieza que remueve los listeners.
// ---------------------------------------------------------------------------
export function registerShutdownHandlers(
  worker: IntelligenceWorker,
  exit: (code: number) => void = (code) => process.exit(code)
): () => void {
  const shutdown = (signal: string) => {
    logger.info({ signal }, "[intelligence-worker] SHUTDOWN recibido, deteniendo...");
    worker.stop();
    logger.info("[intelligence-worker] worker detenido limpiamente");
    exit(0);
  };
  const onSigint = () => shutdown("SIGINT");
  const onSigterm = () => shutdown("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  return () => {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  };
}

async function main(): Promise<void> {
  logger.info("[intelligence-worker] arrancando...");

  const config = buildWorkerConfigFromEnv();
  logger.info(
    { tickIntervalMs: config.tickIntervalMs, projectId: config.projectId ?? "(todos)", maxItems: config.maxItems, jevConfigured: config.jevConfigured },
    "[intelligence-worker] configuración resuelta"
  );

  let worker: IntelligenceWorker;
  try {
    worker = buildIntelligenceWorker(config);
  } catch (err) {
    logger.error({ err }, "[intelligence-worker] fallo al construir dependencias críticas -- no se arranca un worker a medias");
    process.exit(1);
    return;
  }

  worker.start();
  logger.info("[intelligence-worker] START -- worker corriendo");
  registerShutdownHandlers(worker);
}

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[intelligence-worker] promesa rechazada sin capturar (el proceso sigue vivo)");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[intelligence-worker] excepción no capturada (el proceso sigue vivo)");
});

// Solo arranca si este archivo se ejecuta directamente -- importarlo (p.ej.
// desde un test) NUNCA dispara main() ni crea timers.
const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    logger.error({ err }, "[intelligence-worker] error fatal no capturado");
    process.exit(1);
  });
}
