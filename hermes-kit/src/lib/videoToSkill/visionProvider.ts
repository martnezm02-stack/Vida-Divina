// visionProvider.ts — Análisis visual real de frames vía el soporte
// multimodal que YA tiene el modelo por defecto de Hermes (gpt-4o-mini
// acepta imágenes; el cliente de src/lib/openrouter.ts nunca las envía
// hoy). Deliberadamente NO se modifica openrouter.ts (archivo "NO
// modificar" según hermes-kit/CLAUDE.md) -- este es un cliente OpenRouter
// propio, aislado, mismo paquete `openai` ya dependencia del proyecto.
//
// Costo: solo frames representativos (ya acotados por videoInput, tope
// duro), nunca el video completo ni todos los frames. Modelo por defecto
// respeta la regla del proyecto: nunca ":free" (CLAUDE.md), gpt-4o-mini
// como opción barata ya usada como default real en OPENROUTER_MODEL.

import fs from "node:fs";
import OpenAI from "openai";
import type { ExtractedFrame, FrameObservation, VisionResult } from "./types";

const VISION_MODEL = process.env.VIDEO_TO_SKILL_VISION_MODEL ?? "openai/gpt-4o-mini";

function frameToDataUrl(framePath: string): string {
  const buf = fs.readFileSync(framePath);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

const OBSERVATION_SCHEMA_HINT = `Responde SOLO con JSON válido: {"interfaceObserved": string|null, "actionObserved": string|null, "textVisible": string|null, "notes": string|null}. Describe únicamente lo que es visible en la imagen. Si algo no es visible o no estás seguro, usa null -- nunca inventes.`;

export async function analyzeFrames(frames: ExtractedFrame[]): Promise<VisionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      status: "NOT_CONFIGURED",
      provider: null,
      frames: [],
      reason: "OPENROUTER_API_KEY no configurada en este entorno -- sin vision provider real disponible.",
    };
  }

  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1", timeout: 30_000, maxRetries: 1 });
  const observations: FrameObservation[] = [];

  for (const frame of frames) {
    try {
      const completion = await client.chat.completions.create({
        model: VISION_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OBSERVATION_SCHEMA_HINT },
              { type: "image_url", image_url: { url: frameToDataUrl(frame.path) } },
            ] as any,
          },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      observations.push({
        frameId: frame.id,
        timestampSeconds: frame.timestampSeconds,
        status: "OBSERVED",
        interfaceObserved: parsed.interfaceObserved ?? null,
        actionObserved: parsed.actionObserved ?? null,
        textVisible: parsed.textVisible ?? null,
        notes: parsed.notes ?? null,
      });
    } catch (err) {
      observations.push({
        frameId: frame.id,
        timestampSeconds: frame.timestampSeconds,
        status: "ERROR",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const anyObserved = observations.some((o) => o.status === "OBSERVED");
  return {
    status: anyObserved ? "OBSERVED" : "ERROR",
    provider: `openrouter:${VISION_MODEL}`,
    frames: observations,
    reason: anyObserved ? undefined : "Ningún frame pudo analizarse (ver reason por frame).",
  };
}
