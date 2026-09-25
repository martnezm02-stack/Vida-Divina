// multiSource.ts — Composición explícita de varias fuentes (Instagram,
// TikTok, Meta Ads Library, ...) sobre runResearchQuery() (MI-1..MI-5).
//
// No es un segundo motor de investigación: runResearchQuery() ya era
// agnóstico a fuente (ResearchIngestInput acepta {adapter, raw} de
// CUALQUIER SourceAdapter en una sola lista plana). Lo que faltaba era una
// forma explícita y extensible de declarar QUÉ fuentes participan en una
// investigación concreta sin perder trazabilidad de cuáles sí aportaron
// datos, cuáles no pudieron (y por qué) y cuántos items crudos aportó cada
// una -- nunca se inventa evidencia para una fuente que no pudo ejecutarse.
//
// Añadir una fuente nueva es agregar una entrada a `sources` con su propio
// SourceAdapter ya existente (o uno nuevo, MI-2) -- este archivo no cambia.
import type { SourceAdapter } from "../ingestion";
import type { ResearchIngestInput, ResearchOutcome, ResearchQueryRequest } from "./types";
import { runResearchQuery } from "./researchService";

/** Una fuente que SÍ pudo ejecutarse: aporta 0 o más items crudos a ingerir. */
export interface AvailableSource<TRaw = unknown> {
  name: string;
  adapter: SourceAdapter<TRaw>;
  raw: TRaw[];
}

/** Una fuente que no pudo participar (credenciales/runtime/config ausentes). Nunca se fabrica evidencia en su lugar. */
export interface UnavailableSource {
  name: string;
  unavailable: true;
  reason: string;
}

export type MultiSourceEntry = AvailableSource | UnavailableSource;

export interface MultiSourceResearchRequest extends Omit<ResearchQueryRequest, "ingest"> {
  /** Selección explícita de fuentes para esta investigación. */
  sources: MultiSourceEntry[];
}

export interface SourceContribution {
  source: string;
  status: "ingested" | "unavailable";
  /** Items crudos que esta fuente aportó al intento de ingesta (antes de dedupe/upsert en MI-1/MI-2). */
  itemsProvided?: number;
  reason?: string;
}

export interface MultiSourceOutcome {
  outcome: ResearchOutcome;
  sources: SourceContribution[];
}

function isUnavailable(entry: MultiSourceEntry): entry is UnavailableSource {
  return (entry as UnavailableSource).unavailable === true;
}

/**
 * Aplana la selección de fuentes en el `ingest` plano que
 * runResearchQuery() ya sabe consumir, y produce un reporte de provenance
 * por fuente (participó / no disponible y por qué). No ejecuta I/O propio,
 * no reimplementa MI-1..MI-5: solo secuencia la composición antes de
 * delegar en runResearchQuery().
 */
export async function runMultiSourceResearchQuery(
  request: MultiSourceResearchRequest
): Promise<MultiSourceOutcome> {
  const { sources: sourceEntries, ...requestBase } = request;
  const sources: SourceContribution[] = [];
  const ingest: ResearchIngestInput[] = [];

  for (const entry of sourceEntries) {
    if (isUnavailable(entry)) {
      sources.push({ source: entry.name, status: "unavailable", reason: entry.reason });
      continue;
    }
    for (const raw of entry.raw) {
      ingest.push({ adapter: entry.adapter, raw });
    }
    sources.push({ source: entry.name, status: "ingested", itemsProvided: entry.raw.length });
  }

  const outcome = await runResearchQuery({ ...requestBase, ingest });
  return { outcome, sources };
}
