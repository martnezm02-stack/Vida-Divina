// real-e2e-krea-mcp-validation.mjs — PRUEBA REAL (Paso 14/15 del encargo
// Krea MCP + Catálogo Real de Modelos), no un test unitario. Exactamente
// DOS imágenes reales:
//
//   TEST A — Creative Director recomienda automáticamente (selectionMode
//   "automatic") -> Provider Router -> Krea MCP real (vía
//   kreaMcpImageProvider.js, sin REST, sin KREA_API_TOKEN) -> 1 imagen real.
//
//   TEST B — Selección manual real del usuario (runway-gen4,
//   selectionMode "user_selected") + referencia real de producto (Cápsulas
//   Ripped) -> Krea MCP real -> 1 imagen real con product grounding real.
//
// Requiere real: `claude` CLI en PATH + Krea MCP real Connected para este
// proyecto (`claude mcp get krea`). Sin eso, bloquea explícitamente, nunca
// simula.

import { existsSync, statSync } from 'node:fs';
import { buildProductGroundedEvidence } from '../src/productGroundedEvidence.js';
import { buildCampaignIntent, computeCampaignId } from '../src/campaignIntent.js';
import { buildVisualStrategy } from '../src/creativeDirector.js';
import { routeImageProvider } from '../src/creativeProductionOrchestrator.js';
import { resolveSceneAsset } from '../src/assetResolver.js';

function paso(n, t) { console.log(`\n=== PASO ${n} — ${t} ===`); }

paso(1, 'PRODUCT GROUNDED EVIDENCE real — Cápsulas Ripped (Divina Ripped Capsules)');
const evidence = buildProductGroundedEvidence('ripped-capsules');
console.log('nombreVisible:', evidence.nombreVisible);

const { getProduct } = await import('../../dashboard/server/lib/productCatalog.js');
const product = getProduct('ripped-capsules');
const productRawAssets = (product?.rawAssets ?? []).filter((a) => !a.error);
console.log('assets reales:', productRawAssets.map((a) => a.originalFilename ?? a.sourcePath));

const campaignIntent = buildCampaignIntent({
  productId: 'ripped-capsules',
  targetAudience: 'mujeres adultas que entrenan en el gimnasio',
  problemOrNeed: 'baja masa muscular y envejecimiento prematuro',
  campaignTerritory: 'energía y fuerza reales para entrenar en el gimnasio',
  campaignObjective: 'engagement',
  awarenessStage: 'Problem Aware',
});
const campaignId = computeCampaignId(campaignIntent);
const creativeVariant = Object.freeze({
  conceptId: 'krea-mcp-validation', angleId: 'krea-mcp-validation',
  creativeVariant: Object.freeze({ format: 'Static image' }),
});

function realScenePlan(narration, visualIntent) {
  return Object.freeze({
    totalDurationSeconds: 5, styleCategory: 'LIFESTYLE',
    scenes: Object.freeze([Object.freeze({
      sceneId: 'scene-1', sectionType: 'HOOK', startSeconds: 0, duration: 5,
      narration, visualPrompt: narration, visualIntent, visualType: 'TYPOGRAPHIC',
      textOverlay: null, transition: 'NONE', audioIntent: 'VOICEOVER_SEGMENT',
      assetRequirements: Object.freeze({}),
    })]),
    sceneCountByVisualType: Object.freeze({ TYPOGRAPHIC: 1 }),
    allScenesShowProduct: false,
  });
}

async function generarUnaImagenReal({ label, scenePlan, selectedModelId, productReferenceImageUrl, expectTreatment }) {
  paso(label, `Creative Director real -> Provider Router real -> Krea MCP real`);
  const visualStrategy = buildVisualStrategy({
    creativeVariant, campaignIntent,
    productFacts: { nombreComercial: evidence.nombreComercial, nombreVisible: evidence.nombreVisible },
    productRawAssets: selectedModelId === 'runway-gen4' ? productRawAssets : [],
    scenePlan, variantIndex: 0, campaignId, creativeId: `krea-mcp-validation-${label}`,
    selectedModelId,
  });
  console.log('tratamiento real:', visualStrategy.visualTreatmentLabel);
  console.log('recommendedModel real:', visualStrategy.recommendedModel, '| reason:', visualStrategy.recommendationReason);
  console.log('selectedModel real:', visualStrategy.selectedModel, '| selectionMode real:', visualStrategy.selectionMode);
  if (expectTreatment) console.log(`(nota: treatment esperado no forzado -- rotación real determinista por campaignId/variantIndex)`);

  const scene = productReferenceImageUrl
    ? Object.freeze({ ...visualStrategy.sceneVisuals[0], productReferenceImageUrl })
    : visualStrategy.sceneVisuals[0];

  const routing = routeImageProvider(visualStrategy.finalModelId);
  console.log('providerSelected real:', routing.chosen?.providerName ?? 'null', '| model real:', routing.chosen?.model ?? 'n/a');
  console.log('reason real:', routing.reason);
  if (!routing.chosen) { console.error('BLOQUEO real: Provider Router no seleccionó ningún provider real configurado.'); process.exit(1); }

  const t0 = Date.now();
  const resolution = await resolveSceneAsset({ scene, imageProvider: routing.chosen });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('resolución real:', JSON.stringify({ source: resolution.source, providerUsed: resolution.providerUsed, isMock: resolution.isMock, cost: resolution.cost }, null, 2));
  console.log(`tiempo real: ${elapsed}s`);

  if (resolution.source !== 'GENERATED_IMAGE') {
    console.error(`RESULTADO ${label}: KREA_MCP_FAILED -- cayó a "${resolution.source}". Detalle real: ${JSON.stringify(resolution.attempted)}`);
    process.exit(1);
  }
  if (!existsSync(resolution.imageSourcePath)) { console.error('BLOQUEO real: el archivo real no existe en disco.'); process.exit(1); }
  const stat = statSync(resolution.imageSourcePath);
  console.log(`RESULTADO ${label}: SUCCESS -- imagen real en ${resolution.imageSourcePath} (${stat.size} bytes)`);
  return { visualStrategy, resolution };
}

const resultadoA = await generarUnaImagenReal({
  label: 'TEST A',
  scenePlan: realScenePlan('Mujer adulta entrenando con energía en un gimnasio moderno y luminoso, fotografía publicitaria fotorrealista, estilo premium y natural.', 'AUDIENCE_CONTEXT'),
  selectedModelId: null, // automático real -- selectionMode debe ser "automatic".
});

const resultadoB = await generarUnaImagenReal({
  label: 'TEST B',
  scenePlan: realScenePlan('Mujer adulta sosteniendo el producto real después de entrenar en el gimnasio, fotografía publicitaria fotorrealista.', 'PRODUCT_REVEAL'),
  selectedModelId: 'runway-gen4', // manual real -- selectionMode debe ser "user_selected".
  productReferenceImageUrl: 'https://app-uploads.krea.ai/cf8bb973-b630-4b44-b7ff-1407ad0dec04/1787845882765-Ripped_01_Producto.png',
});

console.log('\n=== RESULTADO FINAL ===');
console.log('TEST A selectionMode real:', resultadoA.visualStrategy.selectionMode, '(esperado: automatic)');
console.log('TEST B selectionMode real:', resultadoB.visualStrategy.selectionMode, '(esperado: user_selected)');
console.log('TEST A imagen real:', resultadoA.resolution.imageSourcePath);
console.log('TEST B imagen real:', resultadoB.resolution.imageSourcePath);
console.log('Verificación visual del product grounding de TEST B: pendiente de revisión manual (ver archivo real arriba).');
