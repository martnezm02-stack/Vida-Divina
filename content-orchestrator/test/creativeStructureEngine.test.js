import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STRUCTURE_CATALOG, LEGACY_STRUCTURE, listCompatibleStructures,
  recommendStructure, selectStructure, alignStagesToCount, buildCreativeStructure, previewStructureOptions,
} from '../src/creativeStructureEngine.js';

describe('STRUCTURE_CATALOG — catálogo real (Paso 3 del encargo)', () => {
  test('máximo 8 estructuras reutilizables', () => {
    assert.ok(STRUCTURE_CATALOG.length <= 8);
  });
  test('toda estructura tiene HOOK/pregunta/mito al inicio y CTA al final', () => {
    for (const s of STRUCTURE_CATALOG) {
      assert.equal(s.stages.at(-1), 'CTA');
      assert.ok(s.stages.length >= 3);
    }
  });
});

describe('recommendStructure — selección de estructura (Paso 6/8 del encargo)', () => {
  test('userInstruction explícita tiene prioridad máxima', () => {
    const r = recommendStructure({
      userInstruction: 'Quiero una mujer adulta entrenando en un gimnasio moderno',
      campaignIntent: { awarenessStage: 'Unaware', campaignObjective: 'awareness' },
      contentType: 'VIDEO',
    });
    assert.equal(r.structureId, 'HOOK_STORY_PRODUCT_CTA');
    assert.equal(r.matchedBy, 'userInstruction');
  });

  test('"quiero explicar tres beneficios" -> estructura de educación', () => {
    const r = recommendStructure({ userInstruction: 'Quiero explicar tres beneficios importantes', contentType: 'VIDEO' });
    assert.equal(r.structureId, 'HOOK_EDUCATION_PRODUCT_CTA');
  });

  test('"quiero mostrar cómo se usa" -> estructura de demostración', () => {
    const r = recommendStructure({ userInstruction: 'Quiero mostrar cómo se usa el producto', contentType: 'VIDEO' });
    assert.equal(r.structureId, 'HOOK_DEMONSTRATION_PRODUCT_CTA');
  });

  test('"quiero contar una experiencia" -> estructura de historia', () => {
    const r = recommendStructure({ userInstruction: 'Quiero contar una experiencia real', contentType: 'VIDEO' });
    assert.ok(['HOOK_STORY_PRODUCT_CTA', 'STORY_INSIGHT_PRODUCT_CTA'].includes(r.structureId));
  });

  test('sin userInstruction, cae a CampaignIntent (Paso 8, prioridad 2)', () => {
    const r = recommendStructure({ campaignIntent: { awarenessStage: 'Unaware', campaignObjective: 'awareness' }, contentType: 'VIDEO' });
    assert.equal(r.structureId, 'QUESTION_EDUCATION_PRODUCT_CTA');
    assert.equal(r.matchedBy, 'campaignIntent');
  });

  test('sin userInstruction ni CampaignIntent, cae a Creative Variant (Paso 8, prioridad 3)', () => {
    const r = recommendStructure({ creativeVariant: { copyStyle: 'STORYTELLING' }, contentType: 'VIDEO' });
    assert.equal(r.structureId, 'HOOK_STORY_PRODUCT_CTA');
    assert.equal(r.matchedBy, 'creativeVariant');
  });

  test('sin ninguna señal real, usa el default de plataforma/contentType', () => {
    const r = recommendStructure({ contentType: 'VIDEO' });
    assert.equal(r.matchedBy, 'default');
    assert.equal(r.structureId, STRUCTURE_CATALOG[0].structureId);
  });

  test('CAROUSEL respeta contentTypes compatibles (nunca recomienda DEMONSTRATION, solo VIDEO)', () => {
    const r = recommendStructure({ contentType: 'CAROUSEL' });
    const found = STRUCTURE_CATALOG.find((s) => s.structureId === r.structureId);
    assert.ok(found.contentTypes.includes('CAROUSEL'));
  });

  test('rechaza contentType desconocido', () => {
    assert.throws(() => recommendStructure({ contentType: 'AUDIO' }));
  });
});

