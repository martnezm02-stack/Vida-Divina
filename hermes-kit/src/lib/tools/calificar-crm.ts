import type { ToolDefinition, ToolHandler } from "./index";
import { qualifyLead as qualifyLeadCrm } from "../vidaDivina/crmClient";
import { leadPhone } from "../airtable";
import { searchKnowledge } from "../vidaDivina/productKnowledge";

// Calificación REAL persistida en el CRM (crm/opportunities) -- distinta de
// la tool local "calificar" (que solo calcula un score 1-10 en memoria para
// orientar al modelo, sin tocar ningún almacén). Esta SÍ escribe en el CRM
// real, la única fuente de verdad comercial de Vida Divina.

interface QualifyLeadArgs {
  temperatura: "Caliente" | "Templado" | "Frío";
  producto?: string;
  necesidad?: string;
  conversationId?: number;
}

export const qualifyLeadDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "qualifyLead",
    description:
      "Registra en el CRM real la calificación de este lead (Caliente/Templado/Frío) según su interés real por comprar o distribuir. Llámala cuando tengas una idea razonable del interés del lead, aunque sea parcial -- se puede volver a llamar más adelante en la conversación para actualizarla.",
    parameters: {
      type: "object",
      properties: {
        temperatura: { type: "string", enum: ["Caliente", "Templado", "Frío"] },
        producto: { type: "string", description: "Nombre del producto de interés real, si ya se sabe (ej. 'Tongkat Ali'). Se resuelve contra el catálogo real." },
        necesidad: { type: "string", description: "Necesidad real identificada, si ya se sabe (ej. 'perder peso')." },
      },
      required: ["temperatura"],
    },
  },
};

export const qualifyLeadHandler: ToolHandler<QualifyLeadArgs> = async (args) => {
  const conversationId = args.conversationId ?? 0;
  const phone = leadPhone(conversationId);
  if (!phone) return { ok: false, message: "No se pudo determinar el teléfono real del chat." };

  // producto_id en el CRM real es una referencia lógica al Knowledge
  // Package (docs/productos/ compilado, no texto libre) -- se resuelve
  // aquí el nombre que dé el modelo contra el catálogo real antes de
  // escribir, nunca se pasa el texto libre tal cual.
  let productoId: string | null = null;
  if (args.producto) {
    const match = await searchKnowledge(args.producto, { limit: 1 });
    productoId = match[0]?.id ?? null;
  }

  const res = await qualifyLeadCrm({
    phone,
    temperatura: args.temperatura,
    productoId,
    necesidadId: args.necesidad ?? null,
  });

  return {
    ok: res.ok,
    message: res.ok ? `Lead calificado como ${args.temperatura} en el CRM real (estado: ${res.estado}).` : res.reason,
  };
};
