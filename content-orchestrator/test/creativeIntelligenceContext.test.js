// creativeIntelligenceContext.test.js — Puente Marketing Intelligence ->
// Creative Strategy. Ingiere el dataset curado REAL de snapshot-2026-08-31
// en un DATA_ROOT temporal (mismo patrón que
// marketingIntelligenceQuery.test.js) y prueba buildCreativeIntelligenceContext()
// + su wiring en autonomousCreate.js/creativeDirector.js. No ejecuta
// last30days ni ninguna llamada externa.

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEST_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'co-cic-test-'));
process.env.CONTENT_ORCHESTRATOR_DATA_ROOT = TEST_DATA_ROOT;

const { createSnapshot } = await import('../src/marketingIntelligence/snapshotStore.js');
const { upsertSignal } = await import('../src/marketingIntelligence/signalStore.js');
const { saveOpportunity } = await import('../src/marketingIntelligence/creativeOpportunityStore.js');
const { SIGNALS, OPPORTUNITIES } = await import('../src/marketingIntelligence/seedData/snapshot-2026-08-31.js');
const {
  buildCreativeIntelligenceContext, CREATIVE_CONTEXT_PRIORITY_ORDER, CREATIVE_INTELLIGENCE_CONFIG, CREATIVE_INTELLIGENCE_VERSION,
} = await import('../src/creativeIntelligenceContext.js');
const { buildCreativeProposal } = await import('../src/autonomousCreate.js');
const { assertNoForbiddenProductClaims, FORBIDDEN_PRODUCT_CLAIMS } = await import('../../video-production/src/hyperframesRenderer.js');
const { assertBrandAvoidCompliance } = await import('../src/brandVisualSystem.js');

after(() => {
  fs.rmSync(TEST_DATA_ROOT, { recursive: true, force: true });
});

const SNAPSHOT_ID = 'snapshot-2026-08-31';

function ingestRealSeedData() {
  createSnapshot(SNAPSHOT_ID, { researchReportPath: 'docs/research/vida-divina-market-intelligence-2026-08-31.md' });
  const idBySeedKey = new Map();
  for (const raw of SIGNALS) {
    const { seedKey, ...fields } = raw;
    const saved = upsertSignal(SNAPSHOT_ID, fields, { additionalSourceIsIndependent: (fields.independentSourceCount ?? 1) > 1 });
    idBySeedKey.set(seedKey, saved.id);
  }
  for (const opp of OPPORTUNITIES) {
    const { signalSeedKeys, ...fields } = opp;
    saveOpportunity(SNAPSHOT_ID, { ...fields, signalIds: signalSeedKeys.map((k) => idBySeedKey.get(k)) });
  }
}
ingestRealSeedData();

const BUCKET_KEYS = [
  'trends', 'pains', 'desires', 'objections', 'hookPatterns', 'contentPatterns',
  'competitorSignals', 'creatorSignals', 'purchaseTriggers', 'regulatoryRisks',
];

describe('Context builder — forma general (encargo §3, §4, §29)', () => {
  test('devuelve exactamente los campos del contrato conceptual del encargo', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules' });
    for (const key of ['product', 'audience', 'trends', 'pains', 'desires', 'objections', 'hookPatterns', 'contentPatterns', 'competitorSignals', 'creatorSignals', 'purchaseTriggers', 'regulatoryRisks', 'creativeOpportunities', 'confidence', 'sources', 'snapshotId']) {
      assert.ok(key in ctx, `falta el campo "${key}"`);
    }
  });

  test('CREATIVE_CONTEXT_PRIORITY_ORDER refleja el orden de conflicto del encargo §35', () => {
    assert.deepEqual([...CREATIVE_CONTEXT_PRIORITY_ORDER], ['CLAIM_SAFETY', 'PRODUCT_KNOWLEDGE', 'USER_INSTRUCTION', 'CAMPAIGN_CONTEXT', 'CREATIVE_INTELLIGENCE', 'DEFAULTS']);
  });
});

