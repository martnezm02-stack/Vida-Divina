// claudeInChromeStubBackend.js — Punto de extensión documentado para usar
// claude-in-chrome como backend de adquisición con renderizado real (Fase 8).
//
// VERIFICACIÓN REAL (no asumida): en este entorno se llamó a
// mcp__claude-in-chrome__tabs_context_mcp y respondió:
//   "Browser extension is not connected. Please ensure the Claude browser
//    extension is installed and running..."
// Es decir: el servidor MCP de claude-in-chrome SÍ está configurado (sus
// herramientas cargan esquema vía ToolSearch), pero NO hay una extensión de
// Chrome conectada respondiendo ahora. Por eso este backend es un STUB — no
// una integración real — y por eso NO es el backend por defecto de esta fase
// (ver httpDirectBackend.js).
//
// Si en el futuro se conecta un navegador real y se autoriza su uso, este
// backend permitiría (documentado, no implementado):
//   - rendersJavaScript: true — ve el DOM después de ejecutar JS.
//   - capturesScreenshots: true — vía el tool "computer" (captura de pantalla).
//   - capturesInteractions: true — vía "computer" (click/scroll) + "read_page"
//     antes/después, produciendo pares de estado para InteractionCapture.
//   - respectsViewport: true — vía "resize_window" antes de leer/capturar.
//   - supportsAuthentication: false, deliberadamente — este proyecto tiene
//     prohibido usar cookies/sesiones personales o cuentas reales de
//     terceros (X, Meta, etc.) para adquisición (ver §14 del informe). Un
//     AUTHENTICATION_REQUIRED detenido en seco, nunca una sesión inyectada.
//
// Activarlo de verdad requeriría (ninguno hecho aquí):
//   1. Que el usuario conecte la extensión de Chrome (acción fuera de este
//      código — no se puede "instalar" desde aquí).
//   2. Autorización explícita para usar los tools de claude-in-chrome como
//      motor de adquisición (hoy solo están autorizados para esta propia
//      tarea de verificación, no para producción).
//   3. Normalizar la salida de esos tools a { ok, blocked, authRequired,
//      httpStatus, html, text, headers } — mismo shape que ya usa
//      httpDirectBackend.js — sin que ninguna otra pieza del sistema cambie.

import { AcquisitionBackend } from '../acquisitionBackend.js';

export class ClaudeInChromeStubBackend extends AcquisitionBackend {
  get name() {
    return 'claude_in_chrome_no_conectado';
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
      'REQUIERE AUTORIZACIÓN: claude-in-chrome no tiene una extensión de Chrome conectada en este entorno ' +
      '(verificado con tabs_context_mcp — "Browser extension is not connected"), y su uso como backend de ' +
      'producción no ha sido autorizado. Este backend es un punto de extensión documentado, no una integración real.'
    );
  }
}
