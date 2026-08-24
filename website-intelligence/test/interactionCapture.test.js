import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createInteractionCapture, INTERACTION_TRIGGERS } from '../src/acquisition/interactionCapture.js';

describe('InteractionCapture — estado A → estado B ante una acción', () => {
  test('crea una captura válida con raw_id en ambos estados', () => {
    const capture = createInteractionCapture({
      trigger: 'click',
      target_detail: 'botón de menú hamburguesa',
      state_before: { raw_id: 'raw-antes' },
      state_after: { raw_id: 'raw-despues' },
      evidence_method: 'dom',
    });
    assert.equal(capture.trigger, 'click');
    assert.equal(capture.state_before.raw_id, 'raw-antes');
    assert.equal(capture.state_after.raw_id, 'raw-despues');
  });

  test('acepta "detail" como alternativa a raw_id cuando no se persistió un WebsiteRawRecord completo por estado', () => {
    const capture = createInteractionCapture({
      trigger: 'click',
      state_before: { detail: 'menú colapsado' },
      state_after: { detail: 'menú expandido' },
    });
    assert.equal(capture.state_before.detail, 'menú colapsado');
  });

  test('rechaza trigger inválido', () => {
    assert.throws(() => createInteractionCapture({
      trigger: 'teletransportacion',
      state_before: { detail: 'x' },
      state_after: { detail: 'y' },
    }));
  });

  test('rechaza un estado sin raw_id ni detail — nunca queda sin evidencia', () => {
    assert.throws(() => createInteractionCapture({ trigger: 'click', state_before: {}, state_after: { detail: 'y' } }));
    assert.throws(() => createInteractionCapture({ trigger: 'click', state_before: { detail: 'x' }, state_after: null }));
  });

  test('INTERACTION_TRIGGERS documenta exactamente los triggers soportados', () => {
    assert.deepEqual(INTERACTION_TRIGGERS, ['click', 'hover', 'scroll', 'focus', 'submit', 'resize']);
  });
});
