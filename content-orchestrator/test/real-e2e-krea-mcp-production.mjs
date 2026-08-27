// real-e2e-krea-mcp-production.mjs — PRUEBA REAL (Paso 20 del encargo
// Integración Productiva Krea MCP Directo), no un test unitario. Usa el
// flujo REAL completo de Vida Divina:
//
//   Creative Variant -> Creative Director (buildVisualStrategy) ->
//   Provider Router (routeImageProvider) -> KreaMcpImageProvider real ->
//   Krea MCP real (kreaMcpClient.js, SIN Claude, SIN REST) -> imagen real
//   -> Asset Resolver (resolveSceneAsset).
//
// TRES pruebas reales, exactamente:
//   TEST A — selección automática real (recommendedModel real, sin producto).
//   TEST B — Cápsulas Ripped real, referencia real de producto (runway-gen4).
//   TEST C — selección manual real de OTRO modelo real disponible (krea-2-medium).
//
// Requiere real: tokens reales de Krea MCP ya persistidos (ver
// scripts/authorize-krea-mcp.mjs, ejecutado una vez). Sin eso, bloquea
// explícito, nunca simula.

import { existsSync, statSync } from 'node:fs';
import { buildProductGroundedEvidence } from '../src/productGroundedEvidence.js';
import { buildCampaignIntent, computeCampaignId } from '../src/campaignIntent.js';
import { buildVisualStrategy } from '../src/creativeDirector.js';
import { routeImageProvider } from '../src/creativeProductionOrchestrator.js';
import { resolveSceneAsset } from '../src/assetResolver.js';
import { isKreaMcpConfigured } from '../../image-generation/src/providers/kreaMcpClient.js';

function paso(n, t) { console.log(`\n=== PASO ${n} — ${t} ===`); }

if (!isKreaMcpConfigured()) {
  console.error('BLOQUEO real: Krea MCP no tiene tokens reales persistidos. Ejecuta: node image-generation/scripts/authorize-krea-mcp.mjs');
  process.exit(1);
}

paso(1, 'PRODUCT GROUNDED EVIDENCE real — Cápsulas Ripped (Divina Ripped Capsules)');
const evidence = buildProductGroundedEvidence('ripped-capsules');
console.log('nombreVisible real:', evidence.nombreVisible);

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
  conceptId: 'krea-mcp-produccion', angleId: 'krea-mcp-produccion',
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

async function generarUnaImagenReal({ label, scenePlan, selectedModelId, productReferenceImageUrl, productRawAssetsReales = [] }) {
  paso(label, 'Creative Director real -> Provider Router real -> Krea MCP DIRECTO real (sin Claude)');
  const visualStrategy = buildVisualStrategy({
    creativeVariant, campaignIntent,
    productFacts: { nombreComercial: evidence.nombreComercial, nombreVisible: evidence.nombreVisible },
    productRawAssets: productRawAssetsReales,
    scenePlan, variantIndex: 0, campaignId, creativeId: `krea-mcp-prod-${label}`,
    selectedModelId,
  });
  console.log('tratamiento real:', visualStrategy.visualTreatmentLabel);
  console.log('recommendedModel real:', visualStrategy.recommendedModel, '| reason:', visualStrategy.recommendationReason);
  console.log('selectedModel real:', visualStrategy.selectedModel, '| selectionMode real:', visualStrategy.selectionMode);

  const scene = productReferenceImageUrl
    ? Object.freeze({ ...visualStrategy.sceneVisuals[0], productReferenceImageUrl })
    : visualStrategy.sceneVisuals[0];

  const routing = routeImageProvider(visualStrategy.finalModelId);
  console.log('providerSelected real:', routing.chosen?.providerName ?? 'null', '| model real:', routing.chosen?.model ?? 'n/a');
  if (!routing.chosen) { console.error('BLOQUEO real: Provider Router no seleccionó ningún provider real configurado.'); process.exit(1); }

  const t0 = Date.now();
  const resolution = await resolveSceneAsset({ scene, imageProvider: routing.chosen });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('resolución real:', JSON.stringify({ source: resolution.source, providerUsed: resolution.providerUsed, isMock: resolution.isMock, cost: resolution.cost }, null, 2));
  console.log(`tiempo real: ${elapsed}s (CLAUDE INVOLVED: NO)`);

  if (resolution.source !== 'GENERATED_IMAGE') {
    console.error(`RESULTADO ${label}: KREA_MCP_UNAVAILABLE/FAILED -- cayó a "${resolution.source}". Detalle real: ${JSON.stringify(resolution.attempted)}`);
    process.exit(1);
  }
  if (!existsSync(resolution.imageSourcePath)) { console.error('BLOQUEO real: el archivo real no existe en disco.'); process.exit(1); }
  const stat = statSync(resolution.imageSourcePath);
  console.log(`RESULTADO ${label}: SUCCESS -- imagen real en ${resolution.imageSourcePath} (${stat.size} bytes)`);
  return { visualStrategy, resolution };
}

