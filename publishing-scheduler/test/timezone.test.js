import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { zonedTimeToUtcIso, isValidTimeZone } from '../src/timezone.js';

describe('timezone', () => {
  test('convierte fecha/hora/timezone a instante UTC real (America/Mexico_City, UTC-6 sin DST)', () => {
    const iso = zonedTimeToUtcIso('2026-08-25', '08:30', 'America/Mexico_City');
    assert.equal(iso, '2026-08-25T14:30:00.000Z');
  });

  test('respeta un timezone distinto para el mismo reloj local (Europe/Madrid, UTC+2 en verano)', () => {
    const iso = zonedTimeToUtcIso('2026-08-25', '08:30', 'Europe/Madrid');
    assert.equal(iso, '2026-08-25T06:30:00.000Z');
  });

  test('nunca asume UTC sin convertir -- Mexico_City y Madrid dan instantes distintos para el mismo reloj', () => {
    const mx = zonedTimeToUtcIso('2026-08-25', '08:30', 'America/Mexico_City');
    const es = zonedTimeToUtcIso('2026-08-25', '08:30', 'Europe/Madrid');
    assert.notEqual(mx, es);
  });

  test('isValidTimeZone: acepta IANA real, rechaza inválida', () => {
    assert.equal(isValidTimeZone('America/Mexico_City'), true);
    assert.equal(isValidTimeZone('No/Existe'), false);
    assert.equal(isValidTimeZone(''), false);
  });

  test('rechaza formato de fecha inválido', () => {
    assert.throws(() => zonedTimeToUtcIso('25-08-2026', '08:30', 'America/Mexico_City'));
  });

  test('rechaza formato de hora inválido', () => {
    assert.throws(() => zonedTimeToUtcIso('2026-08-25', '8:30pm', 'America/Mexico_City'));
  });

  test('rechaza timezone inválida', () => {
    assert.throws(() => zonedTimeToUtcIso('2026-08-25', '08:30', 'Marte/Colonia'));
  });
});
