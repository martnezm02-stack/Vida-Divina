// real-campaign-persistence.mjs — PRUEBA REAL (Fase "Consolidación y
// Validación del Operation Dashboard", sección 3). La vista Campañas del
// dashboard lee ProductionArtifactStore/VisualProductionPackageStore
// (dashboard/server/lib/productionLibrary.js#listCampaigns) pero aparecía
// vacía porque el flujo CREATE del dashboard nunca pasaba un
// ProductionArtifact/VisualProductionPackage real a generateContent() --
// esa persistencia YA existe (content-orchestrator/src/contentOrchestrator.js
// #persistProductionAssets), solo no estaba conectada a la API del
// dashboard. Esta prueba: (1) conecta esa persistencia ya existente en
// dashboard/server/routes/generation.js#handleCreate (exec.productionArtifact
// / exec.visualProductionPackage, ahora aceptados desde el body real), (2)
// construye un ProductionArtifact + VisualProductionPackage REALES,
// grounded en el mismo CreativeCell/Persona/Pain/Angle real ya resuelto por
// campaignMode.js para Té Divina (creative-intelligence/data/cycles/) y en
// el mismo copy real ya validado y grabado en una fase anterior
// (content-orchestrator/test/real-e2e-te-divina-reel.mjs) -- nunca texto
// nuevo inventado, (3) llama a la API real /api/create del dashboard con
// ambos objetos, (4) confirma que /api/campaigns ahora lista el registro
// real persistido.

import { resolveCampaignCreativeCell } from '../../content-orchestrator/src/campaignMode.js';
import { createProductionArtifact, BASELINE_NOT_ESTABLISHED } from '../../creative-intelligence/production/creativeProductionArtifact.js';
import { createVisualProductionPackage } from '../../creative-intelligence/production/visualProductionPackage.js';

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4310';

function paso(n, titulo) { console.log(`\n=== PASO ${n} — ${titulo} ===`); }

paso(1, 'CAMPAIGN MODE real — mismo CreativeCell/Persona/Pain/Angle ya persistido para Té Divina');
const resolved = resolveCampaignCreativeCell({ productId: 'te-divina' });
console.log('creativeCellId real:', resolved.creativeCell.creativeCellId);
console.log('persona real:', resolved.persona.name);
console.log('angle real:', resolved.angle.angleText);
console.log('matchScore:', resolved.matchScore);

// Mismo copy EXACTO ya validado, grabado y usado en un render real anterior
// (content-orchestrator/test/real-e2e-te-divina-reel.mjs) -- nunca se
// redacta copy nuevo aquí.
const HOOK_TEXT = 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal.';
const VOICEOVER_TEXT = 'Si necesitas un laxante casi todas las noches, tal vez te has preguntado si eso debería sentirse normal. TéDivina es un té elaborado con hojas de malva, mirra, cardo bendito, malvavisco, papaya, chaga, arándano rojo, cardo santo, manzanilla, hojas de caqui, fibra soluble, hongos de ganoderma y jengibre, entre otros ingredientes reales del catálogo. Promueve la desintoxicación natural y ayuda a mejorar el tránsito intestinal, como parte de un hábito diario. No es un tratamiento médico. Si quieres conocer más, escríbenos por WhatsApp.';
const CTA_TEXT = 'Si quieres conocer más, escríbenos por WhatsApp.';
// Fotografía RAW real distinta de la usada en la fase anterior
// (real-e2e-te-divina-reel.mjs usó "te divina c tasa.jpeg") -- necesaria
// para que el render produzca bytes nuevos: HyperFrames es determinista, así
// que reusar exactamente la misma foto + mismo audio + mismo copy generaría
// un MP4 byte-idéntico, y assetLineage.js#recordLineage es idempotente por
// hash de contenido (devuelve el registro viejo sin re-etiquetar). Sigue
// siendo una fotografía RAW real ya registrada, nunca una fabricada.
const REAL_PHOTO = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw\\Solo Te.jpeg';
const REAL_AUDIO_ASSET_PATH = 'C:\\Users\\manue\\Vida Divina\\video-production\\_audio-cache\\te-divina-creative-intelligence.wav';

