// knowledgeQuery.js
// Paso 4-5 del flujo ("Consultar el conocimiento compilado" / "Seleccionar
// producto, testimonios, recursos, promociones"). Toda consulta de este
// archivo lee EXCLUSIVAMENTE la estructura ya cargada por
// knowledgeLoader.js desde knowledge/compiled/ — nunca vuelve a leer
// docs/ directamente. Cuando una consulta no encuentra lo que el proceso
// comercial necesitaría, se registra como hallazgo en vez de inventarse.

import { registrarHallazgo } from './missingFieldsTracker.js';

/**
 * @param {Object} kb - resultado de knowledgeLoader.loadCompiledKnowledge()
 * @param {string} perfilId
 * @returns {Object|null}
 */
export function getPerfil(kb, perfilId) {
  return kb.entityById.get(perfilId) ?? null;
}

/**
 * Productos recomendados para un perfil: se leen de relationships.json,
 * filtrando las relaciones "referencia" cuyo origen es el perfil y cuyo
 * destino es una entidad tipo_entidad === "producto".
 *
 * Limitación conocida y declarada (no oculta): relationships.json no
 * distingue "Productos recomendados" de "Productos complementarios" ni de
 * "Productos que NO son prioridad" — las tres secciones de la ficha del
 * perfil generan el mismo tipo de relación genérica "referencia" (ver
 * docs/KNOWLEDGE_COMPILER_NOTES.md #4). Este simulador aproxima "producto
 * recomendado" tomando los primeros productos referenciados en el
 * archivo — que en la práctica corresponden a la sección "Productos
 * recomendados" porque aparece primero en la plantilla de
 * docs/clientes/*.md — pero es una heurística de orden, no una relación
 * semántica real. Se registra como hallazgo.
 */
export function getProductosRecomendados(kb, perfilId, { maxResultados = 3, conversacionEvidencia }) {
  const relaciones = kb.relationshipsByOrigin.get(perfilId) ?? [];
  const productos = [];
  for (const rel of relaciones) {
    if (rel.tipo_relacion !== 'referencia') continue;
    const destino = kb.entityById.get(rel.destino_id);
    if (!destino || destino.tipo_entidad !== 'producto') continue;
    if (!productos.find((p) => p.id === destino.id)) productos.push(destino);
    if (productos.length >= maxResultados) break;
  }

  registrarHallazgo({
    informacionFaltante:
      'Distinción semántica entre "producto recomendado", "producto complementario" y "producto no prioritario" dentro de una relación Perfil→Producto',
    momento:
      'Paso 5-6 del flujo de razonamiento (consultar clientes/ y productos/), al seleccionar qué producto ofrecer primero',
    porQue:
      'El asesor experto nunca ofrece el mismo peso a un producto "recomendado" que a uno "complementario" — la ficha de cada perfil ya distingue esto en prosa, pero relationships.json compila ambas como el mismo tipo de relación genérica ("referencia"), indistinguible sin volver a leer el Markdown',
    dondeIncorporar:
      'docs/KNOWLEDGE_MODEL.md §4 (tipar la relación como recomienda / complementa_a / no_prioritario en vez de referencia genérica) + Capa 2 (.meta.json) del Knowledge Compiler para declararlo explícitamente',
    conversacionEvidencia,
  });

  return productos;
}

/**
 * Recursos de apoyo (Resource — audio, video, imagen, PDF, testimonio)
 * asociados a un perfil o etapa. Devuelve vacío siempre hoy, porque
 * docs/KNOWLEDGE_MODEL.md §3 ya documenta 0 instancias reales de Resource
 * en todo el proyecto — se confirma aquí empíricamente, no se inventa.
 */
