// sourceAdapter.ts — Interfaz pequeña y estable para adapters de fuente.
//
// Un adapter SOLO sabe convertir el payload crudo de UNA fuente en el
// modelo canónico -- nunca escribe SQL ni conoce el Intelligence Store.
// La persistencia la hace siempre ingestionService.ts.
import type { AdapterContext, CanonicalIntelligenceItem } from "./canonical";

export interface SourceAdapter<TRaw = unknown> {
  /** Slug de la fuente que este adapter produce (debe coincidir con canonical.source). */
  readonly source: string;
  /** RAW SOURCE DATA -> CANONICAL INTELLIGENCE ITEM. Determinista, sin I/O. */
  normalize(raw: TRaw, context: AdapterContext): CanonicalIntelligenceItem;
}
