// manifest.js
// Pipeline paso 10: generar manifiesto.
// Responsabilidad única: producir el registro de control de una corrida de
// compilación — qué versión del compilador y del Knowledge Model se usaron,
// cuándo, con qué resultado, y contra qué estado del repositorio (si hay
// historial de Git disponible).

import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { COMPILER_VERSION, KNOWLEDGE_MODEL_REFERENCE, REPO_ROOT } from './config.js';

function tryGetGitCommit() {
  try {
    const hash = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return hash;
  } catch {
    // Esperado hoy: docs/FASE_1_AUDITORIA_TECNICA.md ya documentó que el
    // repositorio no tiene ningún commit todavía. Se registra explícitamente
    // como null en vez de fallar u omitir el campo.
    return null;
  }
}

export function buildManifest({ entities, relationships, issues, documentsProcessed, statistics }) {
  const errores = issues.filter((i) => i.severidad === 'error');
  const advertencias = issues.filter((i) => i.severidad === 'advertencia');

  const combinedChecksums = entities
    .map((e) => e.checksum)
    .sort()
    .join('');
  const runHash = crypto.createHash('sha256').update(combinedChecksums, 'utf8').digest('hex');

  return {
    version_compilador: COMPILER_VERSION,
    version_knowledge_model: KNOWLEDGE_MODEL_REFERENCE,
    fecha_compilacion: new Date().toISOString(),
    git_commit: tryGetGitCommit(),
    hash_proceso: runHash,
    archivos_procesados: documentsProcessed,
    cantidad_entidades: entities.length,
    cantidad_relaciones: relationships.length,
    errores: errores.map((e) => ({ tipo: e.tipo, detalle: e.detalle, archivo: e.archivo ?? null })),
    advertencias: advertencias.map((w) => ({ tipo: w.tipo, detalle: w.detalle, archivo: w.archivo ?? null })),
    estadisticas: statistics,
  };
}
