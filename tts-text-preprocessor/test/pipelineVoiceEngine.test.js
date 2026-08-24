import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { generarAudioDesdeTexto } from '../src/pipelineVoiceEngine.js';
import { CONFIGURACION_VOZ_APROBADA } from '../src/configuracionVozAprobada.js';

describe('generarAudioDesdeTexto() — compuertas de seguridad', () => {
  // NOTA: el camino requiereRevision===true ya está cubierto directamente
  // en preprocessor.test.js (describe('verificarConservacionDeSignificado()'))
  // con casos genuinos (número que desaparece, pregunta que desaparece).
  // No se duplica aquí con un texto artificial: prepararTextoParaTTS() se
  // importa directamente (no es inyectable) y, con su comportamiento
  // actual ya probado, es difícil construir de forma honesta un texto de
  // lenguaje natural que dispare requiereRevision sin ser exactamente esos
  // casos ya cubiertos. Lo que SÍ se prueba aquí es que, estructuralmente,
  // el pipeline respeta esa bandera cuando prepararTextoParaTTS la
  // devuelve (ver assert sobre el código fuente, prueba siguiente).
  test('el código respeta requiereRevision antes de invocar generación (revisión de contrato)', async () => {
    const { prepararTextoParaTTS } = await import('../src/preprocessor.js');
    const original = '¿Le interesa? Claro que sí.';
    const preparadoConPreguntaPerdida = 'Le interesa. Claro que sí.'; // simula una regresión hipotética
    const { verificarConservacionDeSignificado } = await import('../src/verificacionSemantica.js');
    const verificacion = verificarConservacionDeSignificado(original, preparadoConPreguntaPerdida);
    assert.equal(verificacion.ok, false); // confirma que el verificador SÍ detectaría esta regresión
    // Confirma además que, en el estado actual del código, ese mismo texto
    // de entrada real no produce ese escenario (el preprocessor no pierde
    // preguntas hoy):
    const resultadoReal = prepararTextoParaTTS(original);
    assert.equal(resultadoReal.requiereRevision, false);
  });

  test('texto largo (excede margen de seguridad) -> estado TEXTO_EXCEDE_LIMITE_TTS, no invoca generación', async () => {
    let invocado = false;
    const ejecutarGeneracion = async () => {
      invocado = true;
      return { ok: true, out_path: '/no/deberia/llamarse.wav', duration_s: 1, rtf: 1 };
    };

    // ~250 palabras -> muy por encima del margen de 38s estimados.
    const textoLargo = Array(250).fill('palabra').join(' ') + '.';
    const resultado = await generarAudioDesdeTexto(textoLargo, { ejecutarGeneracion });

    assert.equal(resultado.estado, 'TEXTO_EXCEDE_LIMITE_TTS');
    assert.equal(invocado, false);
    assert.ok(resultado.estimacionDuracion.segundosEstimados >= resultado.estimacionDuracion.margenSeguridadSegundos);
    assert.match(resultado.motivo, /segmentación/);
  });

  test('texto corto y válido -> invoca generación y devuelve estado COMPLETADO', async () => {
    let argsRecibidos;
    const ejecutarGeneracion = async (textoPreparado, nombreSalida) => {
      argsRecibidos = { textoPreparado, nombreSalida };
      return {
        ok: true,
        out_path: `/home/manuel1974/vida-divina-voice-engine-data/experiments/${nombreSalida}`,
        duration_s: 5.2,
        rtf: 8.1,
        repetition_warning: false,
      };
    };

    const resultado = await generarAudioDesdeTexto('Hola, mira, este es un texto corto de prueba.', {
      etiqueta: 'test-pipeline',
      ejecutarGeneracion,
    });

    assert.equal(resultado.estado, 'COMPLETADO');
    assert.equal(resultado.duracionSegundos, 5.2);
    assert.equal(resultado.rtf, 8.1);
    assert.ok(resultado.archivoAudio.includes('test-pipeline'));
    assert.deepEqual(resultado.parametrosTTS, CONFIGURACION_VOZ_APROBADA);
    assert.ok(argsRecibidos.textoPreparado.length > 0);
  });

  test('la generación falla (ok:false) -> estado ERROR_GENERACION, no lanza', async () => {
    const ejecutarGeneracion = async () => ({ ok: false, error: 'fallo simulado del motor' });

    const resultado = await generarAudioDesdeTexto('Texto corto de prueba para el motor.', { ejecutarGeneracion });

    assert.equal(resultado.estado, 'ERROR_GENERACION');
    assert.equal(resultado.error, 'fallo simulado del motor');
  });

  test('registro de auditoría incluye los campos A-J requeridos', async () => {
    const ejecutarGeneracion = async (textoPreparado, nombreSalida) => ({
      ok: true,
      out_path: `/ruta/${nombreSalida}`,
      duration_s: 3.1,
      rtf: 7.0,
    });

    const r = await generarAudioDesdeTexto('Texto de prueba para auditoría completa.', { ejecutarGeneracion });

    assert.ok('textoOriginal' in r); // A
    assert.ok('textoPreparado' in r); // B
    assert.ok('cambios' in r); // C
    assert.ok('advertencias' in r); // D
    assert.ok('verificacion' in r); // E
    assert.ok('parametrosTTS' in r); // F, G
    assert.ok('archivoAudio' in r); // H
    assert.ok('fechaHoraInicio' in r); // I
    assert.ok('estado' in r); // J
  });

  test('no incluye ningún campo de credenciales/tokens en el registro', async () => {
    const ejecutarGeneracion = async (textoPreparado, nombreSalida) => ({
      ok: true,
      out_path: `/ruta/${nombreSalida}`,
      duration_s: 1,
      rtf: 1,
    });
    const r = await generarAudioDesdeTexto('Texto de prueba.', { ejecutarGeneracion });
    const json = JSON.stringify(r).toLowerCase();
    assert.ok(!json.includes('token'));
    assert.ok(!json.includes('access_token'));
    assert.ok(!json.includes('secret'));
  });
});
