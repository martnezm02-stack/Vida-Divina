// creativeOpportunityStore.js — Marketing Intelligence: CreativeOpportunity
// (sección 42 del encargo). Puente conceptual señal -> oportunidad
// creativa. Solo almacena -- NUNCA modifica ni consume automáticamente
// Creative Director, Hook Intelligence, Claim Relevance ni Creative
// Structure (secciones 39/53: "no auto-influence", "no implement creative
// consumption" -- eso es una fase posterior explícitamente fuera de
// alcance aquí).

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MI_ROOT, getSignal } from './signalStore.js';
import { confidenceFromEvidenceLevel, EVIDENCE_LEVELS, PRIORITIES } from './schema.js';

function opportunitiesDir(snapshotId) {
  return join(MI_ROOT, snapshotId, 'opportunities');
}

function opportunityPath(snapshotId, id) {
  return join(opportunitiesDir(snapshotId), `${id}.json`);
}

/**
 * @param {{title:string, signalIds:string[], audience?:string|null, product?:string|null,
 *   angle:string, hookPattern?:string|null, contentPattern?:string|null,
 *   evidenceLevel:string, priority:string, rationale:string}} fields
 */
export function saveOpportunity(snapshotId, fields) {
  if (!snapshotId?.trim()) throw new Error('saveOpportunity: "snapshotId" es obligatorio.');
  const {
    title, signalIds = [], audience = null, product = null, angle,
    hookPattern = null, contentPattern = null, evidenceLevel, priority, rationale,
  } = fields;

  if (!title?.trim()) throw new Error('saveOpportunity: "title" es obligatorio.');
  if (!angle?.trim()) throw new Error('saveOpportunity: "angle" es obligatorio.');
  if (!rationale?.trim()) throw new Error('saveOpportunity: "rationale" es obligatorio -- nunca una oportunidad sin justificación trazable.');
  if (!PRIORITIES.includes(priority)) throw new Error(`saveOpportunity: "priority" inválido: "${priority}".`);
  if (!EVIDENCE_LEVELS.includes(evidenceLevel)) throw new Error(`saveOpportunity: "evidenceLevel" inválido: "${evidenceLevel}".`);
  if (!Array.isArray(signalIds) || signalIds.length === 0) {
    throw new Error('saveOpportunity: "signalIds" debe tener al menos una señal real -- nunca una oportunidad sin señal de respaldo (sección 51: trazabilidad fuente->evidencia->señal->recomendación).');
  }
  for (const id of signalIds) getSignal(snapshotId, id); // lanza si alguna señal referenciada no existe -- nunca una oportunidad "huérfana".

  const opportunity = Object.freeze({
    id: randomUUID(),
    snapshotId,
    title,
    signalIds: Object.freeze([...signalIds]),
    audience,
    product,
    angle,
    hookPattern,
    contentPattern,
    evidenceLevel,
    confidence: confidenceFromEvidenceLevel(evidenceLevel),
    priority,
    rationale,
    createdAt: new Date().toISOString(),
  });
  mkdirSync(opportunitiesDir(snapshotId), { recursive: true });
  writeFileSync(opportunityPath(snapshotId, opportunity.id), JSON.stringify(opportunity, null, 2), 'utf8');
  return opportunity;
}

export function getOpportunity(snapshotId, id) {
  const filePath = opportunityPath(snapshotId, id);
  if (!existsSync(filePath)) throw new Error(`getOpportunity: no existe la oportunidad "${id}" en el snapshot "${snapshotId}".`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function listOpportunities(snapshotId) {
  const dir = opportunitiesDir(snapshotId);
  if (!existsSync(dir)) return Object.freeze([]);
  return Object.freeze(
    readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))),
  );
}
