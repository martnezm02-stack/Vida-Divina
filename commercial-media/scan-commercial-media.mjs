#!/usr/bin/env node
// scan-commercial-media.mjs — CLI real (encargo §5, §36, §37). Uso:
//   node scan-commercial-media.mjs [--dry-run]
// o vía package.json: npm run scan -- --dry-run

import { scanCommercialMedia } from './src/scanCommercialMedia.js';

const dryRun = process.argv.includes('--dry-run');
const report = scanCommercialMedia({ dryRun });

console.log(`Commercial Media Scan${dryRun ? ' (dry-run -- nada se escribió en el registry)' : ''}`);
console.log(`  Registrados nuevos: ${report.registered.length}`);
console.log(`  Actualizados (mismo archivo, ya conocido): ${report.updated.length}`);
console.log(`  Requieren metadata (NEEDS_METADATA, inactivos hasta completar): ${report.needsMetadata.length}`);
console.log(`  Inválidos (no se pudieron leer/validar): ${report.invalid.length}`);

if (report.needsMetadata.length > 0) {
  console.log('\nArchivos que requieren metadata -- agrega una entrada para ellos en incoming/manifest.json:');
  for (const r of report.needsMetadata) console.log(`  - ${r.fileName ?? r.displayName} (${r.classificationReason})`);
}
if (report.invalid.length > 0) {
  console.log('\nArchivos inválidos:');
  for (const r of report.invalid) console.log(`  - ${r.fileName}: ${r.errors.join('; ')}`);
}