describe('Structure Diversity — previousStructureIds (Corrección "Refinamiento creativo", Paso 10/11/26/37 del encargo)', () => {
  const argsConDosSenales = Object.freeze({
    userInstruction: 'Quiero una mujer adulta entrenando en un gimnasio moderno',
    campaignIntent: { awarenessStage: 'Problem Aware', campaignObjective: 'conversion' },
    contentType: 'VIDEO',
  });

  test('sin previousStructureIds, gana la señal real de mayor prioridad (userInstruction)', () => {
    const r = recommendStructure(argsConDosSenales);
    assert.equal(r.structureId, 'HOOK_STORY_PRODUCT_CTA');
    assert.equal(r.matchedBy, 'userInstruction');
  });

  test('ANGLE/VARIANTE -> STRUCTURE: si la señal real de mayor prioridad ya se usó en otra variante real de la campaña, se salta a la SIGUIENTE señal real real disponible (campaignIntent) -- nunca inventa una señal falsa', () => {
    const r = recommendStructure({ ...argsConDosSenales, previousStructureIds: ['HOOK_STORY_PRODUCT_CTA'] });
    assert.equal(r.structureId, 'HOOK_PROBLEM_SOLUTION_PRODUCT_CTA');
    assert.equal(r.matchedBy, 'campaignIntent');
  });

  test('Paso 27 (coherencia > diversidad): si TODAS las señales reales coincidentes ya se usaron, conserva la de mayor prioridad real -- nunca bloquea ni inventa', () => {
    const soloUnaSenal = { userInstruction: 'Quiero una mujer adulta entrenando en un gimnasio moderno', contentType: 'VIDEO' };
    const r = recommendStructure({ ...soloUnaSenal, previousStructureIds: ['HOOK_STORY_PRODUCT_CTA'] });
    assert.equal(r.structureId, 'HOOK_STORY_PRODUCT_CTA');
  });

  test('buildCreativeStructure/previewStructureOptions real propagan previousStructureIds sin romper el contrato existente', () => {
    const built = buildCreativeStructure({ ...argsConDosSenales, previousStructureIds: ['HOOK_STORY_PRODUCT_CTA'] });
    assert.equal(built.structureId, 'HOOK_PROBLEM_SOLUTION_PRODUCT_CTA');
    const preview = previewStructureOptions({ ...argsConDosSenales, previousStructureIds: ['HOOK_STORY_PRODUCT_CTA'] });
    assert.equal(preview.recommended.structureId, 'HOOK_PROBLEM_SOLUTION_PRODUCT_CTA');
  });
});

describe('selectStructure — override manual (Paso 9 del encargo)', () => {
  test('sin selectedStructureId, selectionMode "automatic"', () => {
    const rec = recommendStructure({ contentType: 'VIDEO' });
    const sel = selectStructure({ recommendation: rec, contentType: 'VIDEO' });
    assert.equal(sel.selectionMode, 'automatic');
    assert.equal(sel.structureId, rec.structureId);
  });

  test('con selectedStructureId distinto, selectionMode "user_selected" y cambia la estructura real', () => {
    const rec = recommendStructure({ contentType: 'VIDEO' });
    const otra = STRUCTURE_CATALOG.find((s) => s.structureId !== rec.structureId);
    const sel = selectStructure({ selectedStructureId: otra.structureId, recommendation: rec, contentType: 'VIDEO' });
    assert.equal(sel.selectionMode, 'user_selected');
    assert.equal(sel.structureId, otra.structureId);
    assert.notEqual(sel.structureId, rec.structureId);
  });

  test('rechaza un structureId inexistente', () => {
    const rec = recommendStructure({ contentType: 'VIDEO' });
    assert.throws(() => selectStructure({ selectedStructureId: 'NO_EXISTE', recommendation: rec, contentType: 'VIDEO' }));
  });

  test('rechaza una estructura real pero incompatible con el contentType pedido', () => {
    const demo = STRUCTURE_CATALOG.find((s) => s.structureId === 'HOOK_DEMONSTRATION_PRODUCT_CTA');
    assert.ok(!demo.contentTypes.includes('CAROUSEL'));
    const rec = recommendStructure({ contentType: 'CAROUSEL' });
    assert.throws(() => selectStructure({ selectedStructureId: demo.structureId, recommendation: rec, contentType: 'CAROUSEL' }));
  });
});

