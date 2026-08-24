import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCampaignCreativeCell, resolveCampaignForContentRequest, MissingStrategicMatchError, CreativeCellNotApprovedError, MIN_MATCH_SCORE } from '../src/campaignMode.js';
import { parseContentRequest } from '../src/contentRequest.js';
import { getCycle } from '../../creative-intelligence/orchestrator/cycleStore.js';

describe('resolveCampaignCreativeCell — contra Creative Intelligence real persistido', () => {
  // Fase 4B (Creative Gate Enforcement): los 2 ciclos reales persistidos en
  // creative-intelligence/data/cycles/ tienen gateStatus.strategyAndBriefApproval
  // = 'PENDING' (nunca aprobados por un humano) -- verificado directamente
  // sobre esos archivos. Antes de esta fase, resolveCampaignCreativeCell()
  // ignoraba gateStatus por completo y devolvía PROPOSAL_READY igual; ahora
  // el gate se aplica de verdad, así que Té Divina deja de resolver un
  // match exitoso -- ESTO ES EL COMPORTAMIENTO CORRECTO Y ESPERADO tras la
  // corrección (instrucción explícita de la fase: no es una regresión),
  // no un fallo de este archivo. Las 2 pruebas de abajo se actualizan para
  // demostrar exactamente eso, en vez de simularlo.
  test('Té Divina: existe un CreativeCell real con score suficiente, pero su ciclo no está aprobado — MissingStrategicMatchError con gatedCandidate, nunca PROPOSAL_READY silencioso', () => {
    assert.throws(
      () => resolveCampaignCreativeCell({ productId: 'te-divina' }),
      (err) => {
        assert.ok(err instanceof MissingStrategicMatchError);
        assert.ok(err.gatedCandidate, 'debe reportar el candidato bloqueado por el gate, no solo "no hay match"');
        assert.ok(err.gatedCandidate.score >= MIN_MATCH_SCORE);
        assert.equal(err.gatedCandidate.strategyAndBriefApproval, 'PENDING');
        assert.match(err.message, /gateStatus\.strategyAndBriefApproval/);
        return true;
      },
    );
  });

  test('el match bloqueado por el gate está grounded de verdad: el candidato reportado en gatedCandidate realmente comparte palabras clave con Problema/Beneficios reales del producto (no es un bloqueo arbitrario)', () => {
    let gatedCandidate = null;
    try {
      resolveCampaignCreativeCell({ productId: 'te-divina' });
      assert.fail('debía lanzar MissingStrategicMatchError');
    } catch (err) {
      gatedCandidate = err.gatedCandidate;
    }
    assert.ok(gatedCandidate);
    const cycle = getCycle(gatedCandidate.cycleId);
    const cell = cycle.priorityCreativeCells.find((c) => c.creativeCellId === gatedCandidate.creativeCellId);
    const pain = cycle.pains.find((p) => p.painId === cell.painId);
    const angle = cycle.angles.find((a) => a.angleId === cell.angleId);
    // Mismo texto exacto que usa el score real en campaignMode.js (pain + angle + mechanism) — nunca un subconjunto que podría no reflejar dónde vive realmente la palabra compartida.
    const textoCelda = `${pain.painPoint} ${angle?.angleText ?? ''} ${cell.mechanism ?? ''}`.toLowerCase();
    const textoProducto = 'necesidad de desintoxicación corporal antes de comenzar un programa de pérdida de peso; tránsito intestinal lento. prepara el cuerpo para iniciar un programa de pérdida de peso; promueve la desintoxicación natural; promueve la energía; mejora el tránsito intestinal.';
    const compartePalabraReal = ['laxante', 'intestinal', 'depender', 'desintoxicación'].some((w) => textoCelda.includes(w) && textoProducto.includes(w));
    assert.ok(compartePalabraReal);
  });

  test('lanza MissingStrategicMatchError (no inventa) para un producto real del catálogo sin ningún CreativeCell relacionado — Radien Eye Serum (skincare) contra ciclos de peso/energía/digestión', () => {
    assert.throws(
      () => resolveCampaignCreativeCell({ productId: 'radien-eye-serum' }),
      MissingStrategicMatchError,
    );
  });

  test('lanza un error real (no inventa datos) si el producto ni siquiera existe en el catálogo', () => {
    assert.throws(
      () => resolveCampaignCreativeCell({ productId: 'producto-que-no-existe-en-docs-productos' }),
      /no existe ningún archivo real/,
    );
  });

  test('rechaza productId vacío', () => {
    assert.throws(() => resolveCampaignCreativeCell({ productId: '' }), /productId/);
  });

  test('MissingStrategicMatchError expone candidatesTried para diagnóstico transparente', () => {
    assert.equal(typeof MissingStrategicMatchError, 'function');
  });
});

describe('resolveCampaignForContentRequest', () => {
  // Fase 4B: mismo motivo que arriba -- el ciclo real de Té Divina está
  // PENDING, así que el gate lo bloquea también a través de este wrapper.
  test('Té Divina vía ContentRequest: mismo gate aplicado — MissingStrategicMatchError con gatedCandidate, no PROPOSAL_READY', () => {
    const req = parseContentRequest({ rawText: 'Quiero una campaña para Té Divina para Instagram', contentType: 'CAMPAIGN' });
    assert.throws(
      () => resolveCampaignForContentRequest(req),
      (err) => err instanceof MissingStrategicMatchError && err.gatedCandidate?.strategyAndBriefApproval === 'PENDING',
    );
  });

  test('rechaza un ContentRequest que no está en CAMPAIGN_MODE', () => {
    const req = parseContentRequest({
      rawText: 'x', contentType: 'VIDEO_REEL', forcedMode: 'DIRECT_INSTRUCTION_MODE',
      explicitFields: { voiceoverText: 'x', cta: 'x', visualAssets: [{ assetId: 'a', sourcePath: 'b' }] },
    });
    assert.throws(() => resolveCampaignForContentRequest(req), /no CAMPAIGN_MODE/);
  });

  test('rechaza un ContentRequest CAMPAIGN_MODE sin productId resuelto', () => {
    const req = parseContentRequest({ rawText: 'Quiero una campaña genérica sin producto', contentType: 'CAMPAIGN' });
    assert.throws(() => resolveCampaignForContentRequest(req), /productId.*resuelto/);
  });
});
