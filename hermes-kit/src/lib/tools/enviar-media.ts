import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import type { ToolDefinition, ToolHandler } from "./index";
import { REPO_ROOT } from "../vidaDivina/productKnowledge";
import { enqueueOutboxMedia } from "../db";
import { leadPhone } from "../airtable";

const STORE_PATH = path.join(REPO_ROOT, "commercial-media", "src", "commercialMediaStore.js");

let _getCommercialMedia: ((mediaId: string) => { mediaId: string; filePath: string; mediaType: string; active: boolean } | null) | null = null;
async function getCommercialMedia(mediaId: string) {
  if (!_getCommercialMedia) {
    const mod: any = await import(pathToFileURL(STORE_PATH).href);
    _getCommercialMedia = mod.getCommercialMedia;
  }
  return _getCommercialMedia!(mediaId);
}

interface EnviarMediaArgs {
  mediaId: string;
  conversationId?: number;
}

export const enviarMediaDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "enviarMedia",
    description:
      "Envía por WhatsApp un testimonio/contenido comercial REAL ya localizado con buscarTestimonios o buscarContenidoComercial (usa el mediaId que devolvieron). REGLA DURA: solo puedes afirmar o representar de cualquier forma que una media fue enviada si EN ESE MISMO TURNO llamaste de verdad a esta tool y su resultado fue éxito (ok:true) -- nunca antes, nunca en su lugar. Esto prohíbe tanto frases en lenguaje natural ('te mando/envío/acabo de enviarte otro/un testimonio/vídeo/contenido') COMO cualquier etiqueta, corchete, paréntesis o formato tipo log que simule una confirmación de envío que no ejecutaste de verdad -- por ejemplo '[Testimonio enviado via enviarMedia...]', '[Media enviada...]', '(enviado vía enviarMedia)', 'mediaId: ... enviado', o cualquier variante similar. Si no llamaste a esta tool en este turno, o si la llamaste y devolvió ok:false, NUNCA representes un envío -- habla solo de lo que realmente pasó (que vas a buscarlo, que no se pudo enviar, etc.). Decirlo sin haber llamado a la tool (por ejemplo cuando el cliente pide 'otro' o 'uno más') NO envía nada de verdad. Nunca inventes un mediaId: solo usa uno que haya salido de esas herramientas.",
    parameters: {
      type: "object",
      properties: {
        mediaId: { type: "string", description: "El mediaId real devuelto por buscarTestimonios/buscarContenidoComercial." },
      },
      required: ["mediaId"],
    },
  },
};

export const enviarMediaHandler: ToolHandler<EnviarMediaArgs> = async (args) => {
  const record = await getCommercialMedia(args.mediaId);
  if (!record) {
    return { ok: false, message: `mediaId "${args.mediaId}" no existe en el registro real. No lo inventes: vuelve a llamar a buscarTestimonios/buscarContenidoComercial primero.` };
  }
  if (!record.active) {
    return { ok: false, message: `El contenido "${args.mediaId}" existe pero está marcado inactivo/no aprobado -- no se envía.` };
  }
  const absPath = path.isAbsolute(record.filePath) ? record.filePath : path.join(REPO_ROOT, record.filePath);
  if (!fs.existsSync(absPath)) {
    return { ok: false, message: `El archivo real de "${args.mediaId}" no está en disco (${record.filePath}) -- no se puede enviar.` };
  }

  const conversationId = args.conversationId ?? 0;
  const phone = leadPhone(conversationId);
  if (!phone) return { ok: false, message: "No se pudo determinar el teléfono real del chat." };

  const kind = record.mediaType === "VIDEO_TESTIMONIAL" || /\.mp4$/i.test(absPath) ? "video" : "image";
  enqueueOutboxMedia(conversationId, phone, absPath, "", kind);

  return { ok: true, message: `Contenido real "${args.mediaId}" encolado para envío por WhatsApp. Sigue la conversación con normalidad; llegará en unos segundos.` };
};
