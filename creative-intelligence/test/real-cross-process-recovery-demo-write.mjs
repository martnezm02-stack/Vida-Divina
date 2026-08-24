// real-cross-process-recovery-demo-write.mjs — PASO 9 de la fase de
// persistencia: proceso A. Crea un ProductionArtifact + VisualProductionPackage
// REALES, los guarda en el data/ REAL del paquete (sin override de
// directorio), y escribe sus ids a un archivo marcador para que un
// SEGUNDO proceso node (real-cross-process-recovery-demo-read.mjs),
// arrancado por separado, los recupere sin compartir memoria con este.

import { writeFileSync } from 'node:fs';
import { createProductionArtifact, BASELINE_NOT_ESTABLISHED } from '../production/creativeProductionArtifact.js';
import { createVisualProductionPackage } from '../production/visualProductionPackage.js';
import { saveProductionArtifact } from '../production/productionArtifactStore.js';
import { saveVisualProductionPackage } from '../production/visualProductionPackageStore.js';

const artifact = createProductionArtifact({
  creativeCellCandidateId: 'CC-CROSS-PROCESS-DEMO',
  concept: 'Demo real de recuperación entre procesos',
  commercialObjective: 'WHATSAPP_CONVERSATION',
  audienceState: 'personas con estreñimiento crónico, texto libre',
  coreAngle: 'ángulo real de la demo',
  hook: { type: 'QUESTION', text: 'Hook real de la demo cross-process', mechanism: 'validación', inspiredByPattern: 'patrón real', hypothesisNote: 'nota real' },
  format: 'REEL',
  postCopy: 'Copy real de la demo. Escríbenos por WhatsApp.',
  cta: { primary: 'Escríbenos por WhatsApp', whatsapp: 'CTA whatsapp real de la demo' },
  visualDirection: { setting: 'home', visualMechanism: 'zoom lento', props: [] },
  screenText: ['Hook real de la demo cross-process'],
  staticVersion: { applicable: false, description: 'no aplica' },
  videoVersion: { applicable: true, description: 'script real' },
  whatsappVersion: 'Versión whatsapp real de la demo.',
  variants: [
    { label: 'Variante A', changedVariable: 'HOOK', description: 'variante A real' },
    { label: 'Variante B', changedVariable: 'CTA', description: 'variante B real' },
  ],
  complianceNotes: { riskLevel: 'LOW', riskReason: 'sin riesgo detectado' },
  riskyClaims: [],
  evidenceBasis: ['NONE_OBSERVED_EXPLORATORY'],
  productFactsUsed: [{ fact: 'tránsito intestinal lento', source: 'docs/productos/01-control-de-peso/tedivina.md' }],
  productFactsRequired: [],
  hypothesisRef: 'H-CROSS-PROCESS-DEMO',
  primaryMetric: 'whatsapp_conversations',
  discardCriteria: { metric: 'whatsapp_conversations', threshold: BASELINE_NOT_ESTABLISHED, description: 'sin baseline' },
  customerEvidenceRequired: false,
});

const pkg = createVisualProductionPackage({
  productionArtifact: artifact,
  variantLabel: 'Variante A',
  generationPrompt: 'prompt real de la demo',
  negativePrompt: 'negprompt real de la demo',
  sceneDescription: 'escena real de la demo',
  subjectDescription: 'sujeto real de la demo',
  productPlacement: { description: 'colocación real de la demo' },
  cameraDirection: 'dirección de cámara real',
  lightingDirection: 'luz real',
  screenText: ['Hook real de la demo cross-process'],
  voiceover: ['Hook real de la demo cross-process.', 'CTA real de la demo.'],
  subtitleText: ['Hook real de la demo cross-process.', 'CTA real de la demo.'],
  duration: '20-30s',
  caption: 'caption real de la demo',
  cta: 'CTA real de la demo.',
  whatsappCta: 'WhatsApp',
  riskyClaims: [],
  hasRealProductReference: false,
});

const savedArtifact = saveProductionArtifact(artifact);
const savedPkg = saveVisualProductionPackage(pkg);

console.log('PROCESO A — guardado real completado:');
console.log(JSON.stringify({ productionArtifactId: savedArtifact.productionArtifactId, visualProductionPackageId: savedPkg.visualProductionPackageId }, null, 2));

writeFileSync(
  new URL('./_cross-process-demo-ids.json', import.meta.url),
  JSON.stringify({
    productionArtifactId: artifact.productionArtifactId,
    visualProductionPackageId: pkg.visualProductionPackageId,
    // Hash de referencia liviano para comparar integridad sin reescribir el objeto completo en el marcador.
    expectedHookText: artifact.hook.text,
    expectedVoiceover: pkg.voiceover,
    expectedCreatedAt: artifact.createdAt,
  }, null, 2),
);
console.log('Marcador escrito en _cross-process-demo-ids.json — el proceso B lo leerá de forma independiente.');
