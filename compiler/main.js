#!/usr/bin/env node
// main.js — CLI del Knowledge Compiler MVP.
//
// Uso:
//   node main.js                     compila todos los módulos descubiertos en docs/
//   node main.js --modules=productos compila únicamente el módulo indicado (o una lista separada por comas)
//
// Nunca modifica nada dentro de docs/. Toda la salida vive en knowledge/
// (raw/, compiled/, logs/, cache/), tal como exige el encargo del sprint.

import { runPipeline } from './src/pipeline.js';
import { initLogger, logInfo, logWarning, logError } from './src/logger.js';
import {
  writeEntityMetaJson,
  writeIndexJson,
  writeEntitiesJson,
  writeRelationshipsJson,
  writeCatalogJson,
  writeStatisticsJson,
  writeManifestJson,
  prepareCacheDirectory,
} from './src/artifacts.js';
import { computeStatistics } from './src/statistics.js';
import { buildManifest } from './src/manifest.js';

function parseModuleFilter(argv) {
  const flag = argv.find((a) => a.startsWith('--modules='));
  if (!flag) return null;
  const value = flag.slice('--modules='.length).trim();
  if (value.length === 0) return null;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function main() {
  const moduleFilter = parseModuleFilter(process.argv.slice(2));

  initLogger();
  prepareCacheDirectory();

  logInfo('=== Knowledge Compiler MVP — inicio de compilación ===');
  if (moduleFilter) {
    logInfo(`Filtro de módulos activo: ${moduleFilter.join(', ')}`);
  } else {
    logInfo('Sin filtro de módulos — se compilarán todos los módulos descubiertos en docs/');
  }

  const result = runPipeline(moduleFilter);
  const { modules, entities, relationships, issues, documentsProcessed, startedAt, finishedAt } = result;

  // Paso 8: generar artefactos.
  logInfo('Paso 8: generando artefactos en knowledge/raw/ y knowledge/compiled/...');
  for (const entity of entities) {
    writeEntityMetaJson(entity);
  }
  writeIndexJson(entities);
  writeEntitiesJson(entities);
  writeRelationshipsJson(relationships);
  writeCatalogJson(entities, modules);
  logInfo(`Artefactos escritos: ${entities.length} archivos .meta.json + 4 índices compilados`);

  // Paso 9: estadísticas.
  logInfo('Paso 9: generando estadísticas...');
  const statistics = computeStatistics({ modules, entities, relationships, issues, startedAt, finishedAt });
  writeStatisticsJson(statistics);

  // Paso 10: manifiesto.
  logInfo('Paso 10: generando manifiesto...');
  const manifest = buildManifest({ entities, relationships, issues, documentsProcessed, statistics });
  writeManifestJson(manifest);

  logInfo('=== Compilación finalizada ===');
  logInfo(
    `Módulos: ${statistics.cantidad_modulos} · Entidades: ${statistics.cantidad_entidades} · ` +
      `Relaciones: ${statistics.cantidad_relaciones} · Advertencias: ${statistics.cantidad_advertencias} · ` +
      `Errores: ${statistics.cantidad_errores} · Tiempo: ${statistics.tiempo_compilacion_ms}ms`
  );

  if (statistics.cantidad_errores > 0) {
    logWarning(
      `La compilación terminó con ${statistics.cantidad_errores} error(es) registrados — revisar knowledge/logs/errors.log. ` +
        'La compilación NO se detuvo (comportamiento esperado, ver encargo del sprint).'
    );
  }
}

try {
  main();
} catch (err) {
  // Última red de seguridad: un fallo aquí es un bug del compilador mismo
  // (no un problema de un documento individual, esos ya se aíslan en
  // pipeline.js). Se reporta con el máximo detalle posible.
  logError(`Fallo fatal del compilador: ${err.stack || err.message}`);
  process.exitCode = 1;
}
