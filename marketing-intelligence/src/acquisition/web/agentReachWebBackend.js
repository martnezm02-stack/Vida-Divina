// agentReachWebBackend.js — Punto de extensión para usar Agent Reach como
// backend de adquisición Web.
//
// NO SE USA EN ESTA FASE. Agent Reach NO está instalado en este proyecto.
// Existe únicamente para demostrar que WebAdapter puede cambiar de backend
// (WEB_BACKEND=agent_reach) sin tocar el contrato, RawStore, IntelligenceStore
// ni MarketingIntelligenceAgent — ver test/acquisitionArchitecture.test.js.
//
// Auditoría (Fase 4): el canal Web de Agent Reach usa el MISMO endpoint
// público de Jina Reader (https://r.jina.ai/) que JinaDirectBackend ya
// implementa aquí de forma directa — no aporta ninguna capacidad nueva hoy.
// La única ventaja real y documentada es de mantenimiento futuro: si Jina
// cambia su detección anti-bot o su endpoint, la comunidad de Agent Reach
// probablemente lo parchea más rápido que nosotros. Por eso este backend
// queda disponible como opción, NO como default, y NO instalado.
//
// Conectarlo de verdad requeriría:
//   1. Instalar el paquete `agent-reach` (pyproject.toml: Python >=3.10) —
//      REQUIERE AUTORIZACIÓN explícita, no se ha hecho.
//   2. Invocar su CLI/servidor MCP desde este backend (subprocess o MCP),
//      normalizando su salida al mismo shape { ok, blocked, httpStatus,
//      title, text } que ya usa JinaDirectBackend.
// Ninguna otra pieza del sistema cambiaría.

import { AcquisitionBackend } from '../acquisitionBackend.js';

export class AgentReachWebBackend extends AcquisitionBackend {
  get name() {
    return 'agent_reach_web_no_instalado';
  }

  async fetch() {
    throw new Error(
      'REQUIERE AUTORIZACIÓN: Agent Reach no está instalado en este proyecto. ' +
      'Este backend es un punto de extensión documentado, no una integración real. ' +
      'No se ha intentado ninguna instalación ni llamada de red desde este archivo.'
    );
  }
}
