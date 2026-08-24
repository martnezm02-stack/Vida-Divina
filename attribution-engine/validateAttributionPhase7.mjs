#!/usr/bin/env node
// validateAttributionPhase7.mjs — Attribution Engine, Fase 19 (validación
// real controlada). Usa el crm/ real (DATABASE_URL, vía crm/index.js -- la
// única puerta de acceso a PostgreSQL) y el performanceLearningStore de
// producción real. Solo hace SELECT sobre crm (listCreatedBetween es
// read-only) y persiste AttributionRecord en el store existente -- NUNCA
// publica, NUNCA crea leads/ventas falsas, NUNCA modifica WhatsApp/Meta,
// NUNCA solicita permisos nuevos.
//
// Uso (desde attribution-engine/): node --env-file=../crm/.env validateAttributionPhase7.mjs

import * as crm from '../crm/index.js';
import { performanceLearningStore } from '../content-strategy/src/performanceLearningStoreInstance.js';
import { generateAttributionForAllPublications, computeCommercialMetrics } from './src/attributionService.js';

async function main() {
  const publications = performanceLearningStore.loadAll('published_content').filter((p) => p.external_post_id);
  console.log(`PublishedContent con external_post_id real: ${publications.length}`);
  if (publications.length === 0) {
    console.log('INSUFFICIENT_ATTRIBUTION_DATA: no hay publicaciones reales registradas.');
    return;
  }

  let connected;
  try {
    connected = await crm.testConnection();
  } catch (err) {
    console.log(`BLOQUEO: no se pudo conectar a PostgreSQL real (${err.message}). Verifica DATABASE_URL en crm/.env.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Conexión a PostgreSQL real: ${connected ? 'OK' : 'FALLO'}`);
  if (!connected) { process.exitCode = 1; return; }

  const results = await generateAttributionForAllPublications({ crm, store: performanceLearningStore });
  for (const r of results) {
    console.log(`\n=== ${r.platform} · ${r.contentId} === status=${r.status}`);
    if (r.status !== 'OK') { console.log(`  error: ${r.error}`); continue; }
    console.log(`  nuevos: ${r.saved.length}, ya existentes: ${r.skipped.length}`);
    for (const rec of r.saved) console.log(`  [${rec.attributionWindow}] ${rec.attributionType} (confidence=${rec.confidence}) revenue=${rec.revenue ?? 'N/D'}`);
  }

  const allRecords = performanceLearningStore.loadAll('attribution_record');
  if (allRecords.length === 0) {
    console.log('\nINSUFFICIENT_ATTRIBUTION_DATA: no se generó ningún AttributionRecord.');
    return;
  }
  const nonUnknown = allRecords.filter((r) => r.attributionType !== 'UNKNOWN');
  console.log(`\n=== Resumen === total=${allRecords.length} no-UNKNOWN=${nonUnknown.length}`);
  console.log(JSON.stringify(computeCommercialMetrics(allRecords)));
  if (nonUnknown.length === 0) {
    console.log('\nINSUFFICIENT_ATTRIBUTION_DATA: existen publicaciones y (posiblemente) eventos comerciales, pero ninguno tiene evidencia estructural suficiente para una atribución distinta de UNKNOWN -- consistente con que whatsapp-adapter/crm todavía no capturan tracking/UTM/referral. No se fabricó ningún resultado.');
  }
  await crm.closePool();
}

main().catch(async (err) => {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
  await crm.closePool().catch(() => {});
});
