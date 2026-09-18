// speechProvider.ts — ASR con orden de costo estricto: $0 local primero.
//
// 1) Subtítulos/captions embebidos en el propio archivo (gratis, ya
//    extraídos por videoInput.extractEmbeddedSubtitles).
// 2) Si hay GROQ_API_KEY u OPENAI_API_KEY YA configurada en el entorno,
//    llamada HTTP directa (fetch nativo de Node 24, sin instalar SDKs
//    nuevos) a su endpoint de transcripción compatible con Whisper.
// 3) Si no hay nada disponible: NOT_CONFIGURED explícito. NUNCA se instala
//    Whisper/WhisperX local aquí -- es una dependencia de ML pesada que
//    requiere autorización explícita fuera de este pipeline.

import fs from "node:fs";
import type { TranscriptResult, TranscriptSegment } from "./types";

function parseSrtTimestamp(ts: string): number {
  const m = ts.trim().match(/(\d+):(\d+):(\d+)[.,](\d+)/);
  if (!m) return 0;
  const [, h, mn, s, ms] = m;
  return Number(h) * 3600 + Number(mn) * 60 + Number(s) + Number(ms) / 1000;
}

export function parseSrt(srtContent: string): TranscriptSegment[] {
  const blocks = srtContent.replace(/\r/g, "").split(/\n\n+/).filter(Boolean);
  const segments: TranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->");
    const textLines = lines.slice(lines.indexOf(timeLine) + 1);
    const text = textLines.join(" ").trim();
    if (!text) continue;
    segments.push({
      startSeconds: parseSrtTimestamp(startRaw),
      endSeconds: parseSrtTimestamp(endRaw),
      text,
    });
  }
  return segments;
}

export function transcriptFromEmbeddedSrt(srtPath: string): TranscriptResult {
  const content = fs.readFileSync(srtPath, "utf-8");
  const segments = parseSrt(content);
  if (segments.length === 0) {
    return { status: "NOT_CONFIGURED", provider: null, segments: [], reason: "Subtítulo embebido presente pero vacío." };
  }
  return { status: "OBSERVED", provider: "embedded_captions", segments };
}

async function transcribeViaGroq(audioPath: string, apiKey: string): Promise<TranscriptResult> {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(audioPath)]), "audio.wav");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "verbose_json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    return { status: "ERROR", provider: "groq_whisper", segments: [], reason: `Groq ASR ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  const data: any = await res.json();
  const segments: TranscriptSegment[] = (data.segments ?? []).map((s: any) => ({
    startSeconds: Number(s.start),
    endSeconds: Number(s.end),
    text: String(s.text ?? "").trim(),
  }));
  return { status: "OBSERVED", provider: "groq_whisper", segments };
}

async function transcribeViaOpenAI(audioPath: string, apiKey: string): Promise<TranscriptResult> {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(audioPath)]), "audio.wav");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    return { status: "ERROR", provider: "openai_whisper", segments: [], reason: `OpenAI ASR ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  const data: any = await res.json();
  const segments: TranscriptSegment[] = (data.segments ?? []).map((s: any) => ({
    startSeconds: Number(s.start),
    endSeconds: Number(s.end),
    text: String(s.text ?? "").trim(),
  }));
  return { status: "OBSERVED", provider: "openai_whisper", segments };
}

/**
 * Orquesta el orden de costo completo. `embeddedSrtPath` viene de
 * videoInput.extractEmbeddedSubtitles (null si el video no trae subtítulos).
 */
export async function getTranscript(opts: {
  embeddedSrtPath: string | null;
  audioPath: string;
}): Promise<TranscriptResult> {
  if (opts.embeddedSrtPath) {
    const fromEmbedded = transcriptFromEmbeddedSrt(opts.embeddedSrtPath);
    if (fromEmbedded.status === "OBSERVED") return fromEmbedded;
  }
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) return transcribeViaGroq(opts.audioPath, groqKey);
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return transcribeViaOpenAI(opts.audioPath, openaiKey);
  return {
    status: "NOT_CONFIGURED",
    provider: null,
    segments: [],
    reason: "Sin subtítulos embebidos y sin GROQ_API_KEY/OPENAI_API_KEY configuradas. No se instaló Whisper local (requiere autorización explícita).",
  };
}
