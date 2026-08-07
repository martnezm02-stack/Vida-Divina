// validator.js
// Pipeline paso 7: validar consistencia.
// Responsabilidad única: inspeccionar el conjunto completo de entidades y
// relaciones ya construidas y reportar problemas. Nunca detiene la
// compilación ni lanza excepciones — solo produce una lista de
// ValidationIssue que se adjunta a las estadísticas y al manifiesto.

import { createValidationIssue } from './models.js';

/**
 * @param {import('./models.js').EntityRecord[]} entities
 * @param {import('./models.js').Relationship[]} relationships
 * @param {string[]} softReferenceIssues - de relationships.js, referencias no verificables
 * @returns {import('./models.js').ValidationIssue[]}
 */
export function validate(entities, relationships, softReferenceIssues) {
  const issues = [];

  issues.push(...checkArchivosDuplicados(entities));
  issues.push(...checkIdsRepetidos(entities));
  issues.push(...checkReferenciasInexistentes(entities));
  issues.push(...checkEntidadesHuerfanas(entities, relationships));
  issues.push(...checkDocumentosSinClasificar(entities));
  issues.push(...checkErroresDeEstructura(entities));
  issues.push(...checkInconsistencias(entities));

  for (const detalle of softReferenceIssues) {
    issues.push(
      createValidationIssue({
        tipo: 'relacion_no_verificable',
        severidad: 'advertencia',
        detalle,
      })
    );
  }

  return issues;
}

// ✔ archivos duplicados — mismo checksum en más de una entidad
function checkArchivosDuplicados(entities) {
  const byChecksum = new Map();
  for (const e of entities) {
    if (!e.checksum) continue;
    if (!byChecksum.has(e.checksum)) byChecksum.set(e.checksum, []);
    byChecksum.get(e.checksum).push(e.ruta_original);
  }
  const issues = [];
  for (const [checksum, rutas] of byChecksum) {
    if (rutas.length > 1) {
      issues.push(
        createValidationIssue({
          tipo: 'archivo_duplicado',
          severidad: 'advertencia',
          detalle: `Contenido idéntico (checksum ${checksum.slice(0, 12)}...) en: ${rutas.join(', ')}`,
        })
      );
    }
  }
  return issues;
}

// ✔ ids repetidos — no debería ocurrir por construcción (el id deriva de la
// ruta, que es única), pero se valida explícitamente como red de seguridad.
function checkIdsRepetidos(entities) {
  const byId = new Map();
  for (const e of entities) {
    if (!byId.has(e.id)) byId.set(e.id, []);
    byId.get(e.id).push(e.ruta_original);
  }
  const issues = [];
  for (const [id, rutas] of byId) {
    if (rutas.length > 1) {
      issues.push(
        createValidationIssue({
          tipo: 'id_duplicado',
          severidad: 'error',
          detalle: `El id "${id}" aparece en más de un archivo: ${rutas.join(', ')}`,
        })
      );
    }
  }
  return issues;
}

// ✔ referencias inexistentes / ✔ relaciones rotas — un enlace que no resuelve a un archivo real
function checkReferenciasInexistentes(entities) {
  const issues = [];
  for (const e of entities) {
    for (const ref of e.referencias) {
      if (!ref.exists) {
        issues.push(
          createValidationIssue({
            tipo: 'referencia_rota',
            severidad: 'error',
            detalle: `Enlace roto "${ref.targetRaw}"`,
            archivo: e.ruta_original,
          })
        );
      }
    }
  }
  return issues;
}

// ✔ entidades huérfanas — sin relaciones entrantes ni salientes
function checkEntidadesHuerfanas(entities, relationships) {
  const connected = new Set();
  for (const r of relationships) {
    connected.add(r.origen_id);
    connected.add(r.destino_id);
  }
  const issues = [];
  for (const e of entities) {
    if (!connected.has(e.id)) {
      issues.push(
        createValidationIssue({
          tipo: 'entidad_huerfana',
          severidad: 'advertencia',
          detalle: `Ninguna relación entrante ni saliente detectada para "${e.id}"`,
          archivo: e.ruta_original,
        })
      );
    }
  }
  return issues;
}

// ✔ documentos sin clasificar — cayeron al tipo genérico por defecto
function checkDocumentosSinClasificar(entities) {
  return entities
    .filter((e) => e.tipo_entidad === 'documento')
    .map((e) =>
      createValidationIssue({
        tipo: 'documento_sin_clasificar',
        severidad: 'advertencia',
        detalle: `No se pudo asignar un tipo de entidad específico — usando tipo genérico "documento"`,
        archivo: e.ruta_original,
      })
    );
}

// ✔ errores de estructura — ya detectados en extractor.js (sin H1, archivo vacío),
// aquí solo se consolidan hacia la lista de issues del validador.
function checkErroresDeEstructura(entities) {
  const issues = [];
  for (const e of entities) {
    for (const advertencia of e.advertencias) {
      if (advertencia.startsWith('errores_de_estructura')) {
        issues.push(
          createValidationIssue({
            tipo: 'errores_de_estructura',
            severidad: 'advertencia',
            detalle: advertencia,
            archivo: e.ruta_original,
          })
        );
      }
    }
  }
  return issues;
}

// ✔ inconsistencias — catch-all de MVP: por ahora, archivos con contenido vacío.
function checkInconsistencias(entities) {
  const issues = [];
  for (const e of entities) {
    for (const error of e.errores_detectados) {
      if (error.startsWith('archivo_vacio')) {
        issues.push(
          createValidationIssue({
            tipo: 'inconsistencia',
            severidad: 'error',
            detalle: error,
            archivo: e.ruta_original,
          })
        );
      }
    }
  }
  return issues;
}
