// logger.js
// Logging del compilador hacia knowledge/logs/. Deliberadamente simple
// (sin dependencias): tres archivos de log de solo-anexado, más eco a
// consola para visibilidad inmediata al ejecutar.

import fs from 'node:fs';
import path from 'node:path';
import { LOGS_ROOT } from './config.js';

const FILES = {
  compilation: path.join(LOGS_ROOT, 'compilation.log'),
  errors: path.join(LOGS_ROOT, 'errors.log'),
  warnings: path.join(LOGS_ROOT, 'warnings.log'),
};

export function initLogger() {
  fs.mkdirSync(LOGS_ROOT, { recursive: true });
  // Cada ejecución empieza con logs limpios — el compilador es idempotente
  // y regenerable por diseño (ver docs/KNOWLEDGE_MODEL.md §11), no acumula
  // historial dentro del propio archivo de log de una corrida a otra.
  for (const filePath of Object.values(FILES)) {
    fs.writeFileSync(filePath, '');
  }
}

function timestamp() {
  return new Date().toISOString();
}

function appendLine(filePath, line) {
  fs.appendFileSync(filePath, line + '\n');
}

export function logInfo(message) {
  const line = `[${timestamp()}] [INFO] ${message}`;
  appendLine(FILES.compilation, line);
  console.log(line);
}

export function logWarning(message) {
  const line = `[${timestamp()}] [WARN] ${message}`;
  appendLine(FILES.compilation, line);
  appendLine(FILES.warnings, line);
  console.warn(line);
}

export function logError(message) {
  const line = `[${timestamp()}] [ERROR] ${message}`;
  appendLine(FILES.compilation, line);
  appendLine(FILES.errors, line);
  console.error(line);
}