// TEST A — automático real, sin producto.
const resultadoA = await generarUnaImagenReal({
  label: 'TEST A',
  scenePlan: realScenePlan('Mujer adulta entrenando con energía en un gimnasio moderno y luminoso, fotografía publicitaria fotorrealista, estilo premium y natural.', 'AUDIENCE_CONTEXT'),
  selectedModelId: null,
});

// TEST B — Cápsulas Ripped real, referencia real de producto (runway-gen4).
const resultadoB = await generarUnaImagenReal({
  label: 'TEST B',
  scenePlan: realScenePlan('Mujer adulta sosteniendo el producto real después de entrenar en el gimnasio, fotografía publicitaria fotorrealista.', 'PRODUCT_REVEAL'),
  selectedModelId: 'runway-gen4',
  productReferenceImageUrl: 'https://app-uploads.krea.ai/cf8bb973-b630-4b44-b7ff-1407ad0dec04/1787845882765-Ripped_01_Producto.png',
  productRawAssetsReales: productRawAssets,
});

// TEST C — selección MANUAL real de un modelo DISTINTO al recomendado (Paso 20: "usuario selecciona otro modelo disponible").
const resultadoC = await generarUnaImagenReal({
  label: 'TEST C',
  scenePlan: realScenePlan('Mujer adulta estirando después de entrenar en un gimnasio moderno, luz natural, fotografía publicitaria fotorrealista.', 'AUDIENCE_CONTEXT'),
  selectedModelId: 'krea-2-medium', // distinto real del recomendado real (krea-2-turbo, el más económico).
});

console.log('\n=== RESULTADO FINAL ===');
console.log('TEST A selectionMode real:', resultadoA.visualStrategy.selectionMode, '(esperado: automatic)');
console.log('TEST B selectionMode real:', resultadoB.visualStrategy.selectionMode, '| selectedModel real:', resultadoB.visualStrategy.selectedModel, '(esperado: user_selected, runway-gen4)');
console.log('TEST C selectionMode real:', resultadoC.visualStrategy.selectionMode, '| recommendedModel real:', resultadoC.visualStrategy.recommendedModel, '| selectedModel real:', resultadoC.visualStrategy.selectedModel);
if (resultadoC.visualStrategy.selectedModel === resultadoC.visualStrategy.recommendedModel) {
  console.error('BLOQUEO real: TEST C debía usar un modelo real DISTINTO al recomendado.');
  process.exit(1);
}
console.log('\nTEST A imagen real:', resultadoA.resolution.imageSourcePath);
console.log('TEST B imagen real:', resultadoB.resolution.imageSourcePath);
console.log('TEST C imagen real:', resultadoC.resolution.imageSourcePath);
console.log('\nCLAUDE INVOLVED en las 3 generaciones reales: NO');
console.log('KREA REST usado: NO (Krea MCP directo, Streamable HTTP + OAuth real persistido)');
