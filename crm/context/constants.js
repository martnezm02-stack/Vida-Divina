// constants.js
// Constantes compartidas entre assemble.js/disassemble.js/contextProjection.js.
// Fase C.1 — ver docs/CRM_FASE_C1_CONTEXT_PROJECTION.md para la justificación
// completa de cada una.

// Único tipo de canal soportado hoy por el schema (CHECK en
// customer_channels, ver crm/migrations/0001_init_schema.sql) — Decisión
// C1 del propietario: no se introduce ningún otro canal en esta fase.
export const TIPO_CANAL_WHATSAPP = 'whatsapp';

// Campos del contexto plano que no tienen columna dedicada en el schema
// aprobado (Fase B) pero cambian siempre en el mismo momento que
// `contexto.estado` (verificado contra el código real de
// simulator/src/flujoVentaReal.js — ver docs/CRM_FASE_C1_CONTEXT_PROJECTION.md
// "Campos transportados en metadata"). Se guardan como snapshot completo en
// state_transitions.metadata (JSONB) en cada transición real, y se
// reconstruyen leyendo la metadata de la transición más reciente — nunca se
// crea una columna ni tabla nueva para ellos.
export const CARRIED_METADATA_KEYS = Object.freeze([
  'ultimaIntencion',
  'testimonioEnviado',
  'precioEnviado',
  'precioUtilizado',
  'ofertaEnviada',
  'cierreEnviado',
  'cierreUtilizado',
]);

// Valores permitidos por el CHECK de follow_ups.resultado (migración
// 0001_init_schema.sql) — duplicado aquí a propósito, en código, porque no
// hay forma de leer un CHECK constraint en tiempo de ejecución sin una
// consulta al catálogo; debe mantenerse en sincronía manual con el schema.
// resultadoRecuperacion puede valer también 'duda_no_autorizada' o
// 'senal_medica' en el código real de flujoVentaReal.js — esos dos NO están
// en el CHECK aprobado por Fase A/B; ver "Discrepancia encontrada" en la
// documentación de esta fase.
export const FOLLOWUP_RESULTADOS_PERMITIDOS = new Set([
  'sin_respuesta',
  'lo_voy_a_pensar',
  'intencion_compra',
  'duda_documentada',
]);

// Único tipo de follow_up que esta fase persiste — Decisión C.1 explícita
// del propietario: el grupo de postventa (día 3 / semana) permanece sin
// mapear porque no existe código real que lo ejecute todavía (ver Fase C.0
// §3 y §18: 11 de 33 campos del contexto nunca se asignan en código).
export const FOLLOWUP_TIPO_RECUPERACION = 'recuperacion_dia5';

// Forma por defecto de los campos que NUNCA tienen representación
// persistida en esta fase (ni columna, ni metadata) — se devuelven siempre
// igual que crearContextoConversacion() los define, sin ir a la base de
// datos. No confundir con campos que sí se persisten pero pueden ser null.
export const CAMPOS_SIN_PERSISTENCIA_HOY = Object.freeze({
  telefono: null,
  resultado: null,
  fechaEntrega: null,
  seguimientoDia3Enviado: false,
  resultadoSeguimientoDia3: null,
  fechaSiguienteSeguimiento: null,
  estadoFinalSeguimiento: null,
  fechaActivacionRecuperacion: null,
});
