// recommendationEngine.js
// Única responsabilidad: dado un perfilId, devolver el orden de
// recomendación entre productos. No selecciona recursos, no genera
// texto de respuesta, no conversa — eso es responsabilidad de otros
// módulos (conversation-simulator, y en el futuro, recursos).
//
// Toda la clasificación proviene de knowledge/compiled/relationships.json
// (ya enriquecido por el Knowledge Compiler en este mismo sprint) — este
// archivo no vuelve a leer docs/ ni reinterpreta texto.

import { categoriaDesdeTipoRelacion, ORDEN_PRESENTACION, CATEGORIAS } from './categories.js';

/**
 * @param {Object} kb - resultado de knowledgeLoader.loadCompiledKnowledge()
 * @param {string} perfilId - ej. "clientes/descanso_sueno"
 * @returns {{
 *   perfilId: string,
 *   perfilEncontrado: boolean,
 *   porCategoria: Record<string, Array<{productoId: string, titulo: string}>>,
 *   ordenPresentacion: Array<{categoria: string, productoId: string, titulo: string}>,
 *   sinClasificar: Array<{productoId: string, titulo: string}>
 * }}
 */
export function recomendarProductos(kb, perfilId) {
  const perfil = kb.entityById.get(perfilId);
  const relaciones = kb.relationshipsByOrigin.get(perfilId) ?? [];

  const porCategoria = {
    [CATEGORIAS.PRIMARY]: [],
    [CATEGORIAS.OPTIONAL]: [],
    [CATEGORIAS.COMPLEMENTARY]: [],
    [CATEGORIAS.NOT_RECOMMENDED]: [],
  };
  const sinClasificar = [];

  for (const rel of relaciones) {
    const destino = kb.entityById.get(rel.destino_id);
    if (!destino || destino.tipo_entidad !== 'producto') continue; // esta relación no es hacia un producto — fuera de alcance del motor

    const categoria = categoriaDesdeTipoRelacion(rel.tipo_relacion);
    const item = { productoId: destino.id, titulo: destino.titulo };

    if (categoria) {
      porCategoria[categoria].push(item);
    } else {
      // Relación genérica "referencia" hacia un producto, fuera de las tres
      // secciones clasificables (ej. una mención suelta en la prosa de
      // "Descripción" o "Argumentos de venta"). No se descarta — se reporta
      // aparte para no perderla silenciosamente, pero no se le asigna una
      // categoría inventada.
      sinClasificar.push(item);
    }
  }

  const ordenPresentacion = [];
  for (const categoria of ORDEN_PRESENTACION) {
    for (const item of porCategoria[categoria]) {
      ordenPresentacion.push({ categoria, ...item });
    }
  }

  return {
    perfilId,
    perfilEncontrado: !!perfil,
    porCategoria,
    ordenPresentacion,
    sinClasificar,
  };
}
