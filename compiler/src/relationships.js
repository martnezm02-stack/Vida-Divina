// relationships.js
// Pipeline paso 6: construir relaciones.
// Responsabilidad única: convertir referencias ya resueltas (paso 5) en
// relaciones del grafo — únicamente cuando el destino resuelve a una
// entidad realmente descubierta por el compilador. Nunca inventa una
// relación hacia algo que no se pudo verificar (ver docs/KNOWLEDGE_MODEL.md
// §4: "No debe inventar relaciones, únicamente registrar relaciones
// verificables").

import path from 'node:path';
import { createRelationship } from './models.js';
import { SECCION_A_TIPO_RELACION_PRODUCTO } from './config.js';

/**
 * Determina el tipo_relacion para un enlace Perfil -> Producto, según la
 * sección "## " de docs/clientes/*.md en la que aparece — ver
 * SECCION_A_TIPO_RELACION_PRODUCTO en config.js y
 * docs/RECOMMENDATION_ENGINE.md §6. Para cualquier otra combinación de
 * entidades (o si la sección no coincide con ninguna regla conocida) se
 * conserva el tipo genérico "referencia", exactamente el comportamiento
 * del Sprint 2 — esta función solo añade especificidad, nunca la quita.
 */
function resolverTipoRelacionProducto(seccion, yaVistoPrimario) {
  if (!seccion) return null;
  for (const regla of SECCION_A_TIPO_RELACION_PRODUCTO) {
    if (regla.patron.test(seccion)) {
      if (regla.soloPrimero) {
        return yaVistoPrimario ? regla.tipoRelacionResto : regla.tipoRelacion;
      }
      return regla.tipoRelacion;
    }
  }
  return null;
}

/**
 * @param {Array<{entity: import('./models.js').EntityRecord, absolutePath: string, references: Array}>} compiledDocs
 * @returns {{relationships: import('./models.js').Relationship[], softIssues: string[]}}
 */
export function buildRelationships(compiledDocs) {
  const pathToId = new Map();
  const entityById = new Map();
  const parentDirToIndexId = new Map();

  for (const { entity, absolutePath } of compiledDocs) {
    pathToId.set(normalize(absolutePath), entity.id);
    entityById.set(entity.id, entity);
    if (entity.tipo_entidad === 'indice_categoria' || entity.tipo_entidad === 'indice_modulo') {
      parentDirToIndexId.set(normalize(path.dirname(absolutePath)), entity.id);
    }
  }

  const relationships = [];
  const softIssues = []; // referencias a archivos reales que no son entidades rastreadas (no es error, no se inventa relación)

  for (const { entity, absolutePath, references } of compiledDocs) {
    // 1) Relaciones por referencia explícita (enlaces Markdown ya resueltos)
    let primarioYaAsignado = false; // por entidad — reinicia en cada perfil
    for (const ref of references) {
      if (!ref.exists) continue; // las rotas se reportan en validator.js, no generan relación
      const targetId = pathToId.get(normalize(ref.resolvedPath));
      if (!targetId) {
        softIssues.push(
          `${entity.ruta_original} referencia "${ref.targetRaw}", que existe en disco pero no es una entidad rastreada por el compilador (posiblemente fuera de docs/ o un archivo no-.md)`
        );
        continue;
      }
      if (targetId === entity.id) continue; // enlace a sí mismo (ej. "volver al índice" en la misma página), no es una relación útil

      let tipoRelacion = 'referencia';
      const destino = entityById.get(targetId);
      if (entity.tipo_entidad === 'perfil' && destino?.tipo_entidad === 'producto') {
        const tipoResuelto = resolverTipoRelacionProducto(ref.seccion, primarioYaAsignado);
        if (tipoResuelto) {
          tipoRelacion = tipoResuelto;
          if (tipoResuelto === 'recomienda_primario') primarioYaAsignado = true;
        }
      }

      relationships.push(
        createRelationship({
          origenId: entity.id,
          destinoId: targetId,
          tipoRelacion,
          archivoOrigen: entity.ruta_original,
        })
      );
    }

    // 2) Relación estructural: todo documento que vive dentro de una carpeta
    //    con índice de categoría le pertenece — inferido de la estructura de
    //    carpetas, no del texto, así que no depende de que el autor humano
    //    haya escrito el enlace.
    const parentIndexId = parentDirToIndexId.get(normalize(path.dirname(absolutePath)));
    if (parentIndexId && parentIndexId !== entity.id) {
      relationships.push(
        createRelationship({
          origenId: entity.id,
          destinoId: parentIndexId,
          tipoRelacion: 'pertenece_a_categoria',
          archivoOrigen: entity.ruta_original,
        })
      );
    }
  }

  return { relationships, softIssues };
}

function normalize(absolutePath) {
  // Windows no distingue mayúsculas/minúsculas en rutas de archivo — se
  // normaliza para que la comparación de referencias no falle por eso.
  return path.normalize(absolutePath).toLowerCase();
}
