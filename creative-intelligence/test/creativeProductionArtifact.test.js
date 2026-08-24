import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductionArtifact, validateProductionArtifact, COMMERCIAL_OBJECTIVES, HOOK_TYPES,
  DELIVERY_FORMATS, PRODUCTION_METRICS, BASELINE_NOT_ESTABLISHED, PRODUCTION_ARTIFACT_STATUS,
} from '../production/creativeProductionArtifact.js';

function baseArgs(overrides = {}) {
  return {
    creativeCellCandidateId: 'CC-A1',
    concept: 'Contraste de rutina de café',
    commercialObjective: 'WHATSAPP_CONVERSATION',
    audienceState: 'personas con una rutina de café establecida',
    coreAngle: 'tu café de siempre puede hacer más por ti',
    hook: {
      type: 'CONTRAST', text: 'Cada mañana preparas tu café igual... ¿y si pudiera hacer más por ti?',
      mechanism: 'pattern-interrupt vía contraste de rutina', inspiredByPattern: 'AFFILIATE Pattern CONTRAST (3/7)',
      hypothesisNote: 'no sabemos si un contraste de rutina genera el mismo interés que uno de resultado',
    },
    format: 'SHORT_VIDEO',
    script: { durationRangeSeconds: '15-20s (sugerido, no benchmark)', beats: [{ beat: 'HOOK', content: 'taza de café de siempre' }] },
    postCopy: 'Tu café de siempre puede hacer más por ti. Escríbenos por WhatsApp.',
    cta: { primary: 'Escríbenos por WhatsApp', whatsapp: '¿Quieres conocer más? Escríbenos por WhatsApp.' },
    visualDirection: { setting: 'cocina, luz natural', visualMechanism: 'contraste continuo sin corte a resultado corporal', props: ['sobre del producto', 'taza'] },
    screenText: ['Tu café de siempre...', 'Escríbenos por WhatsApp'],
    staticVersion: { applicable: true, description: 'imagen del empaque + taza, mismo copy' },
    videoVersion: { applicable: true, description: 'script de arriba, 15-20s' },
    whatsappVersion: 'Gracias por escribir, cuéntame qué buscas mejorar en tu día a día.',
    variants: [
      { label: 'Variante A', changedVariable: 'HOOK', description: 'cambia el hook a QUESTION' },
      { label: 'Variante B', changedVariable: 'CTA', description: 'cambia el CTA a comentario' },
    ],
    complianceNotes: { riskLevel: 'MEDIUM', riskReason: 'categoría intimidad/libido' },
    riskyClaims: ['tadalafil/pastilla azul', 'limpia arterias y venas', 'corazón sano', 'aumenta testosterona de forma natural'],
    evidenceBasis: ['AFFILIATE Pattern CONTRAST (3/7)', 'AFFILIATE Pattern WhatsApp (4/7)'],
    productFactsUsed: [{ fact: 'Libido saludable, agudeza mental, antioxidante', source: 'docs/productos/02-cafe-divina/tongkat-ali-cafe.md' }],
    productFactsRequired: [],
    hypothesisRef: 'H-01',
    primaryMetric: 'whatsapp_conversations',
    discardCriteria: { metric: 'whatsapp_conversations', threshold: BASELINE_NOT_ESTABLISHED, description: 'sin baseline propio todavía' },
    customerEvidenceRequired: true,
    ...overrides,
  };
}

