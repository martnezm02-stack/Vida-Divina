import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { prepararTextoParaTTS } from '../src/preprocessor.js';
import { aplicarOrtografia } from '../src/ortografia.js';
import { normalizarPuntuacion } from '../src/normalizacion.js';
import { analizarEstructura } from '../src/analisisEstructural.js';
import { detectarPalabrasAmbiguas } from '../src/deteccionAmbiguas.js';
import { verificarConservacionDeSignificado } from '../src/verificacionSemantica.js';

describe('aplicarOrtografia()', () => {
  test('corrige "tambien" -> "también" preservando mayúscula inicial', () => {
    const r = aplicarOrtografia('Tambien nos puede apoyar.');
    assert.equal(r.texto, 'También nos puede apoyar.');
    assert.deepEqual(r.cambios, [{ tipo: 'ortografia', original: 'Tambien', corregido: 'También' }]);
  });

  test('corrige "perdida" -> "pérdida" en minúscula', () => {
    const r = aplicarOrtografia('la perdida de peso');
    assert.equal(r.texto, 'la pérdida de peso');
  });

  test('no toca palabras ya correctas', () => {
    const r = aplicarOrtografia('información clara');
    assert.equal(r.texto, 'información clara');
    assert.equal(r.cambios.length, 0);
  });

  test('no toca palabras ambiguas como "esta" o "si"', () => {
    const r = aplicarOrtografia('esta persona dice que si puede');
    assert.equal(r.texto, 'esta persona dice que si puede');
    assert.equal(r.cambios.length, 0);
  });

  test('corrige concordancia "la primer semana" -> "la primera semana"', () => {
    const r = aplicarOrtografia('desde la primer semana');
    assert.equal(r.texto, 'desde la primera semana');
    assert.equal(r.cambios[0].tipo, 'concordancia');
  });

  test('NO modifica cifras ni nombres de producto', () => {
    const r = aplicarOrtografia('El Té Divina dura 42 dias');
    assert.match(r.texto, /42/);
    assert.match(r.texto, /Té Divina/);
  });
});

describe('normalizarPuntuacion()', () => {
  test('colapsa espacios múltiples', () => {
    const r = normalizarPuntuacion('Hola   mundo');
    assert.equal(r.texto, 'Hola mundo');
  });

  test('quita espacio antes de coma/punto', () => {
    const r = normalizarPuntuacion('Hola , mundo .');
    assert.equal(r.texto, 'Hola, mundo.');
  });

  test('agrega ¿ de apertura si falta', () => {
    const r = normalizarPuntuacion('hay algo que busca?');
    assert.equal(r.texto, '¿hay algo que busca?');
  });

  test('no duplica ¿ si ya existe', () => {
    const r = normalizarPuntuacion('¿hay algo que busca?');
    assert.equal(r.texto, '¿hay algo que busca?');
    assert.equal(r.cambios.filter((c) => c.tipo === 'pregunta').length, 0);
  });
});

describe('analizarEstructura()', () => {
  test('detecta oración de 1-2 palabras', () => {
    const advertencias = analizarEstructura('Perfecto. Aquí está la explicación completa de todo.');
    assert.ok(advertencias.some((a) => a.tipo === 'oracion_muy_corta'));
  });

  test('detecta cadena de oraciones cortas (patrón advisory_v2)', () => {
    const texto = 'Hola. Mira. Antes de algo. Prefiero esto. Y ya. Esta es una oración normal con más palabras que seis.';
    const advertencias = analizarEstructura(texto);
    assert.ok(advertencias.some((a) => a.tipo === 'cadena_de_oraciones_cortas'));
  });

  test('detecta posible fragmento dependiente tras punto', () => {
    const texto = 'No se trata de elegir. Y qué necesitas resolver es lo importante aquí de verdad.';
    const advertencias = analizarEstructura(texto);
    assert.ok(advertencias.some((a) => a.tipo === 'posible_fragmento_dependiente'));
  });

  test('texto bien estructurado no genera advertencias de cadena corta', () => {
    const texto =
      'Perfecto. En este caso le voy a explicar cómo funciona nuestro producto y qué resultados puede esperar.';
    const advertencias = analizarEstructura(texto);
    assert.equal(advertencias.filter((a) => a.tipo === 'cadena_de_oraciones_cortas').length, 0);
  });
});

