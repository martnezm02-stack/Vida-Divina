import OpenAI from "openai";
import { buildSystemPrompt } from "./system-prompt";
import { toolDefinitions, executeTool } from "./tools";
import { insertUsage, insertUsageCall, getSetting } from "./db";
import { isAdminPhone } from "./vidaDivina/identity";
import type { Message } from "./db";

const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

// Optimización de contexto (FASE 1, 2026-09-11, baseline real medido):
// las 10 tools "admin*" (Gmail, reportes, estado del sistema) son
// exactamente las mismas que executeTool() YA rechaza para un CLIENT real
// (defensa en profundidad, ver tools/index.ts -- "8) CLIENTE real: ...
// -> DENEGADO" ya probado). Nunca ofrecerlas al modelo en una conversación
// de CLIENT no cambia ningún comportamiento real (ya no podía usarlas), y
// ahorra ~1,488 tokens reales por llamada (medido: 11,864 -> 10,376
// prompt_tokens con las mismas 12 tools de cliente, mismo system prompt).
// Un ADMIN real sigue recibiendo las 22 tools completas, sin cambios.
const ADMIN_ONLY_TOOL_NAMES = new Set([
  "adminEstadoSistema",
  "adminGenerarAudioAsset",
  "adminGenerarReporte",
  "adminBuscarCorreos",
  "adminLeerCorreo",
  "adminResumirCorreos",
  "adminCrearBorradorCorreo",
  "adminActualizarBorradorCorreo",
  "adminMoverCorreoAPapelera",
  "adminEnviarBorradorAprobado",
]);
const CLIENT_TOOL_DEFINITIONS = toolDefinitions.filter((t) => !ADMIN_ONLY_TOOL_NAMES.has(t.function.name));

/**
 * `phone` ausente (otro llamador que no lo pase, o teléfono aún no
 * resuelto) -> por seguridad se devuelven las 22 tools completas, igual
 * que el comportamiento de siempre -- solo se recortan cuando se CONFIRMA
 * de forma real que el teléfono NO es el admin.
 */
function toolsForPhone(phone: string | null | undefined): typeof toolDefinitions {
  if (phone && !isAdminPhone(phone)) return CLIENT_TOOL_DEFINITIONS;
  return toolDefinitions;
}

// Precios por millón de tokens (input, output) para estimar el coste --
// SOLO se usan como respaldo si OpenRouter no devuelve "usage.cost" real
// (ver resolveCallCost). "openai/gpt-4o-mini-2024-07-18" (slug fechado,
// hallazgo real 2026-09-11: el modelo activo hoy) usa la MISMA tarifa
// pública que "openai/gpt-4o-mini" -- antes faltaba como key exacta y
// costOf() caía silenciosamente a [0,0], registrando $0 reales en "usage".
const PRICING: Record<string, [number, number]> = {
  "anthropic/claude-haiku-4.5": [1, 5],
  "anthropic/claude-haiku-4-5": [1, 5],
  "openai/gpt-4o-mini": [0.15, 0.6],
  "openai/gpt-4o-mini-2024-07-18": [0.15, 0.6],
  "openai/gpt-5-mini": [0.25, 2],
  "google/gemini-2.5-flash": [0.3, 2.5],
};

function costOf(model: string, inTok: number, outTok: number): number {
  const [pin, pout] = PRICING[model] ?? [0, 0];
  return (inTok / 1e6) * pin + (outTok / 1e6) * pout;
}

/**
 * Forma real del campo "usage" que devuelve OpenRouter cuando se pide
 * `usage: { include: true }` -- extensión propia de OpenRouter, no tipada
 * por el SDK de openai (openai/openai-node), de ahí el cast local. Ver
 * https://openrouter.ai/docs -- confirmado con una llamada real 2026-09-11.
 */
interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface CallCostResult {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
  costSource: "openrouter" | "estimated";
}

