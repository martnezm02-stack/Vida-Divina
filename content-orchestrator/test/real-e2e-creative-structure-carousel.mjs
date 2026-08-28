// real-e2e-creative-structure-carousel.mjs — PRUEBA REAL de extremo a
// extremo del Creative Structure Engine (CARRUSEL), Paso 25 del encargo.
// Pipeline real: buildCreativeProposal (Creative Intelligence real) ->
// Creative Structure Engine real (userIntent real influye la estructura) ->
// buildCarouselSlidesContent real (contenido 100% real, solo etiquetado
// por función narrativa) -> generateContent (CAROUSEL, render real de
// HyperFrames `snapshot`). Volumen mínimo: 1 carrusel real, 5 slides.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProductGroundedEvidence } from '../src/productGroundedEvidence.js';
import { buildHypothesisExperiment } from '../src/hypothesisCreativeEngine.js';
import { loadProductFacts } from '../src/productFactsLoader.js';
import { buildCreativeStructure } from '../src/creativeStructureEngine.js';
import { buildCarouselSlidesContent } from '../src/carouselCompositor.js';
import { generateContent } from '../src/contentGenerationEngine.js';
import { parseContentGenerationRequest } from '../src/contentGenerationRequest.js';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUTPUT_DIR = join(PROJECT_ROOT, 'video-production', 'real-e2e-creative-structure-carousel');

const PRODUCT_ID = 'ripped-capsules';
const USER_INTENT = 'Quiero explicar tres aspectos importantes de Cápsulas Ripped para personas que entrenan.';

function paso(n, t) { console.log(`\n=== PASO ${n} — ${t} ===`); }

paso(1, 'CREATIVE FACTORY real (Hypothesis Experiment real) — Cápsulas Ripped');
const evidence = buildProductGroundedEvidence(PRODUCT_ID);
if (!evidence) { console.error(`BLOQUEO real: sin Product Facts reales para "${PRODUCT_ID}".`); process.exit(1); }
const experiment = buildHypothesisExperiment({ productGroundedEvidence: evidence, variantCount: 3 });
if (experiment.status !== 'HYPOTHESIS_EXPERIMENT_READY') { console.error(`BLOQUEO real: ${experiment.reason}`); process.exit(1); }
const variant = experiment.variantsDetail[0];
const proposal = { hook: variant.copy.hook, cta: variant.copy.cta, product: { productId: PRODUCT_ID } };
console.log(`  hook real: ${proposal.hook}`);
console.log(`  cta real: ${proposal.cta}`);

paso(2, 'CREATIVE STRUCTURE ENGINE real — recomendación con userIntent real explícita (educación)');
const facts = loadProductFacts(proposal.product.productId);
const creativeStructure = buildCreativeStructure({ userInstruction: USER_INTENT, productFacts: facts, contentType: 'CAROUSEL' });
console.log(`  estructura recomendada real: ${creativeStructure.structureId} (${creativeStructure.recommendedStructure.label})`);
console.log(`  razón real: ${creativeStructure.recommendationReason}`);
if (creativeStructure.structureId !== 'HOOK_EDUCATION_PRODUCT_CTA') {
  console.error('BLOQUEO real: una instrucción real de "explicar aspectos importantes" debería recomendar la estructura de educación.');
  process.exit(1);
}

paso(3, 'CAROUSEL COMPOSITOR real — 5 slides reales, función narrativa real por slide');
const content = buildCarouselSlidesContent({ hook: proposal.hook, cta: proposal.cta, productFacts: facts, slideCount: 5, creativeStructure });
console.log(`  slides reales: ${content.actualSlideCount}`);
content.slides.forEach((s, i) => console.log(`    Slide ${i + 1}/${content.actualSlideCount} [${s.stage}]: ${s.headline}${s.body ? ` — ${s.body}` : ''}`));

paso(4, 'RENDER REAL — CAROUSEL (HyperFrames snapshot real)');
mkdirSync(OUTPUT_DIR, { recursive: true });
const request = parseContentGenerationRequest({ rawText: `Carrusel de ${proposal.product.productId}.`, productId: proposal.product.productId, forcedMode: 'CAROUSEL' });
const projectDir = join(OUTPUT_DIR, 'carousel-1');
const result = generateContent(request, { slides: content.slides, projectDir });
console.log(`  status real: ${result.status}`);
console.log(`  outputAssets reales: ${result.outputAssets.length}`);

paso(5, 'VERIFICACIÓN — estructura seleccionada, número de slides correcto, función narrativa real por slide, render real');
const ok = result.status !== 'RENDER_FAILED' && result.status !== 'VALIDATION_FAILED'
  && result.outputAssets.length === content.actualSlideCount
  && content.slides.every((s) => typeof s.stage === 'string' && s.stage.length > 0);

console.log('\n=== RESULTADO FINAL ===');
console.log(ok ? 'OK — Creative Structure Engine real confirmado (carrusel).' : 'FALLÓ una o más verificaciones reales.');
if (!ok) process.exit(1);
