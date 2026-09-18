// videoInput.ts — Ingesta técnica real de video (ffmpeg/ffprobe), $0 local.
//
// No asume ningún servicio pagado. Todo aquí es binario local ya presente
// en el entorno (mismo ffmpeg que usa voice-engine, ver
// vidaDivina/voiceEngineClient.ts, pero invocado directo por proceso --
// hermes-kit no tenía hasta ahora ningún camino de VIDEO entrante, solo
// audio saliente).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ExtractedFrame, VideoProbe } from "./types";

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

export interface VideoInputError {
  ok: false;
  reason: string;
}

export async function probeVideo(filePath: string): Promise<{ ok: true; probe: VideoProbe } | VideoInputError> {
  if (!fs.existsSync(filePath)) {
    return { ok: false, reason: `Archivo no encontrado: ${filePath}` };
  }
  const { stdout, code, stderr } = await run("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  if (code !== 0) {
    return { ok: false, reason: `ffprobe falló (code ${code}): ${stderr.slice(0, 300)}` };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return { ok: false, reason: `ffprobe devolvió JSON inválido: ${err instanceof Error ? err.message : String(err)}` };
  }
  const videoStream = (parsed.streams ?? []).find((s: any) => s.codec_type === "video");
  const subtitleStream = (parsed.streams ?? []).find((s: any) => s.codec_type === "subtitle");
  return {
    ok: true,
    probe: {
      path: filePath,
      durationSeconds: Number(parsed.format?.duration ?? videoStream?.duration ?? 0),
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      hasEmbeddedSubtitles: Boolean(subtitleStream),
      subtitleStreamIndex: subtitleStream ? Number(subtitleStream.index) : null,
      format: String(parsed.format?.format_name ?? "unknown"),
    },
  };
}

/** Extrae subtítulos embebidos (si existen) como SRT real -- $0, nunca ASR. */
export async function extractEmbeddedSubtitles(
  filePath: string,
  subtitleStreamIndex: number,
  outDir: string
): Promise<{ ok: true; srtPath: string } | VideoInputError> {
  fs.mkdirSync(outDir, { recursive: true });
  const srtPath = path.join(outDir, "embedded.srt");
  const { code, stderr } = await run("ffmpeg", [
    "-y",
    "-i", filePath,
    "-map", `0:${subtitleStreamIndex}`,
    srtPath,
  ]);
  if (code !== 0 || !fs.existsSync(srtPath)) {
    return { ok: false, reason: `No se pudo extraer subtítulo embebido: ${stderr.slice(0, 300)}` };
  }
  return { ok: true, srtPath };
}

/** Extrae audio mono 16kHz -- formato estándar para proveedores ASR. */
export async function extractAudio(filePath: string, outDir: string): Promise<{ ok: true; audioPath: string } | VideoInputError> {
  fs.mkdirSync(outDir, { recursive: true });
  const audioPath = path.join(outDir, "audio.wav");
  const { code, stderr } = await run("ffmpeg", [
    "-y",
    "-i", filePath,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    audioPath,
  ]);
  if (code !== 0 || !fs.existsSync(audioPath)) {
    return { ok: false, reason: `No se pudo extraer audio: ${stderr.slice(0, 300)}` };
  }
  return { ok: true, audioPath };
}

/**
 * Extrae frames REPRESENTATIVOS (no todos) vía detección de cambio de
 * escena. Si el video es demasiado simple/corto para producir cortes de
 * escena (ej. un fixture sintético), cae a muestreo uniforme. Tope duro
 * `maxFrames` para controlar costo de visión aguas abajo.
 */
export async function extractRepresentativeFrames(
  filePath: string,
  durationSeconds: number,
  outDir: string,
  maxFrames = 6
): Promise<{ ok: true; frames: ExtractedFrame[] } | VideoInputError> {
  fs.mkdirSync(outDir, { recursive: true });
  const scenePattern = path.join(outDir, "scene_%03d.jpg");
  await run("ffmpeg", [
    "-y",
    "-i", filePath,
    "-vf", `select='gt(scene,0.3)',showinfo,scale=480:-1`,
    "-vsync", "vfr",
    "-frames:v", String(maxFrames),
    scenePattern,
  ]);
  let files = fs.existsSync(outDir)
    ? fs.readdirSync(outDir).filter((f) => f.startsWith("scene_")).sort()
    : [];

  if (files.length === 0) {
    // Fallback: muestreo uniforme (video sin cortes de escena detectables).
    const n = Math.min(maxFrames, Math.max(1, Math.floor(durationSeconds)));
    const uniformPattern = path.join(outDir, "uniform_%03d.jpg");
    const fps = durationSeconds > 0 ? (n / durationSeconds).toFixed(4) : "1";
    await run("ffmpeg", [
      "-y",
      "-i", filePath,
      "-vf", `fps=${fps},scale=480:-1`,
      "-frames:v", String(n),
      uniformPattern,
    ]);
    files = fs.existsSync(outDir)
      ? fs.readdirSync(outDir).filter((f) => f.startsWith("uniform_")).sort()
      : [];
  }

  if (files.length === 0) {
    return { ok: false, reason: "No se pudo extraer ningún frame representativo (ffmpeg no produjo salida)." };
  }

  // Timestamp aproximado por posición uniforme -- suficiente para evidencia
  // trazable de "en qué punto del video" sin depender de parsear showinfo.
  const frames: ExtractedFrame[] = files.map((f, i) => ({
    id: `frame_${i + 1}`,
    path: path.join(outDir, f),
    timestampSeconds: files.length > 1 ? Number(((durationSeconds * i) / (files.length - 1)).toFixed(2)) : 0,
  }));
  return { ok: true, frames };
}