describe('createProductionArtifact — forma y campos obligatorios', () => {
  test('construye un artefacto real con status DRAFT_FOR_REVIEW fijo', () => {
    const a = createProductionArtifact(baseArgs());
    assert.equal(a.status, PRODUCTION_ARTIFACT_STATUS);
    assert.equal(a.status, 'DRAFT_FOR_REVIEW');
    assert.equal(a.creativeCellCandidateId, 'CC-A1');
    assert.equal(a.customerEvidenceRequired, true);
  });

  test('rechaza commercialObjective fuera del enum', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ commercialObjective: 'SALES_PROVEN' })), /commercialObjective/);
  });

  test('rechaza hook.type fuera del enum', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ hook: { ...baseArgs().hook, type: 'SHOCK' } })), /hook\.type/);
  });

  test('rechaza format fuera de DELIVERY_FORMATS', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ format: 'BILLBOARD' })), /"format" inválido/);
  });

  test('rechaza primaryMetric que no sea una métrica observable real (ej. "roas")', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ primaryMetric: 'roas' })), /primaryMetric/);
  });

  test('acepta las métricas reales listadas', () => {
    for (const m of PRODUCTION_METRICS) {
      const a = createProductionArtifact(baseArgs({ primaryMetric: m }));
      assert.equal(a.primaryMetric, m);
    }
  });

  test('rechaza menos de 2 variantes', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ variants: [baseArgs().variants[0]] })), /al menos 2 variantes/);
  });

  test('rechaza una variante con changedVariable inválido', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ variants: [{ label: 'A', changedVariable: 'EVERYTHING', description: 'x' }, baseArgs().variants[1]] })));
  });

  test('rechaza discardCriteria con un threshold inventado (no string, no BASELINE_NOT_ESTABLISHED)', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ discardCriteria: { metric: 'saves', threshold: 42, description: 'x' } })));
  });

  test('rechaza customerEvidenceRequired ausente/no-booleano', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ customerEvidenceRequired: undefined })), /customerEvidenceRequired/);
  });

  test('rechaza audienceState con forma de personaId/painId real (UUID)', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ audienceState: 'a1b2c3d4-e5f6-47a8-9012-abcdef123456' })), /forma de personaId\/painId/);
  });

  test('productFactsUsed exige fact + source; rechaza un source vacío', () => {
    assert.throws(() => createProductionArtifact(baseArgs({ productFactsUsed: [{ fact: 'algo', source: '' }] })));
  });
});

describe('Guards de compliance reutilizados (no duplicados)', () => {
  test('rechaza un hookText que reproduce un claim de riesgo real del afiliado', () => {
    const args = baseArgs();
    args.hook = { ...args.hook, text: 'Prueba esto: tadalafil/pastilla azul, mejor que cualquier medicamento.' };
    assert.throws(() => createProductionArtifact(args), /claim de riesgo de compliance/);
  });

  test('rechaza un postCopy que reproduce "limpia arterias y venas"', () => {
    const args = baseArgs();
    args.postCopy = 'Este café limpia arterias y venas.';
    assert.throws(() => createProductionArtifact(args), /claim de riesgo de compliance/);
  });

  test('rechaza lenguaje de promesa absoluta ("garantizado")', () => {
    const args = baseArgs();
    args.postCopy = 'Resultado garantizado en 7 días.';
    assert.throws(() => createProductionArtifact(args), /lenguaje de promesa absoluta/);
  });

  test('rechaza "te va a funcionar"', () => {
    const args = baseArgs();
    args.cta = { ...args.cta, primary: 'Escríbenos, te va a funcionar.' };
    assert.throws(() => createProductionArtifact(args), /lenguaje de promesa absoluta/);
  });

  test('rechaza que el artefacto contenga WINNER/VALIDATED/PROVEN (assertNoWinnerClaim reutilizado)', () => {
    const args = baseArgs({ concept: 'Concepto VALIDATED por el mercado' });
    assert.throws(() => createProductionArtifact(args), /VALIDATED/);
  });

  test('sin riskyClaims (no arreglo) se rechaza explícitamente — nunca se asume vacío', () => {
    const args = baseArgs({ riskyClaims: undefined });
    assert.throws(() => createProductionArtifact(args), /riskyClaims/);
  });
});

describe('validateProductionArtifact', () => {
  test('revalida un artefacto ya construido, exige riskyClaims explícito', () => {
    const a = createProductionArtifact(baseArgs());
    assert.equal(validateProductionArtifact(a, baseArgs().riskyClaims), true);
    assert.throws(() => validateProductionArtifact(a, undefined), /riskyClaims/);
  });
});

describe('Vocabularios exportados', () => {
  test('COMMERCIAL_OBJECTIVES no está limitado a education', () => {
    assert.ok(!COMMERCIAL_OBJECTIVES.includes('EDUCATION'));
    assert.ok(COMMERCIAL_OBJECTIVES.includes('WHATSAPP_CONVERSATION'));
    assert.ok(COMMERCIAL_OBJECTIVES.includes('SALE_INTENT'));
  });

  test('HOOK_TYPES incluye EDUCATION como mecanismo de hook, no como objetivo', () => {
    assert.ok(HOOK_TYPES.includes('EDUCATION'));
  });
});
