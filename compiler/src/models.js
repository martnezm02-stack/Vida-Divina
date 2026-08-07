// models.js
// Formas de datos compartidas entre etapas del pipeline. Sin lógica, solo
// fábricas de objetos planos — facilita testear cada etapa con fixtures simples.

/**
 * @typedef {Object} DiscoveredDocument
 * @property {string} absolutePath
 * @property {string} rutaOriginal   - ruta relativa a la raíz del repo, estilo POSIX (docs/...)
 * @property {string} modulo         - nombre de la carpeta de módulo (ej. "productos")
 * @property {string} filename
 */

/**
 * @typedef {Object} EntityRecord
 * @property {string} id
 * @property {string} tipo_entidad
 * @property {string} titulo
 * @property {string} ruta_original
 * @property {string} fecha_compilacion
 * @property {string} version
 * @property {string} estado             - "compilado" | "compilado_con_advertencias" | "error"
 * @property {string[]} palabras_clave
 * @property {Array<Object>} relaciones_detectadas
 * @property {Array<Object>} referencias
 * @property {string} checksum
 * @property {string[]} errores_detectados
 * @property {string[]} advertencias
 * @property {string} modulo
 * @property {Object} [capa]            - solo presente cuando tipo_entidad === "regla_decision"
 */

export function createEntityRecord(fields) {
  return {
    id: fields.id,
    tipo_entidad: fields.tipoEntidad,
    titulo: fields.titulo,
    ruta_original: fields.rutaOriginal,
    fecha_compilacion: fields.fechaCompilacion,
    version: fields.version,
    estado: fields.estado,
    palabras_clave: fields.palabrasClave ?? [],
    relaciones_detectadas: [], // se completa en la etapa de relaciones (pipeline paso 6)
    referencias: fields.referencias ?? [],
    checksum: fields.checksum,
    errores_detectados: fields.erroresDetectados ?? [],
    advertencias: fields.advertencias ?? [],
    modulo: fields.modulo,
    ...(fields.capa ? { capa: fields.capa } : {}),
  };
}

/**
 * @typedef {Object} Relationship
 * @property {string} origen_id
 * @property {string} destino_id
 * @property {string} tipo_relacion   - "referencia" | "pertenece_a_categoria"
 * @property {string} archivo_origen
 * @property {boolean} verificada     - siempre true: solo se registran relaciones verificables
 */

export function createRelationship({ origenId, destinoId, tipoRelacion, archivoOrigen }) {
  return {
    origen_id: origenId,
    destino_id: destinoId,
    tipo_relacion: tipoRelacion,
    archivo_origen: archivoOrigen,
    verificada: true,
  };
}

/**
 * @typedef {Object} ValidationIssue
 * @property {string} tipo
 * @property {string} severidad   - "error" | "advertencia"
 * @property {string} detalle
 * @property {string} [archivo]
 */

export function createValidationIssue({ tipo, severidad, detalle, archivo }) {
  return { tipo, severidad, detalle, ...(archivo ? { archivo } : {}) };
}
