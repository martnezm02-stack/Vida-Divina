// ============================================================
// Transcripción de notas de voz (WhatsApp) → texto.
// Usa el MISMO OpenRouter del chat (audio input a un modelo multimodal),
// así que NO hace falta otra API ni otra key: con la de OpenRouter basta.
// OpenRouter acepta el audio en base64 dentro de chat/completions y admite
// formato OGG, que es justo el que manda WhatsApp (Opus en contenedor OGG).
// Añadido 2026-07-07. No forma parte del kit base.
//
// Config en .env.local (opcional):
//   TRANSCRIPTION_MODEL   modelo multimodal con audio (default google/gemini-2.5-flash)
// ============================================================

import { getSetting } from "./db";

const MODEL = process.env.TRANSCRIPTION_MODEL || "google/gemini-2.5-flash";

export function transcriptionConfigured(): boolean {
  // La transcripción va por OpenRouter: si hay key de OpenRouter, funciona.
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * Transcribe un audio (buffer de WhatsApp, OGG/Opus por defecto) a texto en
 * español, pasándolo a un modelo multimodal vía OpenRouter. Devuelve null si
 * no hay key o si falla (el handler pedirá que lo escriban).
 */
export async function transcribeAudio(audio: Buffer, format = "ogg", idiomaConocido?: "es" | "en"): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const model = getSetting("transcription_model") || MODEL;

  // Idioma (2026-09-12, "idioma de la conversación"): antes esta instrucción
  // forzaba "en español" siempre, sin importar el idioma real del cliente
  // -- un audio en inglés se transcribía igual como si fuera español.
  // Ahora se pide el idioma REAL hablado (nunca traducir), usando el
  // idioma ya conocido de la conversación SOLO como pista débil (nunca
  // una instrucción rígida) -- si el cliente cambió de idioma en este
  // audio, debe transcribirse en el idioma real que se escucha. Ninguna
  // llamada adicional al LLM: es la MISMA llamada de transcripción de
  // siempre, solo con el prompt ajustado; el idioma del texto resultante
  // se detecta después con el mismo detector determinista que ya usa
  // cualquier mensaje de texto (ver languageDetection.ts), no aquí.
  const pistaIdioma =
    idiomaConocido === "en"
      ? " Lo más probable, por el historial de esta conversación, es que esté en inglés -- pero transcribe el idioma real que escuches, aunque sea distinto."
      : idiomaConocido === "es"
        ? " Lo más probable, por el historial de esta conversación, es que esté en español -- pero transcribe el idioma real que escuches, aunque sea distinto."
        : "";

  try {
    const b64 = Buffer.from(audio).toString("base64");
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/whatsapp-ai-agent-kit",
        "X-Title": "WhatsApp AI Agent Kit",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcribe literalmente esta nota de voz, en el idioma real en que se habla (puede ser español o inglés) -- nunca traduzcas.${pistaIdioma} Devuelve SOLO la transcripción, sin comillas, sin comentarios ni notas tuyas. Si no se entiende nada, responde exactamente: (inaudible).`,
              },
              { type: "input_audio", input_audio: { data: b64, format } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text || text.length === 0 || /^\(inaudible\)$/i.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}