describe('alignStagesToCount — alinea stages a un conteo real de escenas/slides', () => {
  test('mismo conteo, devuelve los stages tal cual', () => {
    assert.deepEqual(alignStagesToCount(['HOOK', 'STORY', 'PRODUCT', 'CTA'], 4), ['HOOK', 'STORY', 'PRODUCT', 'CTA']);
  });
  test('conteo mayor, repite stages intermedios cíclicamente (ej. sección 15 del encargo: EDUCATION x2)', () => {
    const r = alignStagesToCount(['HOOK', 'EDUCATION', 'PRODUCT', 'CTA'], 5);
    assert.equal(r.length, 5);
    assert.equal(r[0], 'HOOK');
    assert.equal(r.at(-1), 'CTA');
    assert.equal(r.filter((s) => s === 'EDUCATION').length, 2);
  });
  test('conteo menor, recorta manteniendo primer y último stage', () => {
    const r = alignStagesToCount(['HOOK', 'PROBLEM', 'INSIGHT', 'PRODUCT', 'CTA'], 3);
    assert.equal(r.length, 3);
    assert.equal(r[0], 'HOOK');
    assert.equal(r.at(-1), 'CTA');
  });
  test('conteo 2, solo primero y último', () => {
    assert.deepEqual(alignStagesToCount(['HOOK', 'STORY', 'PRODUCT', 'CTA'], 2), ['HOOK', 'CTA']);
  });
  test('rechaza stages vacío o count inválido', () => {
    assert.throws(() => alignStagesToCount([], 3));
    assert.throws(() => alignStagesToCount(['HOOK'], 0));
  });
});

describe('buildCreativeStructure — objeto real (Paso 2 del encargo)', () => {
  test('expone el esquema completo esperado', () => {
    const cs = buildCreativeStructure({ contentType: 'VIDEO', userInstruction: 'Quiero explicar tres beneficios' });
    assert.equal(cs.contentType, 'VIDEO');
    assert.ok(Array.isArray(cs.stages));
    assert.equal(typeof cs.rationale, 'string');
    assert.equal(typeof cs.selectionMode, 'string');
    assert.ok(cs.recommendedStructure);
    assert.ok(cs.selectedStructure);
  });

  test('diversidad: dos instrucciones distintas producen dos estructuras distintas', () => {
    const csA = buildCreativeStructure({ contentType: 'VIDEO', userInstruction: 'Quiero mostrar cómo se usa paso a paso' });
    const csB = buildCreativeStructure({ contentType: 'VIDEO', userInstruction: 'Quiero contar una historia real, les cuento que me pasó algo' });
    assert.notEqual(csA.structureId, csB.structureId);
  });

  test('no fuerza diversidad cuando no hay señal real (misma entrada -> misma estructura, determinista)', () => {
    const csA = buildCreativeStructure({ contentType: 'VIDEO' });
    const csB = buildCreativeStructure({ contentType: 'VIDEO' });
    assert.equal(csA.structureId, csB.structureId);
  });
});

describe('previewStructureOptions — vista previa real (Paso 10 del encargo)', () => {
  test('máximo 8 opciones, recomendada primero', () => {
    const preview = previewStructureOptions({ contentType: 'VIDEO' });
    assert.ok(preview.options.length <= 8);
    assert.equal(preview.options[0].structureId, preview.recommended.structureId);
  });
});

describe('LEGACY_STRUCTURE — backward compatibility (Paso 20 del encargo)', () => {
  test('termina en CTA y expone stages reales', () => {
    assert.equal(LEGACY_STRUCTURE.stages.at(-1), 'CTA');
    assert.equal(LEGACY_STRUCTURE.stages[0], 'HOOK');
  });
  test('listCompatibleStructures nunca incluye LEGACY_STRUCTURE como opción real', () => {
    const opciones = listCompatibleStructures({ contentType: 'VIDEO' });
    assert.ok(!opciones.some((s) => s.structureId === LEGACY_STRUCTURE.structureId));
  });
});
