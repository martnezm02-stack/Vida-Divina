#!/usr/bin/env node
// validatePerformanceAnalysisPhase2.mjs — Performance Analysis Engine,
// Fase 13 (validación real). Solo LEE el store de producción real (mismo
// que /api/performance y /api/performance/analysis) -- no publica, no
// modifica, no llama a Meta, no solicita permisos.
//
// Uso (desde content-strategy/): node validatePerformanceAnalysisPhase2.mjs

import { analyzePerformance } from './src/performanceAnalysis/performanceAnalysisService.js';

const REAL_TARGETS = [
  { platform: 'instagram', externalPostId: '18376003507235391' },
  { platform: 'facebook', externalPostId: '122109854133422530' },
];

function main() {
  const overall = analyzePerformance({});
  console.log(`=== Análisis global === status=${overall.status}`);
  if (overall.status === 'OK') console.log(JSON.stringify(overall.summary));

  for (const { platform, externalPostId } of REAL_TARGETS) {
    console.log(`\n=== ${platform.toUpperCase()} (filtrado) ===`);
    const r = analyzePerformance({ platform });
    console.log(`status=${r.status}`);
    if (r.status !== 'OK') { console.log(`  reason: ${r.reason}`); continue; }
    console.log(`  summary: ${JSON.stringify(r.summary)}`);
    const entry = [...r.topPerformers, ...r.underperformers].find((e) => e.externalPostId === externalPostId);
    console.log(entry ? `  score real (${externalPostId}): ${JSON.stringify(entry)}` : `  publicación real ${externalPostId} presente en el store pero sin score comparable (evidencia insuficiente en su grupo) -- INSUFFICIENT_DATA para score individual, no se inventa.`);
    console.log(`  benchmarks.likes: ${JSON.stringify(r.benchmarks.likes?.[platform]?.overall)}`);
    console.log(`  insights generados: ${r.insights.length}`);
  }
}

main();
