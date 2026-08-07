// config.js
// Constantes y configuración declarativa del compilador.
// Ningún otro módulo debe hardcodear rutas ni nombres de módulo — todo pasa por aquí.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// compiler/src/config.js -> compiler/src -> compiler -> raíz del repo
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

export const DOCS_ROOT = path.join(REPO_ROOT, 'docs');
export const KNOWLEDGE_ROOT = path.join(REPO_ROOT, 'knowledge');
export const RAW_ROOT = path.join(KNOWLEDGE_ROOT, 'raw');
export const COMPILED_ROOT = path.join(KNOWLEDGE_ROOT, 'compiled');
export const LOGS_ROOT = path.join(KNOWLEDGE_ROOT, 'logs');
export const CACHE_ROOT = path.join(KNOWLEDGE_ROOT, 'cache');

export const COMPILER_VERSION = '0.1.0-mvp';
export const KNOWLEDGE_MODEL_REFERENCE = 'docs/KNOWLEDGE_MODEL.md — Iteración 2';

// Extensión de documento que el compilador procesa. Deliberadamente solo Markdown —
// es la única fuente de conocimiento declarada en docs/KNOWLEDGE_MODEL.md §1.
export const DOCUMENT_EXTENSION = '.md';

// Archivos sueltos en la raíz de docs/ que NO son contenido de ningún
// módulo, sino documentos de arquitectura/meta sobre el propio sistema. Se
// excluyen deliberadamente del pipeline de entidades (ver
// KNOWLEDGE_COMPILER_IMPLEMENTATION.md). "productos.md" NO está aquí a
// propósito — ver MODULE_ROOT_INDEX_FILE abajo.
export const DOCS_ROOT_EXCLUDED_FILES = new Set([
  'knowledge_model.md',
  'fase_1_auditoria_tecnica.md',
  'knowledge_compiler_notes.md',
  'knowledge_compiler_implementation.md',
]);

// Caso especial documentado: algunos módulos tienen su índice como un
// archivo suelto en la raíz de docs/ (docs/<modulo>.md) en vez de
// docs/<modulo>/README.md — es la excepción histórica de productos/ que
// tanto CLAUDE.md como docs/KNOWLEDGE_MODEL.md ya señalan explícitamente
// ("por razones históricas usa docs/productos.md como índice a nivel
// raíz"). Sin esta tabla, el compilador trataría cada enlace hacia ese
// índice como una "referencia no verificable" — no es un error del
// contenido, es que el compilador no conocía esta excepción ya documentada
// en la arquitectura. Extensible: agregar una línea, no reescribir lógica.
export const MODULE_ROOT_INDEX_FILE = {
  productos: 'productos.md',
};

// Mapeo módulo (nombre de carpeta descubierta) -> tipo_entidad por defecto.
// Esto NO es "depender de nombres de carpetas" en el sentido prohibido por el
// encargo (el descubrimiento de módulos en discovery.js es 100% dinámico y no
// usa esta lista para decidir QUÉ es un módulo). Esta tabla solo aporta un
// significado semántico por defecto a un módulo YA descubierto, y es
// extensible agregando una línea — no reescribiendo lógica — cuando aparezca
// un módulo nuevo. Si un módulo descubierto no aparece aquí, se usa
// DEFAULT_ENTITY_TYPE y se registra una advertencia (ver classifier.js).
export const MODULE_DEFAULT_ENTITY_TYPE = {
  productos: 'producto',
  clientes: 'perfil',
  conversaciones: 'conversacion',
  objeciones: 'objecion',
  proceso_de_venta: 'documento_proceso',
  agente_ia: 'documento_cognitivo',
};

export const DEFAULT_ENTITY_TYPE = 'documento';

// Anulaciones por nombre de archivo conocido, para los archivos que
// docs/KNOWLEDGE_MODEL.md §3 documenta como una entidad propia dentro de un
// módulo heterogéneo (proceso_de_venta/ y agente_ia/ no tienen "un tipo de
// entidad por módulo" como productos/ o clientes/ — cada archivo es distinto).
// Archivos de esos módulos que NO aparecen aquí caen al tipo por defecto del
// módulo (documento_proceso / documento_cognitivo) — es una simplificación
// de MVP documentada explícitamente en KNOWLEDGE_COMPILER_IMPLEMENTATION.md.
export const FILENAME_ENTITY_OVERRIDES = {
  'estados_del_cliente.md': 'estado_cliente',
  'flujo_general.md': 'etapa_proceso',
  'reglas_de_decision.md': 'regla_decision', // capa se resuelve por módulo, ver classifier.js
  'principios.md': 'principio',
  'reglas_de_seguridad.md': 'regla_seguridad',
  'herramientas.md': 'herramienta',
  'metricas.md': 'metrica',
  'ejemplos.md': 'ejemplo_razonamiento',
};

// Sprint 3B — Recommendation Engine. Clasificación de relaciones
// Perfil -> Producto según el encabezado "## " bajo el que aparece el
// enlace en docs/clientes/*.md. Solo aplica cuando el origen es
// tipo_entidad === "perfil" y el destino tipo_entidad === "producto" (ver
// relationships.js) — no afecta ninguna otra relación del grafo.
//
// "recomienda_primario" se asigna únicamente al PRIMER enlace encontrado
// dentro de la sección "Productos recomendados" de cada perfil; el resto
// de esa misma sección recibe "recomienda_opcional" — ver justificación en
// docs/RECOMMENDATION_ENGINE.md §3 (no es una regla que exista ya escrita
// en ningún documento; es una inferencia de orden, declarada como tal).
export const SECCION_A_TIPO_RELACION_PRODUCTO = [
  { patron: /^productos recomendados$/i, tipoRelacion: 'recomienda_primario', soloPrimero: true, tipoRelacionResto: 'recomienda_opcional' },
  { patron: /^productos complementarios$/i, tipoRelacion: 'recomienda_complementario' },
  { patron: /^productos que no son prioridad$/i, tipoRelacion: 'no_recomendado' },
];

// Nombres de archivo que representan un índice de módulo o de categoría,
// no una entidad de contenido en sí. Comparación insensible a mayúsculas.
export const INDEX_FILENAMES = new Set(['index.md', 'readme.md']);
