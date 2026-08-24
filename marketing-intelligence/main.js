#!/usr/bin/env node
// main.js — Marketing Intelligence: prueba controlada end-to-end de la Fase 2.
//
// Demuestra la cadena completa:
//   fuente real → adquisición → normalización → almacenamiento RAW →
//   análisis → Observación → Inferencia → Hipótesis → referencia a fuente →
//   exportación
//
// Fuentes usadas (pequeñas, controladas, públicas — sin X, sin Meta, sin
// Reddit, sin LinkedIn, sin ninguna cuenta):
//   - Web:    página pública de Wikipedia sobre "Call to action" (vía Jina
//             Reader directo, sin key — ver src/adapters/webAdapter.js)
//   - RSS:    HubSpot Marketing Blog, primeros 3 items del feed
//   - GitHub: búsqueda pública de repositorios (topic:marketing-automation)
//
// Uso: node main.js   (o: npm run demo)

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { InternetAccessLayer } from './src/internetAccessLayer.js';
import { RawStore } from './src/storage/rawStore.js';
import { IntelligenceStore } from './src/storage/intelligenceStore.js';
import { QueryCache } from './src/storage/cache.js';
import { fetchWebPage } from './src/adapters/webAdapter.js';
import { fetchFeed } from './src/adapters/rssAdapter.js';
import { searchRepositories } from './src/adapters/githubAdapter.js';
import { extractObservations } from './src/pipeline/observation.js';
import { aggregateInferences } from './src/pipeline/inference.js';
import { generateHypotheses } from './src/pipeline/hypothesis.js';
import { toJson, toJsonl } from './src/export/exportJson.js';
import { toCsv } from './src/export/exportCsv.js';
import { toMarkdownReport } from './src/export/exportMarkdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const EXPORT_DIR = join(__dirname, 'exports');

async function main() {
  const rawStore = new RawStore(join(DATA_DIR, 'raw'));
  const intelligenceStore = new IntelligenceStore(join(DATA_DIR, 'intelligence'));
  const cache = new QueryCache(join(DATA_DIR, 'cache'));

  const layer = new InternetAccessLayer({ rawStore, cache });
  layer.registerAdapter('web', (query) => fetchWebPage(query));
  layer.registerAdapter('rss', (query) => fetchFeed(query, { maxItems: 3 }));
  layer.registerAdapter('github', (query) => searchRepositories(query, { perPage: 3 }));

  console.log('--- 1. Adquisición (pequeña, controlada, sin cuentas) ---');
  const webResult = await layer.fetch('web', 'https://en.wikipedia.org/wiki/Call_to_action_(marketing)');
  const rssResult = await layer.fetch('rss', 'https://blog.hubspot.com/marketing/rss.xml');
  const githubResult = await layer.fetch('github', 'topic:marketing-automation');

  const allRaw = [...webResult.records, ...rssResult.records, ...githubResult.records];
  console.log(`Registros RAW adquiridos: ${allRaw.length}`);
  for (const r of allRaw) {
    console.log(`  [${r.source}] ${r.fetch_status} — ${r.title ?? r.url}`);
  }

  console.log('\n--- 2. Análisis: Observación (Etapa A) ---');
  const allObservations = [];
  for (const record of allRaw) {
    const observations = extractObservations(record);
    for (const obs of observations) intelligenceStore.save('observation', obs);
    allObservations.push(...observations);
  }
  console.log(`Observaciones generadas: ${allObservations.length}`);

  console.log('\n--- 3. Análisis: Inferencia (Etapa B) ---');
  const inferences = aggregateInferences(allObservations, {
    scopeLabel: `N=${allRaw.length} registros de esta corrida de prueba`,
  });
  for (const inf of inferences) intelligenceStore.save('inference', inf);
  console.log(`Inferencias generadas: ${inferences.length}`);

  console.log('\n--- 4. Análisis: Hipótesis (Etapa C) ---');
  const hypotheses = generateHypotheses(inferences);
  for (const hyp of hypotheses) intelligenceStore.save('hypothesis', hyp);
  console.log(`Hipótesis generadas: ${hypotheses.length}`);

  console.log('\n--- 5. Trazabilidad SOURCE -> OBSERVATION -> INFERENCE -> HYPOTHESIS ---');
  if (hypotheses.length > 0) {
    const hyp = hypotheses[0];
    const inf = inferences.find((i) => i.inference_id === hyp.based_on_inference_id);
    const obs = allObservations.find((o) => inf.based_on_observation_ids.includes(o.observation_id));
    const source = rawStore.loadByRecordId(obs.source_record_id);
    console.log('Hipótesis :', hyp.hypothesis);
    console.log('  <- Inferencia  :', inf.pattern, `(scope: ${inf.scope}, frecuencia: ${inf.frequency})`);
    console.log('  <- Observación :', obs.value, `("${obs.evidence_quote}")`);
    console.log('  <- Fuente RAW  :', source.url, `(hash ${source.content_hash.slice(0, 12)}...)`);
  } else {
    console.log('(No se generaron hipótesis en esta corrida — no hubo observaciones con patrones detectables en las fuentes obtenidas.)');
  }

  console.log('\n--- 6. Exportación ---');
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(join(EXPORT_DIR, 'raw.jsonl'), toJsonl(allRaw), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'intelligence.json'), toJson({ observations: allObservations, inferences, hypotheses }), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'observations.csv'), toCsv(allObservations), 'utf8');
  writeFileSync(join(EXPORT_DIR, 'reporte.md'), toMarkdownReport({ rawRecords: allRaw, observations: allObservations, inferences, hypotheses }), 'utf8');
  console.log(`Exportado a: ${EXPORT_DIR}`);
  console.log('  - raw.jsonl');
  console.log('  - intelligence.json');
  console.log('  - observations.csv');
  console.log('  - reporte.md');
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
});
