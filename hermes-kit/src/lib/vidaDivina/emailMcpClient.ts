// emailMcpClient.ts — Cliente MCP real hacia email-mcp-server/ (FASE
// "Attribution + Reporting + Email MCP + Alerta WhatsApp" y "Hermes ADMIN +
// Gmail MCP completo", 2026-09-04).
//
// NO es el MCP de una sesión interactiva de Claude Code -- este cliente
// vive en el RUNTIME de Hermes (el proceso bot de hermes-kit) y arranca su
// PROPIO servidor MCP real (email-mcp-server/, sibling package) como
// proceso hijo vía stdio, bajo demanda (solo cuando hace falta -- no queda
// un proceso corriendo permanentemente en segundo plano).
//
// NUNCA imprime credenciales: la configuración real (SMTP y OAuth de
// Gmail) vive en email-mcp-server/.env (gitignored), este cliente solo
// spawnea el proceso y le pasa argumentos de tool-call, nunca ve ni
// transmite tokens/contraseñas reales.

import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { REPO_ROOT } from "./productKnowledge";

const SERVER_ENTRY = path.join(REPO_ROOT, "email-mcp-server", "src", "server.js");

export interface McpToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

/**
 * Llama a CUALQUIER tool real del servidor MCP de correo -- conexión nueva
 * por llamada (uso administrativo puntual, no alto volumen). Si el
 * resultado es JSON real (todas las tools de Gmail lo devuelven así, ver
 * gmailService.js), se parsea a `data`; si no, se deja como texto plano
 * (send_email).
 */
export async function callEmailMcpTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
  const transport = new StdioClientTransport({ command: "node", args: [SERVER_ENTRY] });
  const client = new Client({ name: "hermes-kit", version: "1.0.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    const result: any = await client.callTool({ name, arguments: args });
    const texto = result.content?.[0]?.text ?? "";
    if (result.isError) return { ok: false, message: texto || "email-mcp-server devolvió un error real sin detalle." };
    let data: unknown;
    try {
      data = JSON.parse(texto);
    } catch {
      data = undefined;
    }
    return { ok: true, message: texto, data };
  } catch (err) {
    return { ok: false, message: `No se pudo conectar con el servidor MCP de correo real: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await client.close().catch(() => {});
  }
}

export interface SendEmailInput {
  to?: string; // si se omite, el servidor real usa ADMIN_EMAIL
  subject: string;
  text: string;
}

/** send_email (SMTP legado) -- se conserva para el flujo existente de reporting; el flujo nuevo de Gmail usa createDraft/sendApprovedEmail (ver gmail.ts). */
export async function sendEmailViaMcp(input: SendEmailInput): Promise<{ ok: boolean; message: string }> {
  const res = await callEmailMcpTool("send_email", { to: input.to, subject: input.subject, text: input.text });
  return { ok: res.ok, message: res.message };
}
