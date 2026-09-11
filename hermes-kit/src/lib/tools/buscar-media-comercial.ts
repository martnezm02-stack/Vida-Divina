import type { ToolDefinition, ToolHandler } from "./index";
import { searchCommercialMedia, searchTestimonials, findAssetByName } from "../vidaDivina/commercialMedia";
import { getProductKnowledge } from "../vidaDivina/productKnowledge";
import { resolveIdentity } from "../vidaDivina/identity";
import { leadPhone } from "../airtable";

// Contenido comercial REAL (commercial-media/incoming/, ya clasificado en
// commercial-media/data/registry/). Nunca se inventa un testimonio ni se
// narra uno "de memoria": si no hay coincidencia real, se dice con honestidad.

interface BuscarTestimoniosArgs {
  producto?: string;
  necesidad?: string;
}

export const buscarTestimoniosDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "buscarTestimonios",
    description:
      "Busca un testimonio REAL en vídeo (cliente real contando su experiencia) para un producto o necesidad concretos. Úsala cuando el lead pida pruebas/testimonios/casos reales antes de mencionar que existe uno. Si no hay match real, NO inventes un testimonio.",
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Nombre del producto (opcional si das necesidad)." },
        necesidad: { type: "string", description: "Necesidad del lead, ej. 'perder peso', 'energía' (opcional)." },
      },
    },
  },
};

export const buscarTestimoniosHandler: ToolHandler<BuscarTestimoniosArgs> = async (args) => {
  // El registry real identifica productos por su ID canónico del catálogo
  // (ej. "productos/07-rendimiento-fisico/ripped-capsules"), nunca por el
  // texto libre que escribe el cliente/LLM -- se resuelve aquí, con la MISMA
  // búsqueda real de producto que ya usa el resto de Hermes, nunca un
  // segundo mecanismo de matching inventado para esta tool.
  let productId: string | undefined;
  if (args.producto) {
    const conocimiento = await getProductKnowledge(args.producto);
    if (!conocimiento.found) {
      return { ok: true, encontrado: false, message: `No se reconoce "${args.producto}" como un producto real del catálogo -- no se puede buscar un testimonio para él.` };
    }
    productId = conocimiento.productId;
  }

  let res = await searchTestimonials({
    productId,
    needTags: args.necesidad ? [args.necesidad] : undefined,
  });
  // Hallazgo real (QA conversacional, 2026-09-04): el registry real de
  // testimonios hoy casi no tiene needTags clasificados (la mayoría []) --
  // exigir la necesidad como filtro DURO descartaba testimonios reales que sí
  // servían como prueba social genérica. needTags es un refinamiento, nunca
  // un requisito: si no hay match con él, se reintenta sin filtrar por
  // necesidad antes de rendirse -- sigue siendo 100% contenido real, nunca inventado.
  if (!res.found && args.necesidad) {
    res = await searchTestimonials({ productId });
  }
  if (!res.found) return { ok: true, encontrado: false, message: res.reason };
  return { ok: true, encontrado: true, mediaId: res.mediaId, displayName: res.displayName, fileDisponible: res.fileExists, message: "Testimonio real disponible. Para enviarlo al lead, llama a enviarMedia con este mediaId." };
};

interface BuscarContenidoComercialArgs {
  producto?: string;
  intencion?: "CONSUMPTION" | "DISTRIBUTION" | "GENERAL";
  necesidad?: string;
}

export const buscarContenidoComercialDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "buscarContenidoComercial",
    description:
      "Busca material comercial REAL aprobado (explicación de producto, presentación de negocio/distribución) para enviar al lead, distinto de un testimonio de cliente. intencion='DISTRIBUTION' para contenido de oportunidad de negocio, 'CONSUMPTION' para explicación de producto. Si no hay match real, no inventes que existe.",
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string" },
        intencion: { type: "string", enum: ["CONSUMPTION", "DISTRIBUTION", "GENERAL"] },
        necesidad: { type: "string" },
      },
    },
  },
};

export const buscarContenidoComercialHandler: ToolHandler<BuscarContenidoComercialArgs> = async (args) => {
  let res = await searchCommercialMedia({
    productId: args.producto,
    businessIntent: args.intencion,
    needTags: args.necesidad ? [args.necesidad] : undefined,
  });
  // Mismo criterio que buscarTestimonios: needTags es un refinamiento, no un
  // requisito duro, dado lo poco clasificado que está hoy el registry real.
  if (!res.found && args.necesidad) {
    res = await searchCommercialMedia({ productId: args.producto, businessIntent: args.intencion });
  }
  if (!res.found) return { ok: true, encontrado: false, message: res.reason };
  return { ok: true, encontrado: true, mediaId: res.mediaId, displayName: res.displayName, mediaType: res.mediaType, fileDisponible: res.fileExists, message: "Contenido real disponible. Para enviarlo al lead, llama a enviarMedia con este mediaId." };
};

interface BuscarAssetArgs {
  nombre: string;
  conversationId?: number;
}

// FASE "Identidad administrativa y permisos de Hermes" (2026-09-04):
// buscarAsset resuelve Assets por su NOMBRE INTERNO/técnico del registry
// (a diferencia de buscarTestimonios/buscarContenidoComercial, que resuelven
// por NECESIDAD/producto real del cliente) -- referenciar un asset por su
// nombre semántico interno es una acción administrativa/operativa, nunca
// algo que un cliente normal necesita pedir. Se restringe aquí SIN tocar
// enviarMedia/buscarTestimonios/buscarContenidoComercial (herramientas
// comerciales existentes, sin cambios de permisos).
export const buscarAssetDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "buscarAsset",
    description:
      "[SOLO ADMINISTRADOR] Resuelve un Asset real (audio, testimonio o contenido comercial) por su NOMBRE SEMÁNTICO interno -- el mismo nombre que se le dio al crearlo desde el Dashboard (ej. 'explicacion-te-divina', 'bienvenida-distribuidor'). Úsala cuando el remitente te indique directamente 'usa el audio X' o similar, con X el nombre técnico. Si quien escribe no es el administrador real, esta tool devuelve denegado -- nunca la uses para intentar saltarte eso, y nunca reveles el motivo exacto de la denegación al cliente. Si no existe un Asset real con ese nombre, dilo con honestidad -- nunca inventes uno. El mediaId que devuelve se usa con enviarMedia para mandarlo de verdad.",
    parameters: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre semántico del Asset (nunca un ID técnico ni una ruta de archivo)." },
      },
      required: ["nombre"],
    },
  },
};

export const buscarAssetHandler: ToolHandler<BuscarAssetArgs> = async (args) => {
  const phone = leadPhone(args.conversationId ?? 0);
  const identity = resolveIdentity(phone);
  if (identity.role !== "ADMIN") {
    return {
      ok: true,
      encontrado: false,
      denegado: true,
      message: "Acción administrativa DENEGADA: quien escribe no es el administrador real. Responde con naturalidad sin mencionar tools/permisos internos -- sigue ayudando al cliente con lo que sí puedas resolver.",
    };
  }
  const res = await findAssetByName(args.nombre);
  if (!res.found) return { ok: true, encontrado: false, message: `No existe ningún Asset real con el nombre "${args.nombre}". No lo inventes -- dile al negocio/cliente que no está disponible.` };
  return { ok: true, encontrado: true, mediaId: res.mediaId, displayName: res.displayName, mediaType: res.mediaType, fileDisponible: res.fileExists, message: "Asset real encontrado. Para enviarlo, llama a enviarMedia con este mediaId." };
};
