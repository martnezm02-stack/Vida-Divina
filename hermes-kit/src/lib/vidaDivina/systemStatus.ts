// systemStatus.ts — Estado real de las integraciones de Vida Divina, en un
// solo lugar (antes vivía solo dentro de app/api/vida-divina-status/route.ts
// -- extraído aquí para que la tool administrativa `adminEstadoSistema`
// reutilice EXACTAMENTE la misma comprobación, nunca una segunda). Lectura
// pura: nunca escribe ni envía nada.

import fs from "node:fs";
import path from "node:path";
import { crmConfigured } from "./crmClient";
import { isVoiceEngineReachable } from "./voiceEngineClient";
import { REPO_ROOT } from "./productKnowledge";

export interface VidaDivinaSystemStatus {
  knowledgePackage: { available: boolean };
  commercialMedia: { available: boolean; count: number };
  crm: { configured: boolean };
  voiceEngine: { reachable: boolean };
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

  return {
    knowledgePackage: { available: fs.existsSync(manifestPath) },
    commercialMedia: { available: commercialMediaCount > 0, count: commercialMediaCount },
    crm: { configured: crmConfigured() },
    voiceEngine: { reachable: voiceEngineReachable },
  };
}