paso(2, 'ProductionArtifact real — grounded en el CreativeCell/Persona/Angle real de arriba');
const productionArtifact = createProductionArtifact({
  creativeCellCandidateId: 'CC-DASHBOARD-TEDIVINA-01', // nunca el creativeCellId real (ver creativeProductionArtifact.js) -- la referencia real queda en evidenceBasis.
  concept: 'Alternativa a laxante diario para apoyar el tránsito intestinal',
  commercialObjective: 'WHATSAPP_CONVERSATION',
  audienceState: 'personas con estreñimiento crónico que usan laxante casi a diario y temen depender de él',
  coreAngle: resolved.angle.angleText,
  hook: {
    type: 'EDUCATION',
    text: HOOK_TEXT,
    mechanism: resolved.creativeCell.mechanism,
    inspiredByPattern: `Angle real ${resolved.angle.angleId} (cycle ${resolved.cycleId})`,
    hypothesisNote: resolved.productionBrief.mechanismEntry,
  },
  format: 'SHORT_VIDEO',
  script: {
    durationRangeSeconds: resolved.productionBrief.runtime,
    beats: [
      { beat: 'HOOK', content: HOOK_TEXT },
      { beat: 'BODY', content: 'Presentación de TéDivina y sus ingredientes reales del catálogo.' },
      { beat: 'CTA', content: CTA_TEXT },
    ],
  },
  postCopy: `${resolved.angle.angleText}. ${CTA_TEXT}`,
  cta: { primary: CTA_TEXT, whatsapp: 'Cuéntanos cómo ha sido tu tránsito intestinal y te compartimos opciones.' },
  visualDirection: {
    setting: resolved.formatDecision.structuralSignature.sceneSetup,
    visualMechanism: 'presentación del producto real (fotografía RAW) con hook y CTA en pantalla, sin insinuar dependencia ni diagnóstico',
    props: resolved.productionBrief.visual.props,
  },
  screenText: [HOOK_TEXT, CTA_TEXT],
  staticVersion: { applicable: true, description: 'imagen estática con la misma fotografía real, hook y CTA, sin voiceover.' },
  videoVersion: { applicable: true, description: `Script de ${resolved.productionBrief.runtime}, formato ${resolved.formatDecision.recommendedFormat}.` },
  whatsappVersion: 'Cuéntanos cómo ha sido tu tránsito intestinal y te compartimos opciones.',
  variants: [
    { label: 'Variante A', changedVariable: 'HOOK', description: 'la variante realmente renderizada en esta prueba -- hook tipo EDUCATION, foto real de producto.' },
    { label: 'Variante B', changedVariable: 'CTA', description: 'cambia el CTA a invitación a comentar en vez de WhatsApp directo -- declarada, no renderizada en esta prueba.' },
  ],
  complianceNotes: { riskLevel: 'LOW', riskReason: resolved.productionBrief.credibilityAnchorTiming },
  riskyClaims: [], // sin registros de Affiliate Evidence cargados en esta prueba -- arreglo vacío real, no omitido.
  evidenceBasis: [
    `CreativeCell real: ${resolved.creativeCell.creativeCellId} (cycle ${resolved.cycleId}, matchScore ${resolved.matchScore})`,
    `MARKET_EVIDENCE: ${resolved.persona.evidenceIds.join(', ')}`,
  ],
  productFactsUsed: [{ fact: resolved.productFacts.beneficios, source: resolved.productFacts.sourcePath }],
  productFactsRequired: [],
  hypothesisRef: resolved.creativeCell.hypothesisId,
  primaryMetric: 'whatsapp_conversations',
  discardCriteria: { metric: 'whatsapp_conversations', threshold: BASELINE_NOT_ESTABLISHED, description: resolved.productionBrief.successMetrics },
  customerEvidenceRequired: true,
});
console.log('productionArtifactId real (aún no persistido):', productionArtifact.productionArtifactId);

