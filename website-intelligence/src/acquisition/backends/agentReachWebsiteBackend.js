// agentReachWebsiteBackend.js — Punto de extensión para usar Agent Reach como
// backend de adquisición de sitios web (renderizado, screenshots, DOM,
// interacciones) — Fase 8, §17 del encargo.
//
// NO SE USA EN ESTA FASE. Agent Reach NO está instalado en este proyecto
// (mismo estado verificado en la Fase 4 para marketing-intelligence — no se
// ha vuelto a instalar desde entonces).
//
// Reconsideración específica para Website Intelligence (a diferencia de la
// Fase 4, donde su canal Web resultó ser el mismo endpoint público de Jina
// Reader sin capacidad añadida): Agent Reach documenta capacidades de
// browser automation (screenshots, DOM completo, interacciones) que
// httpDirectBackend.js NO tiene y que claude-in-chrome tampoco puede ofrecer
// ahora mismo (no conectado). Si en el futuro se audita su versión real de
// browser automation y se confirma que aporta valor genuino y verificable
// (no solo documentado en su README), sería un candidato razonable a backend
// FALLBACK detrás de esta misma interfaz — nunca como reemplazo de
// httpDirectBackend.js para los casos donde éste ya es suficiente.
//
// Activarlo de verdad requeriría (ninguno hecho aquí):
//   1. Auditar su capacidad real de browser automation con el mismo rigor
//      que la Fase 4 aplicó a su capacidad Web (leer código, no solo README)
//      — REQUIERE AUTORIZACIÓN, no se ha hecho en esta fase.
//   2. Instalar el paquete (Python >=3.10) — REQUIERE AUTORIZACIÓN explícita.
//   3. Normalizar su salida al mismo shape { ok, blocked, authRequired,
//      httpStatus, html, text, headers } que ya usan los demás backends.
// Ninguna otra pieza del sistema cambiaría.

import { AcquisitionBackend } from '../acquisitionBackend.js';

export class AgentReachWebsiteBackend extends AcquisitionBackend {
  get name() {
    return 'agent_reach_website_no_instalado';
  }

  get capabilities() {
    return Object.freeze({
      rendersJavaScript: true,
      capturesScreenshots: true,
      capturesInteractions: true,
      respectsViewport: true,
      supportsAuthentication: false,
    });
  }

  async fetch() {
    throw new Error(
      'REQUIERE AUTORIZACIÓN: Agent Reach no está instalado en este proyecto y su capacidad real de browser ' +
      'automation para sitios web no ha sido auditada en código (solo documentada por referencia). Este backend ' +
      'es un punto de extensión documentado, no una integración real. No se ha intentado ninguna instalación ni ' +
      'llamada de red desde este archivo.'
    );
  }
}
