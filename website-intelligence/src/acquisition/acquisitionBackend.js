// acquisitionBackend.js — Interfaz abstracta para MOTORES DE ADQUISICIÓN DE
// SITIOS WEB (Fase 8).
//
// Misma regla arquitectónica que en marketing-intelligence (Fase 4): nuestro
// sistema posee la arquitectura. Cualquier herramienta externa (fetch directo,
// un navegador real vía claude-in-chrome, Playwright, Agent Reach) es UN
// BACKEND intercambiable detrás de esta interfaz — nunca el contrato
// (websiteRawRecord.js), nunca el almacenamiento (rawStore.js), nunca
// WebsitePatternObservation.
//
// Un backend NUNCA devuelve nuestro contrato normalizado directamente —
// devuelve su propio payload crudo (shape documentado abajo). La
// normalización a WebsiteRawRecord ocurre en
// createWebsiteRawRecordFromBackendResult() (ver websiteRawRecord.js), nunca
// en el backend mismo.
//
// Contrato de fetch(url, options):
//   - devuelve SIEMPRE un objeto con al menos:
//       { ok, blocked, authRequired, httpStatus, html, text, headers }
//   - nunca lanza para errores esperados de red/bloqueo/autenticación — se
//     reportan en el resultado (ok:false + el flag correspondiente); solo
//     lanza para errores de programación o de configuración (ej. backend no
//     instalado/no autorizado/no conectado en este entorno).
//   - "leer una página" (traer su HTML/texto) NO es lo mismo que "observar una
//     página" (extraer un WebsitePatternObservation con evidencia). Este
//     backend solo hace lo primero — la observación ocurre después, sobre el
//     WebsiteRawRecord ya persistido, nunca dentro del backend.
//
// capabilities: declara qué puede hacer REALMENTE este backend, para que un
// futuro Adapter (o las pruebas) puedan decidir qué dimensiones de
// WebsitePatternObservation son alcanzables sin adivinar por el nombre del
// backend. Por defecto, todo en false — un backend real debe declarar
// explícitamente lo que soporta.

export class AcquisitionBackend {
  get name() {
    throw new Error('AcquisitionBackend: la propiedad "name" debe implementarse en la subclase');
  }

  get capabilities() {
    return Object.freeze({
      rendersJavaScript: false, // false = solo ve el HTML servido por el servidor, no el DOM post-JS
      capturesScreenshots: false,
      capturesInteractions: false, // puede ejecutar una acción (click/scroll) y observar el estado resultante
      respectsViewport: false, // puede pedir el render en un viewport específico (desktop/tablet/mobile)
      supportsAuthentication: false, // NUNCA implica que este proyecto use sesiones reales — ver §14 del informe
    });
  }

  // eslint-disable-next-line no-unused-vars
  async fetch(url, options) {
    throw new Error('AcquisitionBackend.fetch() debe implementarse en la subclase');
  }
}