paso(3, 'VisualProductionPackage real — referencia la Variante A real de arriba');
const visualProductionPackage = createVisualProductionPackage({
  productionArtifact,
  variantLabel: 'Variante A',
  generationPrompt: 'N/A -- no es generación de imagen por IA; usa la fotografía RAW real del producto (te divina c tasa.jpeg) vía HyperFrames.',
  negativePrompt: 'no modificar la fotografía real del producto, no mencionar dependencia ni diagnóstico, no lenguaje de promesa absoluta.',
  sceneDescription: 'Fotografía real del producto TéDivina con overlay de hook y CTA (HyperFrames, video-production/src/hyperframesRenderer.js).',
  subjectDescription: 'Empaque real de TéDivina (bolsitas de té).',
  productPlacement: { description: 'Fotografía RAW real ya registrada (assets/products/te-divina/raw/te divina c tasa.jpeg).' },
  cameraDirection: 'No aplica -- pieza generada digitalmente a partir de una fotografía ya existente, sin sesión de cámara nueva.',
  lightingDirection: 'Paleta de marca fija (Brand Visual System: #0E1E11 / #29361C / #E6DFD0 / #441C11 / #B58C33 / #26231F).',
  screenText: [HOOK_TEXT, CTA_TEXT],
  voiceover: VOICEOVER_TEXT.match(/[^.!?]+[.!?]+/g).map((s) => s.trim()),
  subtitleText: VOICEOVER_TEXT.match(/[^.!?]+[.!?]+/g).map((s) => s.trim()),
  duration: resolved.productionBrief.runtime,
  caption: `${resolved.angle.angleText}. ${CTA_TEXT}`,
  cta: CTA_TEXT,
  whatsappCta: 'Cuéntanos cómo ha sido tu tránsito intestinal y te compartimos opciones.',
  riskyClaims: [],
  hasRealProductReference: true, // sí hay fotografía RAW real disponible.
});
console.log('visualProductionPackageId real (aún no persistido):', visualProductionPackage.visualProductionPackageId);

paso(4, 'POST /api/create real (CAMPAIGN mode) -- persiste ambos objetos vía la API real del dashboard');
const body = {
  mode: 'CAMPAIGN',
  productId: 'te-divina',
  rawText: 'Crear un Reel para Té Divina usando las fotografías reales existentes, la voz oficial y CTA a WhatsApp.',
  hookText: HOOK_TEXT,
  voiceoverText: VOICEOVER_TEXT,
  ctaText: CTA_TEXT,
  imageAssetPath: REAL_PHOTO,
  audioSource: 'existing',
  audioAssetPath: REAL_AUDIO_ASSET_PATH,
  outputProfileNames: ['GENERIC_VERTICAL'],
  productionArtifact,
  visualProductionPackage,
};
const res = await fetch(`${BASE_URL}/api/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const result = await res.json();
console.log('HTTP status:', res.status);
console.log('status real:', result.status);
console.log('errors:', result.errors);
console.log('result.productionArtifact:', result.productionArtifact);
console.log('result.visualProductionPackage:', result.visualProductionPackage);
console.log('lineage (debe traer productionArtifactId/visualProductionPackageId, nunca null):', JSON.stringify(result.lineage, null, 2));

const createOk = res.status === 200 && result.status === 'COMPLETED'
  && result.productionArtifact?.productionArtifactId === productionArtifact.productionArtifactId
  && result.visualProductionPackage?.visualProductionPackageId === visualProductionPackage.visualProductionPackageId
  && result.lineage.every((l) => l.productionArtifactId === productionArtifact.productionArtifactId);
console.log('\n[CHECK] CREATE persiste ProductionArtifact + VisualProductionPackage reales y tagea el lineage:', createOk ? 'PASS' : 'FAIL');

paso(5, 'GET /api/campaigns real -- confirma que la vista Campañas ya no está vacía');
const campaigns = await (await fetch(`${BASE_URL}/api/campaigns`)).json();
const found = campaigns.find((c) => c.productionArtifactId === productionArtifact.productionArtifactId);
console.log('campañas totales listadas:', campaigns.length);
console.log('campaña real encontrada:', JSON.stringify(found, null, 2));

const campaignsOk = !!found
  && found.creativeCellCandidateId === 'CC-DASHBOARD-TEDIVINA-01'
  && found.hypothesisRef === resolved.creativeCell.hypothesisId
  && found.visualProductionPackages.some((p) => p.visualProductionPackageId === visualProductionPackage.visualProductionPackageId);
console.log('\n[CHECK] /api/campaigns muestra la campaña real recién persistida:', campaignsOk ? 'PASS' : 'FAIL');

const ok = createOk && campaignsOk;
console.log('\n=== RESULTADO FINAL:', ok ? 'PASS' : 'FAIL', '===');
process.exitCode = ok ? 0 : 1;
