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
 * @param {Array<{entity: import('./models.js').EntityRecord, absolutePath: string, references: Array, anchorSlug: string|null, parentContainerId: string|null}>} compiledDocs
 * @returns {{relationships: import('./models.js').Relationship[], softIssues: string[]}}
 */
export function buildRelationships(compiledDocs) {
  const pathToId = new Map();
  // Un archivo de categoría de archivo único (ver anchorEntities.js) tiene
  // varias entidades que comparten el mismo absolutePath — pathToId solo
  // puede apuntar a UNA de ellas (la contenedora, ver más abajo), así que
  // los enlaces hacia un producto específico dentro de ese archivo
  // (ej. "09-proteinas-batidos.md#vida-fuel") se resuelven aparte, por
  // ruta+ancla, contra este segundo mapa.
  const pathAnchorToId = new Map();
  const entityById = new Map();

  // Directorio -> id(s) de índice que viven directamente en él. Antes de
  // esta extensión, un directorio tenía como máximo un índice (el index.md
  // de su propia subcarpeta de categoría), así que "el índice de este
  // directorio" era siempre inequívoco. Ya no: un archivo de categoría de
  // archivo único (ver anchorEntities.js) es también un "indice_categoria",
  // pero varios de ellos comparten el mismo directorio (docs/productos/,
  // junto con las carpetas de otras categorías) — ahí "el índice de la
  // carpeta" dejó de tener una respuesta única.
  const indexIdsByDir = new Map();

  for (const { entity, absolutePath, anchorSlug } of compiledDocs) {
    entityById.set(entity.id, entity);
    if (anchorSlug) {
      pathAnchorToId.set(`${normalize(absolutePath)}#${anchorSlug}`, entity.id);
      continue; // una sub-entidad nunca es "la" entidad de su archivo para un enlace sin ancla
    }
    pathToId.set(normalize(absolutePath), entity.id);
    if (entity.tipo_entidad === 'indice_categoria' || entity.tipo_entidad === 'indice_modulo') {
      const dir = normalize(path.dirname(absolutePath));
      if (!indexIdsByDir.has(dir)) indexIdsByDir.set(dir, []);
      indexIdsByDir.get(dir).push(entity.id);
    }
  }

  // Solo se registra un índice por directorio cuando es el único candidato
  // — si dos o más comparten directorio, ninguno se registra: inferir uno
  // de ellos como "el padre" de todo lo demás en esa carpeta sería
  // arbitrario e incorrecto (ver nota arriba). Esos archivos no tienen
  // padre por carpeta; sus propios sub-productos, si los tienen, ya reciben
  // su relación de pertenencia explícita en el paso 3 más abajo.
  const parentDirToIndexId = new Map();
  for (const [dir, ids] of indexIdsByDir) {
    if (ids.length === 1) parentDirToIndexId.set(dir, ids[0]);
  }

  const relationships = [];
  const softIssues = []; // referencias a archivos reales que no son entidades rastreadas (no es error, no se inventa relación)

  for (const { entity, absolutePath, references } of compiledDocs) {
    // 1) Relaciones por referencia explícita (enlaces Markdown ya resueltos)
    let primarioYaAsignado = false; // por entidad — reinicia en cada perfil
    for (const ref of references) {
      if (!ref.exists) continue; // las rotas se reportan en validator.js, no generan relación

      // Si el enlace lleva ancla y esa ancla coincide con un sub-producto
      // real dentro del archivo destino, resuelve al producto específico
      // (ej. "...#vida-fuel" -> productos/09-proteinas-batidos/vida-fuel)
      // en vez de colapsar al archivo contenedor completo — antes de esta
      // extensión (Hallazgo 2, docs/ARCHITECTURE_v1.md §8) todo enlace a
      // ese archivo, sin importar el ancla, apuntaba a la misma entidad,
      // produciendo relaciones duplicadas cuando dos productos distintos
      // del mismo archivo se enlazaban por separado. Si la ancla no
      // coincide con ningún sub-producto conocido (ej. un enlace a una
      // sección cualquiera de un archivo normal), se conserva el
      // comportamiento anterior: resolver por ruta de archivo.
      const targetId =
        (ref.anchor && pathAnchorToId.get(`${normalize(ref.resolvedPath)}#${ref.anchor}`)) ||
        pathToId.get(normalize(ref.resolvedPath));
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

  // 3) Relación estructural para sub-productos de un archivo de categoría de
  //    archivo único (ver anchorEntities.js): mismo tipo de relación que ya
  //    existe para productos organizados en carpeta con index.md (paso 2),
  //    por coherencia — solo cambia cómo se descubre el padre (explícito,
  //    vía parentContainerId, en vez de inferido de la carpeta contenedora,
  //    porque aquí varias entidades comparten un mismo archivo, no una
  //    carpeta).
  for (const { entity, parentContainerId } of compiledDocs) {
    if (!parentContainerId) continue;
    relationships.push(
      createRelationship({
        origenId: entity.id,
        destinoId: parentContainerId,
        tipoRelacion: 'pertenece_a_categoria',
        archivoOrigen: entity.ruta_original,
      })
    );
  }

  return { relationships, softIssues };
}

function normalize(absolutePath) {
  // Windows no distingue mayúsculas/minúsculas en rutas de archivo — se
  // normaliza para que la comparación de referencias no falle por eso.
  return path.normalize(absolutePath).toLowerCase();
}
