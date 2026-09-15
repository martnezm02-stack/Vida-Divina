import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getConversationById, insertMessage, enqueueOutboxMedia } from "@/lib/db";

// Subida de un adjunto (documento, audio o vídeo) desde el panel en Modo
// Humano -- misma infraestructura real ya usada por la imagen
// (image/route.ts): guarda en data/media/, registra el mensaje como
// 'human' y lo encola en el outbox (enqueueOutboxMedia, ya soporta
// audio/vídeo; 'document' se añadió en outbox.ts para este mismo cambio).
// La imagen sigue usando su propia ruta (image/route.ts) sin tocar --
// esta ruta es solo para los 3 tipos que el botón "Adjuntar" añade.
export const dynamic = "force-dynamic";

const MEDIA_DIR = path.resolve(process.cwd(), "data", "media");

type Kind = "document" | "audio" | "video";

const LIMITS: Record<Kind, { maxBytes: number; label: string }> = {
  document: { maxBytes: 16 * 1024 * 1024, label: "documento" },
  audio: { maxBytes: 16 * 1024 * 1024, label: "audio" },
  video: { maxBytes: 64 * 1024 * 1024, label: "vídeo" },
};

// Extensiones reales aceptadas por tipo (WhatsApp/Baileys ya soporta el
// resto vía mimetype -- aquí solo se limita "documento" a formatos de
// oficina/texto comunes, tal como pidió el encargo).
const ALLOWED_DOCUMENT_EXT = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"]);

function extFromFilename(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  return ext || "bin";
}

interface RouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ ok: false, error: "conversación no encontrada" }, { status: 404 });
  }

  const form = await req.formData();
  const kind = form.get("kind") as string | null;
  const file = form.get("file");
  const caption = ((form.get("caption") as string | null) ?? "").trim();

  if (kind !== "document" && kind !== "audio" && kind !== "video") {
    return NextResponse.json({ ok: false, error: "tipo de adjunto no soportado" }, { status: 400 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ ok: false, error: `no se recibió ningún ${LIMITS[kind].label}` }, { status: 400 });
  }
  if (file.size > LIMITS[kind].maxBytes) {
    return NextResponse.json(
      { ok: false, error: `${LIMITS[kind].label} demasiado grande (máx ${LIMITS[kind].maxBytes / (1024 * 1024)} MB)` },
      { status: 400 }
    );
  }

  const originalName = file instanceof File && file.name ? file.name : `adjunto.${kind}`;
  const ext = extFromFilename(originalName);

  if (kind === "document" && !ALLOWED_DOCUMENT_EXT.has(ext)) {
    return NextResponse.json(
      { ok: false, error: `formato de documento no soportado (.${ext}) -- usa PDF, DOCX, XLSX, TXT o similar` },
      { status: 400 }
    );
  }
  if (kind === "audio" && !file.type.startsWith("audio/")) {
    return NextResponse.json({ ok: false, error: "el archivo no es un audio" }, { status: 400 });
  }
  if (kind === "video" && !file.type.startsWith("video/")) {
    return NextResponse.json({ ok: false, error: "el archivo no es un vídeo" }, { status: 400 });
  }

  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const mediaPath = path.join(MEDIA_DIR, `${crypto.randomUUID()}.${ext}`);
  fs.writeFileSync(mediaPath, Buffer.from(await file.arrayBuffer()));

  // Mismo patrón ya usado por la imagen ("📷 <caption>" / "📷 [imagen enviada]"):
  // un emoji real distinto por tipo, y para documento el nombre original
  // (que outbox.ts vuelve a leer para el fileName real de WhatsApp).
  const emoji = kind === "document" ? "📄" : kind === "audio" ? "🎵" : "🎬";
  const content =
    kind === "document"
      ? `${emoji} ${originalName}`
      : caption
        ? `${emoji} ${caption}`
        : `${emoji} [${LIMITS[kind].label} enviado]`;

  const messageId = insertMessage(id, "human", content);
  // Para documento, el "caption" real que necesita el outbox es el nombre
  // original del archivo (outbox.ts lo usa como fileName real de WhatsApp,
  // no como pie de foto -- documentos no llevan pie).
  enqueueOutboxMedia(id, conv.phone, mediaPath, kind === "document" ? originalName : caption, kind);

  return NextResponse.json({ ok: true, messageId });
}
