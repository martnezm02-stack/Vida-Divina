// jevPrecompactHook.ts — Lógica pura del hook PreCompact de Claude Code
// respaldado por JEV. Sin I/O de proceso (sin stdin/stdout/exit) para que
// sea testeable directamente -- el entrypoint ejecutable real es
// scripts/jevPrecompactHook.ts, que solo hace de glue de stdin/stdout
// alrededor de buildCustomInstructions().
//
// Contrato del hook PreCompact (evidencia: strings extraídos del binario
// de Claude Code, sin acceso a su fuente real -- ver inspección previa):
// recibe JSON por stdin con {hook_event_name, trigger, custom_instructions,
// session_id?, transcript_path?, cwd?}; exit 0 + stdout -> el stdout se
// añade como custom_instructions del compactado. Este hook nunca usa exit
// 2 (bloqueo) en esta fase.
//
// Reutiliza directamente createJevDecisionProvider (MI-4,
// src/lib/intelligence/decision) -- no se reimplementa ningún cliente JEV
// aquí. No reutiliza el ContextOptimizer de MI-5 (synthesis/): su tipo
// (ContextCandidates: items/patterns/actors del Intelligence Store) no
// aplica a fragmentos de transcript de una sesión de Claude Code -- este
// archivo aplica el mismo patrón (score por candidato -> rank -> fallback
// determinista) sobre el dominio correcto, sin volver a implementar JEV.
import { readFileSync } from "node:fs";
import type { DecisionProvider } from "../intelligence/decision";

export interface PreCompactPayload {
  hook_event_name?: string;
  trigger?: string;
  custom_instructions?: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
}

// Refleja lo pedido explícitamente para esta integración: qué debe
// sobrevivir a la compactación, con o sin JEV disponible.
export const BASELINE_INSTRUCTIONS =
  "Preserva textualmente cualquier instrucción de seguridad, restricción o decisión explícita del usuario. " +
  "Preserva el objetivo/tarea actual y su estado de avance (qué falta, qué se decidió, por qué). " +
  "Preserva decisiones arquitectónicas y las rutas de archivos/módulos relevantes mencionados. " +
  "Prioriza contexto útil para continuar el trabajo sobre outputs redundantes, logs repetidos o resultados históricos ya superados.";

const MAX_CANDIDATES = 20;
const MAX_HIGHLIGHTS = 5;
const EXCERPT_LENGTH = 160;

export function parsePayload(raw: string): PreCompactPayload {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as PreCompactPayload;
  } catch {
    return {};
  }
}

/** Extrae texto de una entrada de transcript sin asumir un único shape -- distintos tipos de entrada (user/assistant/tool/system) varían. */
export function extractText(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") return null;
  const message = (entry as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((block) =>
        block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string"
          ? (block as { text: string }).text
          : ""
      )
      .filter(Boolean)
      .join(" ");
    return text || null;
  }
  return null;
}

/** Últimos fragmentos de texto del transcript -- tolerante: un transcript ausente/malformado nunca hace fallar el hook, solo deja la lista vacía. */
export function readRecentCandidates(transcriptPath: string | undefined): string[] {
  if (!transcriptPath) return [];
  let raw: string;
  try {
    raw = readFileSync(transcriptPath, "utf-8");
  } catch {
    return [];
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const candidates: string[] = [];
  for (const line of lines.slice(-MAX_CANDIDATES * 2)) {
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const text = extractText(entry);
    if (text && text.trim()) candidates.push(text.trim());
  }
  return candidates.slice(-MAX_CANDIDATES);
}

export function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/** Usa JEV (score por candidato) para priorizar qué fragmentos recientes destacar. null si no hay candidatos. */
export async function rankWithJev(
  provider: DecisionProvider,
  candidates: string[],
  payload: PreCompactPayload
): Promise<string | null> {
  if (candidates.length === 0) return null;

  const scored: Array<{ text: string; relevance: number }> = [];
  for (const [index, text] of candidates.entries()) {
    const result = await provider.score({
      subject: text,
      criteria: { task: "precompact-relevance", trigger: payload.trigger ?? null },
      context: { position_from_end: candidates.length - index },
    });
    scored.push({ text, relevance: result.score });
  }

  const top = [...scored].sort((a, b) => b.relevance - a.relevance).slice(0, MAX_HIGHLIGHTS);
  const highlights = top.map((entry) => `- ${truncate(entry.text, EXCERPT_LENGTH)}`).join("\n");
  return `JEV priorizó estos fragmentos recientes como más relevantes para preservar:\n${highlights}`;
}

/**
 * Construye las custom_instructions finales para el hook PreCompact.
 * `decisionProvider` se inyecta (en vez de construirse aquí) para que sea
 * testeable sin depender del adaptador JEV real -- scripts/jevPrecompactHook.ts
 * es quien pasa createJevDecisionProvider() en producción.
 */
export async function buildCustomInstructions(
  payload: PreCompactPayload,
  decisionProvider: DecisionProvider
): Promise<string> {
  const candidates = readRecentCandidates(payload.transcript_path);

  try {
    const jevHighlights = await rankWithJev(decisionProvider, candidates, payload);
    return jevHighlights ? `${BASELINE_INSTRUCTIONS}\n\n${jevHighlights}` : BASELINE_INSTRUCTIONS;
  } catch {
    // JEV no configurado (sin credenciales) o falló -- nunca bloquea el
    // hook, nunca pide credenciales aquí: se degrada al baseline determinista.
    return BASELINE_INSTRUCTIONS;
  }
}
