// classifier.js
// Pipeline paso 3: clasificar entidades.
// Responsabilidad única: dado un documento descubierto, decidir su
// tipo_entidad. No lee el contenido del archivo (eso es extractor.js) —
// clasifica por convención de nombre/posición, que es toda la información
// disponible hoy porque los .md todavía no tienen metadato estructurado
// (esa es justamente la razón de ser de este compilador).

import {
  MODULE_DEFAULT_ENTITY_TYPE,
  DEFAULT_ENTITY_TYPE,
  FILENAME_ENTITY_OVERRIDES,
  INDEX_FILENAMES,
} from './config.js';

/**
 * @param {import('./models.js').DiscoveredDocument} doc
 * @returns {{tipoEntidad: string, capa: string|null, advertencias: string[]}}
 */
export function classifyEntity(doc) {
  const advertencias = [];
  const filenameLower = doc.filename.toLowerCase();

  // 1) Caso especial: índice de módulo que vive fuera de la carpeta del
  //    módulo (ver MODULE_ROOT_INDEX_FILE en config.js — hoy solo
  //    docs/productos.md). Tiene precedencia sobre cualquier otra regla.
  if (doc.esIndiceDeModuloExterno) {
    return { tipoEntidad: 'indice_modulo', capa: null, advertencias };
  }

  // 2) Archivos índice normales (README.md de módulo, index.md de
  //    categoría) — "esRaizDeModulo" aquí es un hecho de carpeta (¿vive
  //    directamente en la raíz del módulo, no en una subcarpeta?), NO un
  //    sinónimo de "es un índice". Solo se consulta cuando el nombre de
  //    archivo ya coincide con INDEX_FILENAMES, para desambiguar entre un
  //    README.md de módulo y un index.md de subcarpeta de categoría.
  if (INDEX_FILENAMES.has(filenameLower)) {
    const tipoEntidad = doc.esRaizDeModulo ? 'indice_modulo' : 'indice_categoria';
    return { tipoEntidad, capa: null, advertencias };
  }

  // 3) Anulación por nombre de archivo conocido (entidades declaradas
  //    explícitamente en docs/KNOWLEDGE_MODEL.md §3 dentro de módulos
  //    heterogéneos como proceso_de_venta/ y agente_ia/).
  if (FILENAME_ENTITY_OVERRIDES[filenameLower]) {
    const tipoEntidad = FILENAME_ENTITY_OVERRIDES[filenameLower];
    // "regla_decision" existe en dos capas distintas según el módulo — ver
    // docs/KNOWLEDGE_MODEL.md §3, nota sobre "Regla de Decisión".
    let capa = null;
    if (tipoEntidad === 'regla_decision') {
      if (doc.modulo === 'proceso_de_venta') capa = 'negocio';
      else if (doc.modulo === 'agente_ia') capa = 'cognitiva';
      else {
        capa = 'desconocida';
        advertencias.push(
          `regla_decision fuera de proceso_de_venta/agente_ia — capa no determinable, se asigna "desconocida"`
        );
      }
    }
    return { tipoEntidad, capa, advertencias };
  }

  // 4) Tipo por defecto del módulo.
  if (MODULE_DEFAULT_ENTITY_TYPE[doc.modulo]) {
    return { tipoEntidad: MODULE_DEFAULT_ENTITY_TYPE[doc.modulo], capa: null, advertencias };
  }

  // 5) Módulo no reconocido (por ejemplo, uno nuevo agregado en el futuro
  //    que todavía no tiene entrada en config.js). No se detiene la
  //    compilación — se clasifica genéricamente y se advierte.
  advertencias.push(
    `Módulo "${doc.modulo}" no tiene tipo de entidad configurado en config.js — usando tipo genérico "${DEFAULT_ENTITY_TYPE}"`
  );
  return { tipoEntidad: DEFAULT_ENTITY_TYPE, capa: null, advertencias };
}