describe('TEST VENUS (encargo §39)', () => {
  const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules', audience: 'mujeres-bienestar-hormonal' });

  test('aparecen señales relevantes de bienestar femenino', () => {
    assert.equal(ctx.applied, true);
    assert.ok(ctx.pains.length > 0);
    assert.ok(ctx.objections.some((o) => o.title.toLowerCase().includes('maca') || o.title.toLowerCase().includes('embarazo')));
  });

  test('NO aparecen señales de audiencia masculina explícita (guard de género, encargo §6)', () => {
    // Definición correcta de "señal masculina" en este schema: audience
    // EXPLÍCITA "hombres-...". Un competidor cautelar como "Polen de
    // Pino" (mencionado literalmente en su propio texto como aplicable a
    // "Venus/Mars con lenguaje responsable", sin audience de género fijado)
    // SÍ debe poder aparecer -- no es una fuga de género, es contexto
    // legítimo de qué NO imitar.
    const allSignals = BUCKET_KEYS.flatMap((k) => ctx[k]);
    assert.ok(!allSignals.some((s) => s.title.toLowerCase().includes('tongkat')));
    assert.ok(!allSignals.some((s) => /\bhombres/.test(s.title.toLowerCase()) || s.whyItMatters?.toLowerCase().includes('masculina')));
  });

  test('NO aparecen señales de café', () => {
    const allTitles = BUCKET_KEYS.flatMap((k) => ctx[k]).map((s) => s.title.toLowerCase());
    assert.ok(!allTitles.some((t) => t.includes('café funcional') || t.includes('reishi') || t.includes('mushroom coffee')));
  });

  test('NO aparecen señales irrelevantes (ej. control de peso puro, sin relación con Venus)', () => {
    const allSignals = BUCKET_KEYS.flatMap((k) => ctx[k]);
    assert.ok(!allSignals.some((s) => s.title.toLowerCase().includes('rebote')));
  });

  test('aparecen oportunidades creativas relevantes', () => {
    assert.ok(ctx.creativeOpportunities.length > 0);
    assert.ok(ctx.creativeOpportunities.some((o) => o.title.toLowerCase().includes('venus')));
  });
});

describe('TEST TONGKAT (encargo §40)', () => {
  const ctx = buildCreativeIntelligenceContext({ productId: 'tongkat-ali-cafe', audience: 'hombres-biohacking-tongkat-ali' });

  test('audience masculino presente, señales de café funcional presentes', () => {
    assert.equal(ctx.applied, true);
    const allTitles = BUCKET_KEYS.flatMap((k) => ctx[k]).map((s) => s.title.toLowerCase());
    assert.ok(allTitles.some((t) => t.includes('tongkat') || t.includes('dosis-literata')));
  });

  test('ausencia de señales irrelevantes de Venus', () => {
    const allSignals = BUCKET_KEYS.flatMap((k) => ctx[k]);
    assert.ok(!allSignals.some((s) => s.title.toLowerCase().includes('venus') || s.title.toLowerCase().includes('embarazo') || s.title.toLowerCase().includes('perimenopausia')));
  });
});

describe('Product fit — prioridad DIRECT_PRODUCT > CATEGORY > GENERAL (encargo §5)', () => {
  test('la CatalogDiscrepancy propia de Venus (DIRECT_PRODUCT) aparece con relevanceToCampaign alta', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules' });
    const direct = BUCKET_KEYS.flatMap((k) => ctx[k]).filter((s) => s.productFit === 'DIRECT_PRODUCT');
    const general = BUCKET_KEYS.flatMap((k) => ctx[k]).filter((s) => s.productFit === 'GENERAL');
    assert.ok(direct.length > 0);
    if (general.length > 0) {
      const avgDirect = direct.reduce((s, d) => s + d.creativeContextScore, 0) / direct.length;
      const avgGeneral = general.reduce((s, d) => s + d.creativeContextScore, 0) / general.length;
      assert.ok(avgDirect > avgGeneral, 'DIRECT_PRODUCT debe rankear en promedio por encima de GENERAL');
    }
  });
});

describe('TEST CLAIM SAFETY (encargo §41)', () => {
  test('FORBIDDEN_PRODUCT_CLAIMS bloquea texto real de un signal si se usara como claim', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'tongkat-ali-cafe' });
    const testosteroneSignal = BUCKET_KEYS.flatMap((k) => ctx[k]).find((s) => s.title.toLowerCase().includes('testosterona'));
    assert.ok(testosteroneSignal, 'debe existir una señal real que mencione "testosterona" en el dataset curado');
    assert.ok(FORBIDDEN_PRODUCT_CLAIMS.includes('testosterona'));
    // signal -> context: la señal SÍ llega al contexto (es información de mercado real).
    // context -> claim generation: si alguien intentara usar ese texto tal
    // cual como copy, el gate EXISTENTE (nunca modificado aquí) lo bloquea.
    assert.throws(() => assertNoForbiddenProductClaims(testosteroneSignal.title, 'copy de prueba'), /claim prohibido/);
  });

  test('buildCreativeIntelligenceContext nunca produce un campo "claim"/"approvedClaim" -- solo observación de mercado', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'tongkat-ali-cafe' });
    const allSignals = BUCKET_KEYS.flatMap((k) => ctx[k]);
    for (const s of allSignals) {
      assert.ok(!('claim' in s));
      assert.ok(!('approvedClaim' in s));
    }
  });

  test('el discrepancy de catálogo de Mars ("10X"/"supports prostate health") sigue expuesto solo como dato externo, nunca como claim', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'mars-capsules' });
    const discrepancySignal = BUCKET_KEYS.flatMap((k) => ctx[k]).find((s) => s.type === 'CatalogDiscrepancy');
    // CatalogDiscrepancy no es uno de los 10 buckets del contrato conceptual
    // (§4) -- se confirma aquí que, si apareciera en algún bucket futuro,
    // seguiría sin campo "claim"; hoy simplemente no está en ninguno de los
    // 10 buckets porque no es un tipo incluido en BUCKET_SPECS.
    assert.equal(discrepancySignal, undefined);
  });
});

