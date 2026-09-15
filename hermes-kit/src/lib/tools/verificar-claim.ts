import type { ToolDefinition, ToolHandler } from "./index";
import { getApprovedClaim } from "../vidaDivina/claims";

interface VerificarClaimArgs {
  producto: string;
  afirmacion: string;
}

export const verificarClaimDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "verificarClaim",
    description:
      "Verifica si una afirmación concreta sobre un producto (ingrediente, mecanismo, beneficio, cura, resultado) está respaldada por el catálogo real o si es un claim médico/fisiológico que NO puedes hacer. LLÁMALA antes de decir cualquier cosa que suene a 'esto cura/elimina/regula X' o que no sea un dato literal ya visto en consultarProducto. Si vuelve approved:false, NO lo digas -- reformula sin esa afirmación.",
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Producto sobre el que se hace la afirmación." },
        afirmacion: { type: "string", description: "La frase exacta que estás a punto de decirle al lead." },
      },
      required: ["producto", "afirmacion"],
    },
  },
};

export const verificarClaimHandler: ToolHandler<VerificarClaimArgs> = async (args) => {
  const veredicto = await getApprovedClaim(args.producto, args.afirmacion);
  return {
    ok: true,
    approved: veredicto.approved,
    categoria: veredicto.category,
    motivo: veredicto.reasoning,
    instruccion: veredicto.approved
      ? "Puedes decirlo tal cual, está respaldado."
      : "NO lo digas así. Reformula sin esa afirmación, o dile al lead que no puedes confirmar eso y ofrécele lo que sí sabes con certeza.",
  };
};
