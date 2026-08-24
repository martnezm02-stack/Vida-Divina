// real-cross-process-recovery-demo-read.mjs — PASO 9: proceso B, arrancado
// como un `node` completamente separado del proceso A (real-cross-process-
// recovery-demo-write.mjs). No comparte memoria, no comparte variables --
// solo lee el marcador de ids y recupera los objetos reales DESDE DISCO,
// vía los stores reales. Compara campos clave contra lo que el marcador
// dice que el proceso A guardó, y limpia los artefactos de la demo al
// final (usando deleteProductionArtifact/deleteVisualProductionPackage,
// para no dejar basura en creative-intelligence/data/ real).

import { readFileSync, unlinkSync } from 'node:fs';
import { getProductionArtifact, deleteProductionArtifact } from '../production/productionArtifactStore.js';
import { getVisualProductionPackage, deleteVisualProductionPackage } from '../production/visualProductionPackageStore.js';

const markerPath = new URL('./_cross-process-demo-ids.json', import.meta.url);
const marker = JSON.parse(readFileSync(markerPath, 'utf8'));

console.log('PROCESO B — recuperando desde disco, proceso nuevo, sin memoria compartida con el proceso A:');

const recoveredArtifact = getProductionArtifact(marker.productionArtifactId);
const recoveredPkg = getVisualProductionPackage(marker.visualProductionPackageId);

let ok = true;
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}`);
  if (!pass) { ok = false; console.log('    actual:', JSON.stringify(actual)); console.log('    expected:', JSON.stringify(expected)); }
}

check('productionArtifactId recuperado coincide', recoveredArtifact.productionArtifactId, marker.productionArtifactId);
check('hook.text sobrevive intacto', recoveredArtifact.hook.text, marker.expectedHookText);
check('createdAt sobrevive intacto (timestamp real de creación, no de guardado)', recoveredArtifact.createdAt, marker.expectedCreatedAt);
check('visualProductionPackageId recuperado coincide', recoveredPkg.visualProductionPackageId, marker.visualProductionPackageId);
check('voiceover (array completo) sobrevive intacto', recoveredPkg.voiceover, marker.expectedVoiceover);
check('la referencia productionArtifactId dentro del paquete sigue apuntando al artifact real', recoveredPkg.productionArtifactId, marker.productionArtifactId);

console.log(ok ? '\nRESULTADO: RECUPERACIÓN REAL ENTRE PROCESOS = PASS' : '\nRESULTADO: RECUPERACIÓN REAL ENTRE PROCESOS = FAIL');

// Limpieza: esto es una demo, no debe dejar datos permanentes en el data/ real del paquete.
deleteVisualProductionPackage(marker.visualProductionPackageId);
deleteProductionArtifact(marker.productionArtifactId);
unlinkSync(markerPath);
console.log('Artefactos de la demo eliminados del data/ real (deleteVisualProductionPackage + deleteProductionArtifact) y marcador borrado.');

process.exit(ok ? 0 : 1);