/**
 * Prioridad real pedida: A) usar completion.usage.cost real de OpenRouter;
 * B) si no viene (modelo/proveedor que no lo soporta), calcular con la
 * tabla local de tarifas -- nunca al revés.
 */
function resolveCallCost(model: string, usage: OpenRouterUsage | undefined): CallCostResult {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  if (typeof usage?.cost === "number") {
    return { promptTokens, completionTokens, totalTokens, cachedTokens, costUsd: usage.cost, costSource: "openrouter" };
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    costUsd: costOf(model, promptTokens, completionTokens),
    costSource: "estimated",
  };
}

/**
 * Registra UNA llamada real al LLM en "usage_calls" (auditoría de costo,
 * 2026-09-11) -- best-effort, nunca debe romper la respuesta al lead.
 */
function trackCall(args: {
  conversationId: number | null;
  messageId: number | null;
  callIndex: number;
  model: string;
  usage: OpenRouterUsage | undefined;
  toolName?: string | null;
  durationMs: number;
}): CallCostResult {
  const resolved = resolveCallCost(args.model, args.usage);
  try {
    insertUsageCall({
      conversationId: args.conversationId,
      messageId: args.messageId,
      callIndex: args.callIndex,
      model: args.model,
      promptTokens: resolved.promptTokens,
      completionTokens: resolved.completionTokens,
      totalTokens: resolved.totalTokens,
      cachedTokens: resolved.cachedTokens,
      costUsd: resolved.costUsd,
      costSource: resolved.costSource,
      toolName: args.toolName ?? null,
      durationMs: args.durationMs,
    });
  } catch {
    // el registro detallado nunca debe romper la respuesta real al lead
  }
  return resolved;
}

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "") {
    throw new Error(
      "OPENROUTER_API_KEY no configurada. Ejecuta /setup en Claude Code o edita .env.local manualmente."
    );
  }
  _client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    // Una petición colgada no debe bloquear la respuesta minutos: 60s y 2
    // reintentos. Si aun así falla, el handler manda el aviso suave.
    timeout: 60_000,
    maxRetries: 2,
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/whatsapp-ai-agent-kit",
      "X-Title": "WhatsApp AI Agent Kit",
    },
  });
  return _client;
}

interface GenerateReplyInput {
  history: Message[];
  conversationId: number;
  // Memoria de largo plazo de esta persona (Supabase). Vacío si es contacto
  // nuevo o si la memoria no está configurada.
  memoryContext?: string;
  // id real del mensaje del lead que disparó este turno (ver handler.ts,
  // "ultimoMensajeUsuario") -- opcional para no romper otros llamadores;
  // solo se usa para poblar usage_calls.message_id (auditoría de costo).
  turnMessageId?: number | null;
  // teléfono real del remitente (ver handler.ts, canonicalPhone) --
  // opcional; solo se usa para decidir qué tools ofrecer (ver
  // toolsForPhone). Sin él, se ofrecen las 22 tools completas (default
  // seguro, igual que el comportamiento de siempre).
  phone?: string | null;
}

// "usage: { include: true }" es una extensión real de OpenRouter (no
// tipada por el SDK de openai) que pide que la respuesta incluya el costo
// real y el detalle de tokens cacheados -- confirmado con una llamada real
// 2026-09-11. Solo se declara como tipo local; el SDK acepta la propiedad
// igual (estructural, no es un literal fresco en el call site).
type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  usage?: { include: boolean };
};

/**
 * Llama al LLM con el system prompt + el historial reciente.
 * Si el modelo decide ejecutar tools, las ejecuta y vuelve a llamar al LLM con los resultados.
 * Limite de 5 turnos para evitar loops infinitos.
 */
