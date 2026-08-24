// acquisitionBackend.js — Interfaz abstracta para MOTORES DE ADQUISICIÓN.
//
// Regla arquitectónica de la Fase 4: nuestro sistema posee la arquitectura.
// Cualquier herramienta externa (Jina directo, Agent Reach, yt-dlp, una API
// oficial) es UN BACKEND intercambiable detrás de esta interfaz — nunca el
// contrato, nunca el almacenamiento, nunca el cerebro de análisis.
//
// Un backend NUNCA devuelve nuestro contrato normalizado (src/contract.js)
// directamente — devuelve su propio payload crudo. La normalización a
// createRecord() ocurre siempre en el Adapter (ej. webAdapter.js), nunca en
// el backend. Así, si el payload de un backend cambia de forma, solo el
// Adapter se ajusta — RawStore, IntelligenceStore, MarketingIntelligenceAgent
// y los exportadores no se enteran.
//
// Contrato de fetch(query, options):
//   - devuelve un objeto con AL MENOS { ok: boolean } y los campos que ese
//     dominio necesite (ej. Web: { ok, blocked, httpStatus, title, text }).
//   - nunca lanza para errores esperados de red/bloqueo — los reporta en el
//     resultado; solo lanza para errores de programación o de configuración
//     (ej. backend no instalado/no autorizado).

export class AcquisitionBackend {
  get name() {
    throw new Error('AcquisitionBackend: la propiedad "name" debe implementarse en la subclase');
  }

  // eslint-disable-next-line no-unused-vars
  async fetch(query, options) {
    throw new Error('AcquisitionBackend.fetch() debe implementarse en la subclase');
  }
}
