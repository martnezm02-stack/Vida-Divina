// ingestMarketingIntelligenceSnapshot20260831.mjs — Puebla
// content-orchestrator/data/marketing-intelligence/ a partir de
// src/marketingIntelligence/seedData/snapshot-2026-08-31.js (la fuente de
// verdad versionada). Ejecutar con:
//   node ingestMarketingIntelligenceSnapshot20260831.mjs
//
// Idempotente: correrlo de nuevo actualiza sourceCount por dedup (no
// duplica señales) y no reescribe el manifest del snapshot si ya existe.

import { createSnapshot } from './src/marketingIntelligence/snapshotStore.js';
import { upsertSignal, buildIndex } from './src/marketingIntelligence/signalStore.js';
import { saveOpportunity, listOpportunities } from './src/marketingIntelligence/creativeOpportunityStore.js';
import { SIGNALS, OPPORTUNITIES } from './src/marketingIntelligence/seedData/snapshot-2026-08-31.js';

const SNAPSHOT_ID = 'snapshot-2026-08-31';

createSnapshot(SNAPSHOT_ID, {
  researchReportPath: 'docs/research/vida-divina-market-intelligence-2026-08-31.md',
  sourcesUsed: ['X/Twitter (last30days)', 'YouTube (last30days)', 'TikTok (last30days)', 'WebSearch (fallback directo)'],
  sourcesUnavailable: [
    'last30days web/grounding nativo — "Keyless web search unavailable", sin BRAVE_API_KEY/SERPER_API_KEY configurado.',
    'Instagram — HTTP 404 persistente en 3 de 4 líneas de investigación (1 corrida, Tremella, tuvo éxito y dio la mejor cobertura cross-source).',
    'Reddit — rate-limited (HTTP 429) en múltiples corridas; cobertura es límite inferior, no imagen completa.',
    'Hacker News, Polymarket, GitHub, Jobs — sin resultados útiles, esperado para este dominio de consumo/bienestar.',
  ],
  dataQualityNotes: 'Ningún hallazgo del reporte alcanza HIGH confidence en sentido estricto (3+ fuentes primarias completamente independientes). Ver docs/research/vida-divina-market-intelligence-2026-08-31.md, sección 20, para el detalle completo de metodología y limitaciones.',
});

const idBySeedKey = new Map();
for (const raw of SIGNALS) {
  const { seedKey, ...fields } = raw;
  if (idBySeedKey.has(seedKey)) throw new Error(`ingest: seedKey duplicado en SIGNALS: "${seedKey}"`);
  const saved = upsertSignal(SNAPSHOT_ID, fields, {
    additionalSourceIsIndependent: (fields.independentSourceCount ?? 1) > 1,
  });
  idBySeedKey.set(seedKey, saved.id);
}

// Idempotencia de oportunidades: si ya existe una con el mismo título en
// este snapshot, no se duplica.
const existingTitles = new Set(listOpportunities(SNAPSHOT_ID).map((o) => o.title));
let opportunitiesCreated = 0;
for (const opp of OPPORTUNITIES) {
  if (existingTitles.has(opp.title)) continue;
  const { signalSeedKeys, ...fields } = opp;
  const signalIds = signalSeedKeys.map((k) => {
    const id = idBySeedKey.get(k);
    if (!id) throw new Error(`ingest: seedKey desconocido referenciado por oportunidad "${opp.title}": "${k}"`);
    return id;
  });
  saveOpportunity(SNAPSHOT_ID, { ...fields, signalIds });
  opportunitiesCreated += 1;
}

const index = buildIndex(SNAPSHOT_ID);
console.log(`Snapshot ${SNAPSHOT_ID}: ${index.signalCount} señales, ${opportunitiesCreated} oportunidades nuevas (${listOpportunities(SNAPSHOT_ID).length} totales).`);
console.log('Por tipo:', JSON.stringify(index.byType, null, 2));
