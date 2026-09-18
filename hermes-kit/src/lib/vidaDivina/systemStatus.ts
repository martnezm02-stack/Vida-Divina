// systemStatus.ts — Estado real de las integraciones de Vida Divina, en un
// solo lugar (antes vivía solo dentro de app/api/vida-divina-status/route.ts
// -- extraído aquí para que la tool administrativa `adminEstadoSistema`
// reutilice EXACTAMENTE la misma comprobación, nunca una segunda). Lectura
// pura: nunca escribe ni envía nada.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { crmConfigured } from "./crmClient";
import { isVoiceEngineReachable } from "./voiceEngineClient";
import { REPO_ROOT } from "./productKnowledge";
import { getConnectionState } from "../db";

export interface VidaDivinaSystemStatus {
  knowledgePackage: { available: boolean };
  commercialMedia: { available: boolean; count: number };
  crm: { configured: boolean };
  voiceEngine: { reachable: boolean };
  // Integraciones externas reales (FASE "Rediseño Dashboard Hermes Ventas",
  // 2026-09-18) -- mismo criterio de solo-lectura que el resto de este
  // archivo, nunca un segundo chequeo paralelo del ya validado en
  // email-mcp-server/ (gmailConfigured/calendarConfigured, mismo refresh
  // token real para ambos).
  whatsapp: { status: string; phone: string | null };
  gmail: { configured: boolean };
  calendar: { configured: boolean };
}

// Import dinámico de email-mcp-server/ (paquete hermano, sin workspaces npm
// compartidos, mismo patrón real ya usado por emailMcpClient.ts/reportGenerator.ts
// para crm/) -- /* webpackIgnore: true */ es OBLIGATORIO aquí: esta función
// la llama una ruta de Next.js bundleada por Turbopack, y sin el comentario
// mágico el bundler intenta resolver la ruta calculada en runtime en tiempo
// de build y falla ("Cannot find module as expression is too dynamic"),
// mismo hallazgo real ya documentado en alertas.ts (2026-09-12).
async function googleIntegrationsConfigured(): Promise<{ gmail: boolean; calendar: boolean }> {
  try {
    // BUG REAL corregido (2026-09-18): gmailConfigured()/calendarConfigured()
    // leen GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI/REFRESH_TOKEN de process.env,
    // pero esas variables SOLO viven en email-mcp-server/.env y normalmente
    // solo se cargan dentro del proceso HIJO real que spawnea
    // emailMcpClient.ts (server.js -> process.loadEnvFile) -- nunca en el
    // proceso del Dashboard. Sin esto, ambas siempre resolvían false aquí,
    // aunque Gmail/Calendar estuvieran realmente autorizados y funcionando
    // (validado end-to-end por separado). Mismo mecanismo real que ya usa
    // email-mcp-server/src/server.js -- nunca sobreescribe una variable ya
    // presente, así que es seguro llamarlo aquí sin condición.
    const envPath = path.join(REPO_ROOT, "email-mcp-server", ".env");
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

    const gmailClientUrl = pathToFileURL(path.join(REPO_ROOT, "email-mcp-server", "src", "gmailClient.js")).href;
    const calendarClientUrl = pathToFileURL(path.join(REPO_ROOT, "email-mcp-server", "src", "calendarClient.js")).href;
    const [gmailMod, calendarMod]: [any, any] = await Promise.all([
      import(/* webpackIgnore: true */ gmailClientUrl),
      import(/* webpackIgnore: true */ calendarClientUrl),
    ]);
    return { gmail: gmailMod.gmailConfigured(), calendar: calendarMod.calendarConfigured() };
  } catch {
    return { gmail: false, calendar: false };
  }
}

export async function getVidaDivinaSystemStatus(): Promise<VidaDivinaSystemStatus> {
  const manifestPath = path.join(REPO_ROOT, "knowledge", "compiled", "manifest.json");
  const registryDir = path.join(REPO_ROOT, "commercial-media", "data", "registry");

  let voiceEngineReachable = false;
  try {
    voiceEngineReachable = await isVoiceEngineReachable();
  } catch {
    voiceEngineReachable = false;
  }

  let commercialMediaCount = 0;
  try {
    commercialMediaCount = fs.readdirSync(registryDir).filter((f) => f.endsWith(".json")).length;
  } catch {
    commercialMediaCount = 0;
  }

  const conexion = getConnectionState();
  const google = await googleIntegrationsConfigured();

  return {
    knowledgePackage: { available: fs.existsSync(manifestPath) },
    commercialMedia: { available: commercialMediaCount > 0, count: commercialMediaCount },
    crm: { configured: crmConfigured() },
    voiceEngine: { reachable: voiceEngineReachable },
    whatsapp: { status: conexion.status, phone: conexion.phone },
    gmail: { configured: google.gmail },
    calendar: { configured: google.calendar },
  };
}