describe('detectarPalabrasAmbiguas()', () => {
  test('detecta "si" y "esta" como advertencia, no como corrección', () => {
    const advertencias = detectarPalabrasAmbiguas('si esta persona pregunta, respondemos');
    const palabras = advertencias.map((a) => a.palabra.toLowerCase());
    assert.ok(palabras.includes('si'));
    assert.ok(palabras.includes('esta'));
  });

  test('no marca palabras no ambiguas', () => {
    const advertencias = detectarPalabrasAmbiguas('información clara sobre el producto');
    assert.equal(advertencias.length, 0);
  });

  test('no marca "de", "se", "te", "mi" en sus usos comunes (excluidas deliberadamente por ruido)', () => {
    const advertencias = detectarPalabrasAmbiguas(
      'El tratamiento se toma tres veces al día. Mi rutina de siempre te acompaña de forma natural.'
    );
    const palabras = advertencias.map((a) => a.palabra.toLowerCase());
    assert.ok(!palabras.includes('de'));
    assert.ok(!palabras.includes('se'));
    assert.ok(!palabras.includes('te'));
    assert.ok(!palabras.includes('mi'));
  });
});

describe('verificarConservacionDeSignificado()', () => {
  test('ok:true cuando números, preguntas y oraciones se conservan', () => {
    const original = 'El tratamiento dura 42 días. ¿Le interesa saber más?';
    const preparado = 'El tratamiento dura 42 días. ¿Le interesa saber más?';
    const r = verificarConservacionDeSignificado(original, preparado);
    assert.equal(r.ok, true);
  });

  test('ok:false si un número desaparece', () => {
    const original = 'El tratamiento dura 42 días.';
    const preparado = 'El tratamiento dura días.';
    const r = verificarConservacionDeSignificado(original, preparado);
    assert.equal(r.ok, false);
    assert.ok(r.detalles.some((d) => d.includes('números')));
  });

  test('ok:false si desaparece una pregunta', () => {
    const original = '¿Le interesa? Claro que sí.';
    const preparado = 'Le interesa. Claro que sí.';
    const r = verificarConservacionDeSignificado(original, preparado);
    assert.equal(r.ok, false);
  });
});

describe('prepararTextoParaTTS() — integración', () => {
  test('caso simple: corrige ortografía, conserva significado, sin requerir revisión', () => {
    const original = 'Tambien nos ayuda con la perdida de peso desde la primer semana.';
    const resultado = prepararTextoParaTTS(original);

    assert.equal(resultado.textoPreparado, 'También nos ayuda con la pérdida de peso desde la primera semana.');
    assert.equal(resultado.cambios.length, 3); // tambien, perdida, primer semana
    assert.equal(resultado.verificacion.ok, true);
    assert.equal(resultado.requiereRevision, false);
  });

  test('conserva cifras y nombre de producto exactamente', () => {
    const original = 'El Té Divina es un tratamiento de 42 dias con resultados desde la primer semana.';
    const resultado = prepararTextoParaTTS(original);

    assert.match(resultado.textoPreparado, /Té Divina/);
    assert.match(resultado.textoPreparado, /42/);
    assert.equal(resultado.verificacion.ok, true);
  });

  test('lanza si el texto está vacío', () => {
    assert.throws(() => prepararTextoParaTTS(''), TypeError);
  });

  test('no cambia una pregunta ya bien puntuada', () => {
    const original = '¿Hay algo específicamente que esté buscando mejorar en su salud?';
    const resultado = prepararTextoParaTTS(original);
    assert.equal(resultado.textoPreparado, original);
  });
});