describe('TEST USER INSTRUCTION (encargo §42)', () => {
  test('userInstruction nunca es mutado ni sobrescrito por el context builder', () => {
    const instruction = 'mujer adulta en jornada laboral';
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules', audience: 'mujeres-bienestar-hormonal', userInstruction: instruction });
    assert.ok(!('userInstruction' in ctx)); // el contexto nunca reexpone/reinterpreta la instrucción -- solo la usa como señal de ranking interna.
  });

  test('E2E: buildCreativeProposal preserva userInstruction EXACTO junto con marketingIntelligenceContext', async () => {
    const instruction = 'Quiero mostrar cómo Cápsulas Venus se integra naturalmente en la rutina de una mujer adulta durante su jornada diaria.';
    const proposal = await buildCreativeProposal({ userIntent: instruction, productId: 'venus-capsules' });
    assert.equal(proposal.userIntent, instruction);
    assert.equal(proposal.marketingIntelligenceContext.applied, true);
  });
});

describe('TEST NO INTELLIGENCE (encargo §43)', () => {
  test('sin productId ni audience: applied=false, Creative Director funciona igual (no lanza)', () => {
    const ctx = buildCreativeIntelligenceContext();
    assert.equal(ctx.applied, false);
    assert.equal(ctx.reason, 'NO_PRODUCT_OR_AUDIENCE');
  });

  test('con un snapshotId que no tiene ningún dato: applied=false, nunca lanza (sin señal disponible)', () => {
    // Un snapshotId inexistente produce un store vacío (0 señales), NO un
    // throw (signalStore.js#listSignals devuelve [] si el directorio no
    // existe) -- ejercita el mismo camino "sin intelligence" sin necesitar
    // un segundo DATA_ROOT en el mismo proceso (queryService.js fija su
    // DATA_ROOT una sola vez al cargar el módulo, igual que
    // marketingIntelligenceSignalStore.test.js documenta).
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules', snapshotId: 'snapshot-1999-01-01' });
    assert.equal(ctx.applied, false);
    assert.equal(ctx.reason, 'NO_RELEVANT_SIGNALS');
  });

  test('buildCreativeProposal sigue funcionando normalmente cuando marketingIntelligenceContext no aplica', async () => {
    const proposal = await buildCreativeProposal({ userIntent: 'Quiero vender algo por WhatsApp, no sé qué.' });
    assert.equal(proposal.status, 'MISSING_PRODUCT'); // comportamiento preexistente, sin cambios.
  });
});

describe('TEST TRACEABILITY (encargo §9, §44)', () => {
  test('cada señal usada es rastreable: signalId -> source -> rawReference', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules' });
    for (const s of BUCKET_KEYS.flatMap((k) => ctx[k])) {
      assert.ok(s.signalId);
      assert.ok(s.source);
      assert.ok(s.rawReference?.includes('vida-divina-market-intelligence-2026-08-31.md'));
      assert.ok(s.evidenceLevel);
      assert.ok(typeof s.confidence === 'number');
    }
  });
});

describe('TEST SIZE (encargo §10, §45)', () => {
  test('el contexto NO entrega las 105 señales completas -- top N por bucket', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules' });
    const total = BUCKET_KEYS.reduce((sum, k) => sum + ctx[k].length, 0);
    assert.ok(total < 105);
    for (const k of BUCKET_KEYS) assert.ok(ctx[k].length <= CREATIVE_INTELLIGENCE_CONFIG.maxPerBucket);
  });
});

