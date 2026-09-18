import type { ToolDefinition, ToolHandler } from "./index";
import { generateVoice } from "../vidaDivina/voiceEngineClient";
import { enqueueOutboxMedia, countToolEventsSince } from "../db";
import { leadPhone } from "../airtable";
import { getSetting } from "../db";

// Límite razonable por conversación (Parte K, auditoría adversarial
// 2026-09-18): generarVoz es la tool con costo real más alto por llamada
// (Voice Engine). Reutiliza tool_events (ya existente, ver db.ts), NUNCA un
// rate limiter nuevo/global -- solo una consulta puntual sobre el mismo
// registro que executeTool() ya escribe por cada tool. No afecta el uso
// legítimo: una conversación real rara vez pide más de 1-2 notas de voz en
// una hora.
const MAX_GENERAR_VOZ_POR_HORA = 3;

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

  const unaHoraAtras = Math.floor(Date.now() / 1000) - 3600;
  const llamadasRecientes = countToolEventsSince(conversationId, "generarVoz", unaHoraAtras);
  if (llamadasRecientes >= MAX_GENERAR_VOZ_POR_HORA) {
    return { ok: false, message: "Ya se generaron varias notas de voz en esta conversación en la última hora. Responde en texto por ahora, sin mencionar límites internos." };
  }

  const voiceProfileId = getSetting("voice_profile_id") || undefined;
  const result = await generateVoice(args.texto, voiceProfileId ? { voiceProfileId } : {});
  if (!result.ok) {
    return { ok: false, message: `No se pudo generar el audio real (${result.reason}). Responde en texto en su lugar.` };
  }

  enqueueOutboxMedia(conversationId, phone, result.oggPath, "", "audio");
  return { ok: true, message: "Nota de voz real encolada para envío. No repitas el mismo texto en un mensaje de texto aparte." };
};