export async function generateReply(input: GenerateReplyInput): Promise<string> {
  const client = getClient();
  const systemPrompt = buildSystemPrompt(input.memoryContext);

  // Mapeo de roles: 'human' (mensajes del dashboard) → 'assistant' para el LLM
  // El LLM los ve como sus propias respuestas previas
  // baseMessages = system + conversación, SIN tool calls. messagesForLLM crece con
  // las tool calls y sus resultados; baseMessages se mantiene limpio para el
  // reintento de emergencia (forzar una respuesta normal sin herramientas).
  const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...input.history.map((m): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
      const role: "user" | "assistant" = m.role === "user" ? "user" : "assistant";
      return { role, content: m.content };
    }),
  ];
  const messagesForLLM: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...baseMessages];

  // Modelo y temperatura son editables en caliente desde el dashboard
  // (tabla settings); si no hay valor, caen al de la variable de entorno.
  const model = getSetting("model") || MODEL;
  const tempRaw = parseFloat(getSetting("temperature") || "");
  const temperature = Number.isFinite(tempRaw) ? Math.min(Math.max(tempRaw, 0), 1.5) : 0.4;
  // Mismo conjunto de tools en TODOS los turnos de esta llamada (estable
  // para el caché de prompt) -- se decide una sola vez por teléfono real.
  const toolsThisConversation = toolsForPhone(input.phone);

  const MAX_TURNS = 5;
  let turns = 0;
  let inTok = 0;
  let outTok = 0;
  // Costo real acumulado del turno completo (suma de TODAS las llamadas
  // LLM reales, incluida la de "decide tool" y la de "responde con el
  // resultado") -- prioriza usage.cost real de OpenRouter, cae a la tabla
  // local de tarifas solo si OpenRouter no lo devuelve (ver resolveCallCost).
  let turnCostAccum = 0;
  let callIndex = 0;
  let executedTool = false; // ¿se ejecutó alguna herramienta en este turno?
  // ÚLTIMO texto no vacío que escribió el modelo, venga solo o ACOMPAÑANDO a una
  // tool call. El prompt le pide saludar/responder en el MISMO turno en que llama
  // a guardarLead; ese texto ES la respuesta al lead y hay que devolverlo. El bug
  // era este: el modelo saludaba + llamaba la tool en el turno 1, el código tiraba
  // ese texto y esperaba uno nuevo en el turno 2, que venía vacío → aviso de emergencia.
  let textoEmitido = "";

  // Registra el consumo acumulado del turno (para el panel de métricas
  // agregadas ya existente) -- el detalle real por llamada vive en
  // usage_calls (trackCall), esto solo mantiene "usage" con el total real.
  const recordUsage = () => {
    if (inTok > 0 || outTok > 0) {
      try {
        insertUsage(input.conversationId, model, inTok, outTok, turnCostAccum);
      } catch {
        // el registro de métricas nunca debe romper la respuesta
      }
    }
  };

  // Reintento de emergencia: fuerza una respuesta normal (SIN herramientas) usando
  // solo la conversación limpia. Se usa cuando el modelo ejecutó tools pero no
  // escribió NADA de texto en ningún turno, para que el lead nunca quede sin respuesta.
  const respuestaLimpia = async (): Promise<string> => {
    try {
      callIndex++;
      const callStart = Date.now();
      const requestParams: ChatParams = { model, messages: baseMessages, temperature, usage: { include: true } };
      const limpio = await client.chat.completions.create(requestParams);
      const resolved = trackCall({
        conversationId: input.conversationId,
        messageId: input.turnMessageId ?? null,
        callIndex,
        model,
        usage: limpio.usage as OpenRouterUsage | undefined,
        toolName: null,
        durationMs: Date.now() - callStart,
      });
      inTok += resolved.promptTokens;
      outTok += resolved.completionTokens;
      turnCostAccum += resolved.costUsd;
      return limpio.choices?.[0]?.message?.content?.trim() ?? "";
    } catch {
      return "";
    }
  };

  while (turns < MAX_TURNS) {
    turns++;
    callIndex++;

    const callStart = Date.now();
    const requestParams: ChatParams = {
      model,
      messages: messagesForLLM,
      tools: toolsThisConversation,
      tool_choice: "auto",
      temperature,
      usage: { include: true },
    };
    const completion = await client.chat.completions.create(requestParams);
    const durationMs = Date.now() - callStart;

    const toolNamesThisCall =
      completion.choices?.[0]?.message?.tool_calls
        ?.map((tc) => (tc.type === "function" ? tc.function.name : null))
        .filter((n): n is string => Boolean(n))
        .join(",") || null;

    const resolved = trackCall({
      conversationId: input.conversationId,
      messageId: input.turnMessageId ?? null,
      callIndex,
      model,
      usage: completion.usage as OpenRouterUsage | undefined,
      toolName: toolNamesThisCall,
      durationMs,
    });
    inTok += resolved.promptTokens;
    outTok += resolved.completionTokens;
    turnCostAccum += resolved.costUsd;

    // OpenRouter a veces responde 200 con un cuerpo de error y sin choices.
    if (!completion.choices || completion.choices.length === 0) {
      const rescate = textoEmitido.trim() || (executedTool ? await respuestaLimpia() : "");
      recordUsage();
      return rescate;
    }

    const msg = completion.choices[0].message;

    // Captura SIEMPRE el texto que escriba el modelo, acompañe o no a una tool call.
    if (msg.content && msg.content.trim() !== "") textoEmitido = msg.content.trim();

    // Turno final: el modelo no pide ejecutar (más) herramientas.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // Si el modelo ya dijo algo (ahora, o junto a una tool de un turno previo),
      // esa es la respuesta. Si NO dijo nada pese a usar tools, reintento limpio.
      const salida = textoEmitido.trim() || (executedTool ? await respuestaLimpia() : "");
      recordUsage();
      return salida;
    }

    // Hay tool calls: ejecutarlas y meter los resultados en la conversación.
    messagesForLLM.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: msg.tool_calls,
    });

    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const name = call.function.name;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.function.arguments);
      } catch {
        parsed = {};
      }

      const result = await executeTool(name, parsed, {
        conversationId: input.conversationId,
      });

      // Log de diagnóstico: qué tool llamó el modelo y con qué resultado.
      // Aparece en los logs del servidor para ver si guardarLead/Airtable falla.
      console.log(
        `[tool] ${name} → ok=${(result as { ok?: boolean }).ok} · ${
          (result as { message?: string }).message ?? ""
        }`
      );

      messagesForLLM.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
    executedTool = true;
  }

  // Límite de turnos: si el modelo escribió algo por el camino, úsalo; si no, neutro.
  recordUsage();
  return textoEmitido.trim() || "Déjame un momento — vuelvo contigo enseguida.";
}

/**
 * Llamada simple de texto (sin tools) al LLM. La usa el watchdog para auditar
 * conversaciones. No registra uso en métricas de venta (es coste interno).
 */
export async function completeText(
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const client = getClient();
  const model = opts?.model || getSetting("model") || MODEL;
  const callStart = Date.now();
  const requestParams: ChatParams = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: opts?.temperature ?? 0.3,
    max_tokens: opts?.maxTokens ?? 900,
    usage: { include: true },
  };
  const completion = await client.chat.completions.create(requestParams);
  // Sigue sin contar para "usage" (métricas de venta, ver comentario arriba)
  // -- solo se registra en usage_calls para la auditoría de costo real
  // TOTAL (incluye el coste interno del watchdog, no solo el comercial).
  trackCall({
    conversationId: null,
    messageId: null,
    callIndex: 1,
    model,
    usage: completion.usage as OpenRouterUsage | undefined,
    toolName: null,
    durationMs: Date.now() - callStart,
  });
  return completion.choices?.[0]?.message?.content ?? "";
}

/**
 * Validador para /setup: hace una llamada mínima para comprobar que la API key funciona.
 * Devuelve true si la key es válida, false si no.
 */
export async function validateApiKey(): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getClient();
    await client.models.list();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