export function getRecursosDeApoyo(kb, { perfilId, conversacionEvidencia }) {
  const recursos = (kb.entitiesByType.resource ?? []).filter((r) =>
    (r.perfiles_relacionados ?? []).includes(perfilId)
  );

  if (recursos.length === 0) {
    registrarHallazgo({
      informacionFaltante: 'Instancias reales de la entidad Resource (material de apoyo: audio, video, imagen, PDF)',
      momento: 'Paso 5 del flujo de razonamiento, "Seleccionar recursos"',
      porQue:
        'Un asesor experto suele apoyar una recomendación con un recurso (foto del producto, testimonio en audio, PDF del catálogo) — el proceso comercial documentado en proceso_de_venta/postventa.md lo asume implícitamente, pero no hay ningún archivo de recurso real que el simulador pueda seleccionar',
      dondeIncorporar:
        'docs/KNOWLEDGE_MODEL.md ya define el esquema de Resource (§3, §7) — falta la carga de instancias reales, fuera del alcance de este sprint',
      conversacionEvidencia,
    });
  }

  return recursos;
}

/**
 * Testimonios — no existe tipo_entidad "testimonio" como tal en el
 * Knowledge Model (se documentó que un testimonio sería un Resource con
 * etiqueta semántica). Devuelve vacío siempre hoy.
 */
export function getTestimonios(kb, { perfilId, conversacionEvidencia }) {
  const testimonios = (kb.entitiesByType.resource ?? []).filter(
    (r) => (r.etiquetas ?? []).includes('testimonio') && (r.perfiles_relacionados ?? []).includes(perfilId)
  );

  if (testimonios.length === 0) {
    registrarHallazgo({
      informacionFaltante: 'Testimonios reales de clientes, capturados como Resource con etiqueta "testimonio"',
      momento: 'Paso 5 del flujo de razonamiento, "Seleccionar testimonios"',
      porQue:
        'El asesor experto usa prueba social (testimonios) para reforzar la recomendación, especialmente en el primer contacto y ante objeciones de escepticismo (ver docs/objeciones/no_creo_en_suplementos.md) — hoy no hay ningún testimonio real capturado en el proyecto',
      dondeIncorporar:
        'Nuevo flujo de captura: docs/conversaciones/postventa/solicitar_testimonio.md ya define CÓMO pedirlo, pero no existe dónde ALMACENARLO como entidad Resource real',
      conversacionEvidencia,
    });
  }

  return testimonios;
}

/**
 * Promociones — no existe como entidad en absoluto en el Knowledge Model
 * (docs/KNOWLEDGE_MODEL.md §3 la marca explícitamente fuera de alcance,
 * distinta de Resource). Devuelve vacío siempre.
 */
export function getPromociones(kb, { conversacionEvidencia }) {
  registrarHallazgo({
    informacionFaltante: 'Entidad "Promoción" (descuentos, vigencia, condiciones comerciales)',
    momento: 'Paso 5 del flujo de razonamiento, "Seleccionar promociones"',
    porQue:
      'Un asesor real frecuentemente tiene una promoción vigente que ofrecer (ver la mención de "promoción" en docs/proceso_de_venta/emprendimiento.md y en el enunciado original de este sprint) — el Knowledge Model señala explícitamente que esta entidad no existe y queda fuera de alcance',
    dondeIncorporar:
      'docs/KNOWLEDGE_MODEL.md no define todavía el esquema de Promoción (a diferencia de Resource, que sí se diseñó en la Iteración 2) — haría falta una decisión de arquitectura previa a modelarla',
    conversacionEvidencia,
  });
  return [];
}

/**
 * Precio de un producto — el catálogo (docs/productos/) marca
 * explícitamente todo precio como "No especificado" por diseño, desde la
 * Fase 1. Se confirma aquí, no se inventa un número.
 */
export function getPrecio(kb, productoId, { conversacionEvidencia }) {
  registrarHallazgo({
    informacionFaltante: 'Lista de precios y métodos de pago vigentes',
    momento: 'Paso 6 del flujo de razonamiento (consultar productos/) cuando el cliente pregunta directamente por precio',
    porQue:
      'docs/conversaciones/README.md ya documenta esto como regla general ("Precios y pagos: no especificado en el catálogo") — el asesor real sí conoce el precio, pero esa información nunca se documentó en docs/productos/ a propósito',
    dondeIncorporar:
      'Fuera del Knowledge Model de conocimiento de producto — requiere una fuente operativa distinta (lista de precios del negocio), posiblemente un nuevo módulo o una integración, no una entidad de docs/',
    conversacionEvidencia,
  });
  return null;
}
