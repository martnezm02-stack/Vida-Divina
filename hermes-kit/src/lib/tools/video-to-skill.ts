import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition, ToolHandler } from "./index";
import { runVideoToSkillPipeline } from "../videoToSkill";
import { resolveIdentity } from "../vidaDivina/identity";
import { leadPhone } from "../airtable";

// Mismo patrón EXACTO que comercio.ts/admin.ts -- identidad real por
// teléfono, nunca por lo que el remitente escriba. Hallazgo HIGH de la
// auditoría adversarial 2026-09-18: esta era la única de las 31 tools
// registradas sin ningún gate de identidad, pese a tener capacidad real de
// leer archivos del filesystem del servidor.
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

const EXTENSIONES_VIDEO_PERMITIDAS = new Set(["mp4", "mov", "webm", "mkv", "avi"]);

/**
 * Valida `videoPath` ANTES de tocar el filesystem/spawnear ffmpeg/ffprobe:
 * rechaza URLs remotas (la tool solo acepta video LOCAL, ver su propia
 * descripción -- antes esto no se comprobaba en código), rechaza rutas que
 * no resuelvan a un archivo real ya existente (cierra el vector de sondear
 * archivos arbitrarios del servidor: un archivo que no exista, o que exista
 * pero no tenga extensión de video real, se rechaza aquí, nunca llega a
 * probeVideo/ffprobe). No restringe a un directorio fijo -- esta tool es de
 * uso administrativo directo sobre archivos que el propio ADMIN coloca en
 * cualquier ruta de su servidor, no una entrada de cliente.
 */
function validarVideoPath(videoPath: string): { ok: true; resolved: string } | { ok: false; message: string } {
  if (!videoPath || typeof videoPath !== "string" || !videoPath.trim()) {
    return { ok: false, message: "Falta la ruta real del video." };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(videoPath.trim())) {
    return { ok: false, message: "videoToSkill no acepta URLs remotas -- solo un archivo de video ya local en el servidor." };
  }
  if (videoPath.includes("\0")) {
    return { ok: false, message: "Ruta de video inválida." };
  }
  const resolved = path.resolve(videoPath);
  const ext = path.extname(resolved).slice(1).toLowerCase();
  if (!EXTENSIONES_VIDEO_PERMITIDAS.has(ext)) {
    return { ok: false, message: "videoToSkill solo acepta archivos de video reales (mp4/mov/webm/mkv/avi)." };
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return { ok: false, message: "No se encontró ningún archivo de video real en esa ruta." };
  }
  if (!stat.isFile()) {
    return { ok: false, message: "La ruta indicada no es un archivo de video real." };
  }
  return { ok: true, resolved };
}

// Tool de desarrollo/aprendizaje, no de uso conversacional rutinario. Expone
// el pipeline aislado `videoToSkill` (video -> evidencia -> SKILL_SPEC ->
// staging -> validación) como tool invocable, sin tocar su lógica interna.
// El boundary OBSERVACIÓN -> CONOCIMIENTO -> IMPLEMENTACIÓN -> APROBACIÓN ->
// ACTIVACIÓN se mantiene intacto: esta tool nunca llega a ACTIVATE, solo deja
// la skill en staging pendiente de HumanReview (skillReview.submitReview).

interface VideoToSkillArgs {
  videoPath: string;
  skillName: string;
  purpose: string;
  trigger: string;
  requiredToolsHint?: string[];
}

export const videoToSkillDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "videoToSkill",
    description:
      "Analiza un video LOCAL (ruta en disco, no URL/YouTube) para aprender un procedimiento y dejarlo en staging como propuesta de skill nueva -- NUNCA la activa. Genera evidencia (transcript + frames) y un SKILL_SPEC + SKILL.md que deben pasar por HumanReview (APPROVED/REJECTED/NEEDS_REVISION) antes de poder registrarse de verdad. Úsala solo cuando el usuario pida explícitamente aprender de un video, nunca de forma rutinaria.",
    parameters: {
      type: "object",
      properties: {
        videoPath: {
          type: "string",
          description: "Ruta local del archivo de video (mp4/mov/webm). No acepta URLs.",
        },
        skillName: {
          type: "string",
          description: "Nombre corto propuesto para la skill a aprender.",
        },
        purpose: {
          type: "string",
          description: "Para qué sirve la skill, en una frase.",
        },
        trigger: {
          type: "string",
          description: "Frase o situación que debería disparar esta skill.",
        },
        requiredToolsHint: {
          type: "array",
          items: { type: "string" },
          description: "Opcional: nombres de tools que probablemente necesite el procedimiento observado.",
        },
      },
      required: ["videoPath", "skillName", "purpose", "trigger"],
    },
  },
};

export const videoToSkillHandler: ToolHandler<VideoToSkillArgs> = async (args) => {
  const gate = requireAdmin(args.conversationId);
  if (!gate.ok) return { ok: true, denegado: true, message: gate.message };

  const rutaValida = validarVideoPath(args.videoPath);
  if (!rutaValida.ok) return { ok: false, message: rutaValida.message };

  // Import diferido para evitar el ciclo index.ts -> video-to-skill.ts -> index.ts:
  // en tiempo de ejecución (no de carga inicial) el módulo ya está inicializado.
  const toolsIndex = await import("./index");
  const knownToolNames = toolsIndex.toolDefinitions.map((d) => d.function.name);

  const result = await runVideoToSkillPipeline({
    videoPath: rutaValida.resolved,
    skillName: args.skillName,
    purpose: args.purpose,
    trigger: args.trigger,
    requiredToolsHint: args.requiredToolsHint,
    knownToolNames,
  });

  if (!("skillId" in result)) {
    return { ok: false, message: `No se pudo procesar el video (${result.reason}).` };
  }

  return {
    ok: true,
    skillId: result.skillId,
    stagingDir: result.stagingDir,
    filesCreated: result.filesCreated,
    validation: result.validation,
    diagnostics: result.diagnostics,
    message: `Skill '${args.skillName}' generada en staging (${result.skillId}). Queda pendiente de HumanReview -- no se activó ni se registró como tool real todavía.`,
  };
};
