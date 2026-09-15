// admin.ts — Herramientas administrativas de Hermes (FASE "Identidad
// administrativa y permisos de Hermes", 2026-09-04). Autorización real
// SIEMPRE por teléfono (identity.ts) -- nunca por lo que el remitente
// escriba. Ninguna acción de aquí es destructiva/irreversible: solo
// lectura de estado y creación de NUEVOS Assets (nunca borra ni sobrescribe
// uno existente).

import path from "node:path";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import type { ToolDefinition, ToolHandler } from "./index";
import { resolveIdentity } from "../vidaDivina/identity";
import { leadPhone } from "../airtable";
import { getVidaDivinaSystemStatus } from "../vidaDivina/systemStatus";
import { generateVoice } from "../vidaDivina/voiceEngineClient";
import { REPO_ROOT } from "../vidaDivina/productKnowledge";

function requireAdmin(conversationId?: number): { ok: true } | { ok: false; message: string } {
  const phone = leadPhone(conversationId ?? 0);
  const identity = resolveIdentity(phone);
  if (identity.role !== "ADMIN") {
    return {
      ok: false,
      message: "Acción administrativa DENEGADA: quien escribe no es el administrador real. Responde con naturalidad sin mencionar tools/permisos internos -- sigue ayudando con lo que sí puedas resolver.",
    };
  }
  return { ok: true };
}

// ============================================================
// adminEstadoSistema -- consultar estado del sistema (solo lectura)
// ============================================================

interface AdminEstadoSistemaArgs {
  conversationId?: number;
}

export const adminEstadoSistemaDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminEstadoSistema",
    description:
      "[SOLO ADMINISTRADOR] Consulta el estado real de los sistemas de Vida Divina (catálogo de productos, contenido comercial, CRM, Voice Engine). Devuelve denegado si quien pregunta no es el administrador real.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const adminEstadoSistemaHandler: ToolHandler<AdminEstadoSistemaArgs> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };

  const estado = await getVidaDivinaSystemStatus();
  return {
    ok: true,
    denegado: false,
    catalogoProductos: estado.knowledgePackage.available ? "disponible" : "no disponible",
    contenidoComercial: `${estado.commercialMedia.count} asset(s) real(es)`,
    crm: estado.crm.configured ? "conectado" : "no configurado",
    voiceEngine: estado.voiceEngine.reachable ? "activo" : "apagado",
  };
};

// ============================================================
// adminGenerarAudioAsset -- generar y registrar un Asset de audio NUEVO
// (nunca reemplaza ni borra uno existente; una "v2" es un Asset nuevo con
// otro nombre, igual que en el generador de voz del Dashboard)
// ============================================================

interface AdminGenerarAudioAssetArgs {
  texto: string;
  nombre: string;
  producto?: string;
  intencion?: "CONSUMPTION" | "DISTRIBUTION";
  conversationId?: number;
}

export const adminGenerarAudioAssetDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "adminGenerarAudioAsset",
    description:
      "[SOLO ADMINISTRADOR] Genera un audio real nuevo (Voice Engine) y lo registra como Asset real reutilizable (mismo Commercial Media Registry que usa buscarAsset). NUNCA sobrescribe un Asset existente -- para una nueva versión, usa un nombre distinto (ej. 'explicacion-x-v2'). Devuelve denegado si quien pide esto no es el administrador real.",
    parameters: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Texto exacto a convertir en voz." },
        nombre: { type: "string", description: "Nombre semántico del nuevo Asset (ej. 'explicacion-te-divina-v2')." },
        producto: { type: "string", description: "Producto asociado, si aplica (nombre real del catálogo)." },
        intencion: { type: "string", enum: ["CONSUMPTION", "DISTRIBUTION"], description: "Uso del audio -- por defecto CONSUMPTION (explicación de producto)." },
      },
      required: ["texto", "nombre"],
    },
  },
};

function slugify(nombre: string): string {
  return nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const BUSINESS_INTENT_TO_MEDIA_TYPE: Record<string, string> = {
  CONSUMPTION: "AUDIO_OFICIAL",
  DISTRIBUTION: "BUSINESS_MODEL_AUDIO",
};

export const adminGenerarAudioAssetHandler: ToolHandler<AdminGenerarAudioAssetArgs> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };

  const slug = slugify(args.nombre);
  if (!slug) return { ok: false, message: `"${args.nombre}" no produce un nombre de archivo válido.` };

  const voz = await generateVoice(args.texto);
  if (!voz.ok) return { ok: false, message: `No se pudo generar el audio real: ${voz.reason}` };

  const incomingDir = path.join(REPO_ROOT, "commercial-media", "incoming");
  fs.mkdirSync(incomingDir, { recursive: true });
  const destino = path.join(incomingDir, `${slug}.ogg`);
  fs.copyFileSync(voz.oggPath, destino);

  const inspectorPath = path.join(REPO_ROOT, "commercial-media", "src", "mediaInspector.js");
  const storePath = path.join(REPO_ROOT, "commercial-media", "src", "commercialMediaStore.js");
  const inspector: any = await import(pathToFileURL(inspectorPath).href);
  const store: any = await import(pathToFileURL(storePath).href);

  const probe = inspector.probeMediaFile(destino, "audio");
  const stat = fs.statSync(destino);
  const businessIntent = BUSINESS_INTENT_TO_MEDIA_TYPE[args.intencion ?? "CONSUMPTION"] ? (args.intencion ?? "CONSUMPTION") : "CONSUMPTION";

  try {
    const { record, wasNew } = store.upsertCommercialMedia({
      displayName: slug,
      filePath: destino,
      sourcePath: destino,
      mimeType: "audio/ogg",
      mediaType: BUSINESS_INTENT_TO_MEDIA_TYPE[businessIntent],
      businessIntent,
      productId: args.producto ?? null,
      needTags: [],
      language: "es",
      durationSeconds: probe.durationSeconds,
      fileSizeBytes: stat.size,
      contentHash: createHash("sha256").update(fs.readFileSync(destino)).digest("hex"),
      classificationConfidence: "HIGH",
      classificationReason: "Generado por el administrador real vía Hermes (adminGenerarAudioAsset) -- nombre semántico y metadata asignados directamente, no inferidos.",
    });
    return { ok: true, denegado: false, mediaId: record.mediaId, displayName: record.displayName, wasNew, message: "Asset de audio real generado y registrado. Nunca sobrescribe uno existente." };
  } catch (err) {
    return { ok: false, message: `No se pudo registrar el Asset real: ${err instanceof Error ? err.message : String(err)}` };
  }
};
