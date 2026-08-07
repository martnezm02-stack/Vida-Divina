// pipeline.js
// Orquestador de los 10 pasos definidos en el encargo del sprint. No
// contiene lógica propia de negocio — cada paso delega en el módulo
// correspondiente. Esta es la única función que conoce el orden completo.

import { createEntityRecord } from './models.js';
import { discoverAll } from './discovery.js';
import { classifyEntity } from './classifier.js';
import { extractMetadata } from './extractor.js';
import { extractReferences } from './references.js';
import { buildRelationships } from './relationships.js';
import { validate } from './validator.js';
import { COMPILER_VERSION } from './config.js';
import { logInfo, logWarning, logError } from './logger.js';

/**
 * @param {string[] | null} moduleFilter
 * @returns {{entities: import('./models.js').EntityRecord[], relationships: Array, issues: Array, statistics: Object, manifest: Object, modules: string[]}}
 */
export function runPipeline(moduleFilter = null) {
  const startedAt = Date.now();

  // Paso 1-2: descubrir módulos y documentos.
  logInfo('Paso 1-2: descubriendo módulos y documentos...');
  const { modules, documentsByModule, skippedRootFiles } = discoverAll(moduleFilter);
  logInfo(`Módulos descubiertos: ${modules.join(', ') || '(ninguno)'}`);
  if (skippedRootFiles.length > 0) {
    logInfo(
      `Documentos sueltos en docs/ excluidos del pipeline (documentos de arquitectura, no de módulo): ${skippedRootFiles.join(', ')}`
    );
  }

  const allDocuments = modules.flatMap((m) => documentsByModule[m]);
  logInfo(`Documentos totales a procesar: ${allDocuments.length}`);

  // Pasos 3-5 se ejecutan por documento, con aislamiento de errores: un
  // archivo problemático nunca detiene la compilación (requisito explícito
  // del encargo — "nunca detener la compilación, registrar y continuar").
  const compiledDocs = [];
  for (const doc of allDocuments) {
    try {
      compiledDocs.push(compileSingleDocument(doc));
    } catch (err) {
      logError(`Fallo inesperado procesando ${doc.rutaOriginal}: ${err.message}`);
      compiledDocs.push(compileFailureRecord(doc, err));
    }
  }

  // Paso 6: construir relaciones.
  logInfo('Paso 6: construyendo relaciones...');
  const { relationships, softIssues } = buildRelationships(
    compiledDocs.map((d) => ({ entity: d.entity, absolutePath: d.absolutePath, references: d.references }))
  );
  logInfo(`Relaciones detectadas: ${relationships.length}`);

  // Enlazar relaciones_detectadas dentro de cada entidad (vista embebida,
  // además del archivo relationships.json independiente).
  const relationshipsByEntityId = new Map();
  for (const r of relationships) {
    if (!relationshipsByEntityId.has(r.origen_id)) relationshipsByEntityId.set(r.origen_id, []);
    relationshipsByEntityId.get(r.origen_id).push(r);
  }
  const entities = compiledDocs.map((d) => {
    d.entity.relaciones_detectadas = relationshipsByEntityId.get(d.entity.id) ?? [];
    return d.entity;
  });

  // Paso 7: validar consistencia.
  logInfo('Paso 7: validando consistencia...');
  const issues = validate(entities, relationships, softIssues);
  for (const issue of issues) {
    const suffix = issue.archivo ? ` (${issue.archivo})` : '';
    if (issue.severidad === 'error') logError(`${issue.tipo}: ${issue.detalle}${suffix}`);
    else logWarning(`${issue.tipo}: ${issue.detalle}${suffix}`);
  }

  // Reflejar errores/advertencias del validador también en el registro de
  // cada entidad afectada, y recalcular su campo "estado".
  applyValidationIssuesToEntities(entities, issues);

  // Pasos 8-10 (generar artefactos, estadísticas y manifiesto) son
  // responsabilidad de main.js — son las únicas etapas con I/O de salida,
  // y se mantienen fuera de pipeline.js para que esta función siga siendo
  // pura y testeable con datos en memoria únicamente.
  return {
    modules,
    entities,
    relationships,
    issues,
    documentsProcessed: allDocuments.length,
    startedAt,
    finishedAt: Date.now(),
  };
}

function compileSingleDocument(doc) {
  const { tipoEntidad, capa, advertencias: clasifAdvertencias } = classifyEntity(doc);
  const { content, titulo, palabrasClave, checksum, advertencias: extractAdvertencias, erroresDetectados } =
    extractMetadata(doc.absolutePath);
  const references = extractReferences(content, doc.absolutePath);

  const advertencias = [...clasifAdvertencias, ...extractAdvertencias];
  const estado = erroresDetectados.length > 0 ? 'error' : advertencias.length > 0 ? 'compilado_con_advertencias' : 'compilado';

  const entity = createEntityRecord({
    id: deriveId(doc),
    tipoEntidad,
    titulo,
    rutaOriginal: doc.rutaOriginal,
    fechaCompilacion: new Date().toISOString(),
    version: COMPILER_VERSION,
    estado,
    palabrasClave,
    referencias: references,
    checksum,
    erroresDetectados,
    advertencias,
    modulo: doc.modulo,
    capa,
  });

  return { entity, absolutePath: doc.absolutePath, references };
}

function compileFailureRecord(doc, err) {
  const entity = createEntityRecord({
    id: deriveId(doc),
    tipoEntidad: 'documento',
    titulo: '',
    rutaOriginal: doc.rutaOriginal,
    fechaCompilacion: new Date().toISOString(),
    version: COMPILER_VERSION,
    estado: 'error',
    palabrasClave: [],
    referencias: [],
    checksum: '',
    erroresDetectados: [`fallo_inesperado: ${err.message}`],
    advertencias: [],
    modulo: doc.modulo,
  });
  return { entity, absolutePath: doc.absolutePath, references: [] };
}

function deriveId(doc) {
  // Se recalcula aquí (en vez de importar deriveEntityId directamente) para
  // mantener pipeline.js desacoplado de la implementación exacta de
  // pathUtils más allá de lo que discovery.js ya expone en rutaOriginal.
  return doc.rutaOriginal.replace(/^docs\//, '').replace(/\.md$/, '');
}

function applyValidationIssuesToEntities(entities, issues) {
  const byFile = new Map();
  for (const issue of issues) {
    if (!issue.archivo) continue;
    if (!byFile.has(issue.archivo)) byFile.set(issue.archivo, []);
    byFile.get(issue.archivo).push(issue);
  }
  for (const entity of entities) {
    const related = byFile.get(entity.ruta_original);
    if (!related) continue;
    for (const issue of related) {
      const bucket = issue.severidad === 'error' ? entity.errores_detectados : entity.advertencias;
      const line = `${issue.tipo}: ${issue.detalle}`;
      if (!bucket.includes(line)) bucket.push(line);
    }
    if (entity.errores_detectados.length > 0) entity.estado = 'error';
    else if (entity.advertencias.length > 0 && entity.estado === 'compilado') entity.estado = 'compilado_con_advertencias';
  }
}
