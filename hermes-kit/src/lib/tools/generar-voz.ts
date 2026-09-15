import type { ToolDefinition, ToolHandler } from "./index";
import { generateVoice } from "../vidaDivina/voiceEngineClient";
import { enqueueOutboxMedia } from "../db";
import { leadPhone } from "../airtable";
import { getSetting } from "../db";

// Nota de decisión automática: el handler (baileys/handler.ts) YA decide solo
// (decideResponseMode) cuándo la respuesta normal debe ir en voz. Esta tool
// existe para el caso EXPLÍCITO en que el propio modelo, dentro de la
// conversación, decide enviar una nota de voz adicional (p.ej. "te mando un
// audio explicándotelo") -- nunca para uso rutinario en cada respuesta.

interface GenerarVozArgs {
  texto: string;
  conversationId?: number;
}

export const generarVozDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "generarVoz",
    description:
      "Genera y envía una nota de voz REAL (la voz oficial de Vida Divina) con el texto dado. Solo llámala cuando el lead haya pedido explícitamente un audio/nota de voz, o cuando tú mismo anuncies que vas a mandar uno. NUNCA la uses para respuestas triviales -- el texto normal ya se envía solo, no dupliques la respuesta en voz sin motivo.",
    parameters: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Texto exacto a convertir en voz (español natural, sin markdown)." },
      },
      required: ["texto"],
    },
  },
};

export const generarVozHandler: ToolHandler<GenerarVozArgs> = async (args) => {
  if (getSetting("voice_enabled") === "0") {
    return { ok: false, message: "La voz está desactivada en Ajustes. Responde solo en texto." };
  }
  const conversationId = args.conversationId ?? 0;
  const phone = leadPhone(conversationId);
  if (!phone) return { ok: false, message: "No se pudo determinar el teléfono real del chat." };

  const voiceProfileId = getSetting("voice_profile_id") || undefined;
  const result = await generateVoice(args.texto, voiceProfileId ? { voiceProfileId } : {});
  if (!result.ok) {
    return { ok: false, message: `No se pudo generar el audio real (${result.reason}). Responde en texto en su lugar.` };
  }

  enqueueOutboxMedia(conversationId, phone, result.oggPath, "", "audio");
  return { ok: true, message: "Nota de voz real encolada para envío. No repitas el mismo texto en un mensaje de texto aparte." };
};