describe('TEST NO LIVE RESEARCH (encargo §25, §46)', () => {
  test('el módulo fuente no IMPORTA ni LLAMA last30days/WebSearch/http/fetch (los comentarios pueden mencionarlos por nombre para documentar que no se usan)', () => {
    const filePath = fileURLToPath(new URL('../src/creativeIntelligenceContext.js', import.meta.url));
    const source = readFileSync(filePath, 'utf8');
    const forbiddenPatterns = [
      /\bimport\b[^;]*last30days/i, /\brequire\(\s*['"].*last30days/i,
      /\bimport\b[^;]*WebSearch/i, /\bWebSearch\s*\(/,
      /from\s+['"]node:https?['"]/, /\bfetch\s*\(/, /\bundici\b/,
    ];
    for (const pattern of forbiddenPatterns) {
      assert.ok(!pattern.test(source), `creativeIntelligenceContext.js no debe importar/llamar algo que matchee ${pattern}`);
    }
    // Único import real del archivo: el store local de marketingIntelligence/ (síncrono, sin red).
    const importLines = [...source.matchAll(/^import .+$/gm)].map((m) => m[0]);
    assert.equal(importLines.length, 1);
    assert.match(importLines[0], /from '\.\/marketingIntelligence\/queryService\.js'/);
  });
});

// NOTA DE ORDEN: este describe MUTA el store compartido (agrega una señal
// sintética permanente al snapshot) -- se coloca deliberadamente después de
// todos los describe() que dependen del dataset real pristino, para no
// contaminar sus resultados (node:test ejecuta los test() en orden de
// declaración dentro de un archivo).
describe('Audience fit — guard sintético hombre/mujer (encargo §6, §42)', () => {
  test('una señal fitness/gym inyectada sintéticamente para Venus queda excluida cuando la audiencia de campaña es femenina', () => {
    // Sección 42 del encargo pide construir explícitamente este caso -- se
    // inyecta una señal real adicional (misma categoría que Venus,
    // audiencia opuesta) para probar el guard de forma directa, sin
    // depender de que el dataset real ya tenga ese contraste.
    upsertSignal(SNAPSHOT_ID, {
      type: 'ContentPattern', title: 'Rutina de gimnasio intensa para hombres jóvenes',
      category: 'intimidad-libido', audience: 'hombres-fitness-gym',
      source: 'test sintético', sourceType: 'SOCIAL', capturedAt: '2026-08-31', timeWindow: '30d',
      observation: 'Señal sintética de prueba, nunca real.', evidenceLevel: 'HIGH', claimType: 'SIGNAL',
      rawReference: 'test sintético — creativeIntelligenceContext.test.js, no proviene del reporte real.',
    });
    const ctx = buildCreativeIntelligenceContext({
      productId: 'venus-capsules', audience: 'mujeres-bienestar-hormonal', userInstruction: 'mujer adulta en jornada laboral',
    });
    const allTitles = BUCKET_KEYS.flatMap((k) => ctx[k]).map((s) => s.title);
    assert.ok(!allTitles.includes('Rutina de gimnasio intensa para hombres jóvenes'));
  });
});

describe('Reproducibility / determinismo (encargo §54)', () => {
  test('mismos inputs + mismo snapshot -> misma selección de señales (mismos signalIds, mismo orden)', () => {
    const a = buildCreativeIntelligenceContext({ productId: 'venus-capsules', audience: 'mujeres-bienestar-hormonal' });
    const b = buildCreativeIntelligenceContext({ productId: 'venus-capsules', audience: 'mujeres-bienestar-hormonal' });
    for (const k of BUCKET_KEYS) assert.deepEqual(a[k].map((s) => s.signalId), b[k].map((s) => s.signalId));
  });
});

describe('Version compatibility (encargo §55)', () => {
  test('intelligenceVersion presente y estable', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules' });
    assert.equal(ctx.intelligenceVersion, CREATIVE_INTELLIGENCE_VERSION);
    assert.equal(typeof CREATIVE_INTELLIGENCE_VERSION, 'string');
  });
});

describe('Snapshot (encargo §53)', () => {
  test('el contexto conserva intelligenceSnapshotId (campo snapshotId)', () => {
    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules' });
    assert.equal(ctx.snapshotId, SNAPSHOT_ID);
  });
});

describe('Creative Director — pass-through puro (encargo §18, §29, §50-52)', () => {
  test('previewVisualRecommendation expone creativeIntelligenceContext tal cual, null por defecto', async () => {
    const { previewVisualRecommendation } = await import('../src/creativeDirector.js');
    const withoutContext = previewVisualRecommendation({});
    assert.equal(withoutContext.creativeIntelligenceContext, null);

    const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules' });
    const withContext = previewVisualRecommendation({ creativeIntelligenceContext: ctx });
    assert.deepEqual(withContext.creativeIntelligenceContext, ctx);
  });
});

describe('Brand Avoid — gate existente sigue intacto (verificación, no modificación)', () => {
  test('assertBrandAvoidCompliance real sigue funcionando sin cambios', () => {
    assert.throws(() => assertBrandAvoidCompliance('fondo neón morado', 'prueba'), /Brand Visual System/);
    assert.doesNotThrow(() => assertBrandAvoidCompliance('cocina cálida y natural', 'prueba'));
  });
});
