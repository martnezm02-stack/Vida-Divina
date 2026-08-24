import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';

import {
  extraerVoiceoverOrdenado, segmentarVoiceoverSeguro, computeAssetId,
  wslPathToWindowsUNC, leerInfoWav, concatenarWav,
  generarAudioAssetDesdeVisualProductionPackage, AUDIO_ASSET_STATUS,
} from '../src/audioAssetAdapter.js';
import { CONFIGURACION_VOZ_APROBADA } from '../src/configuracionVozAprobada.js';
import { MARGEN_SEGURIDAD_SEGUNDOS } from '../src/estimacionDuracion.js';

function paqueteConVoiceover(voiceover, extra = {}) {
  return { voiceover, ...extra };
}

function crearWavSilencioBuffer(duracionSegundos, sampleRate = 24000) {
  const numSamples = Math.round(duracionSegundos * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

/** Escribe un WAV de silencio real en una ruta de WSL2, vía la UNC de Windows. */
function escribirWavMockEnWSL(rutaWSL, duracionSegundos = 2.5) {
  writeFileSync(wslPathToWindowsUNC(rutaWSL), crearWavSilencioBuffer(duracionSegundos));
}

// Test double para generarAudio -- mismo patrón de inyección que
// pipelineVoiceEngine.js usa para "ejecutarGeneracion". No hace ninguna
// generación TTS real, pero SÍ escribe un WAV real y pequeño en la ruta
// que reporta, para que leerInfoWav() (que siempre mide el archivo real,
// nunca confía en un valor no verificado) tenga algo real que leer.
function mockGenerarAudioOK({ pathPrefix = '/home/manuel1974/vida-divina-voice-engine-data/output', duracionSegundos = 2.5 } = {}) {
  let contador = 0;
  return async (texto, { etiqueta }) => {
    contador += 1;
    const archivoAudio = `${pathPrefix}/${etiqueta}-mock${contador}.wav`;
    escribirWavMockEnWSL(archivoAudio, duracionSegundos);
    return {
      estado: 'COMPLETADO',
      textoOriginal: texto,
      textoPreparado: texto,
      archivoAudio,
      duracionSegundos,
      rtf: 9.7,
      parametrosTTS: CONFIGURACION_VOZ_APROBADA,
    };
  };
}

describe('extraerVoiceoverOrdenado', () => {
  test('preserva el orden exacto de las líneas', () => {
    const lineas = extraerVoiceoverOrdenado(paqueteConVoiceover(['Uno.', 'Dos.', 'Tres.']));
    assert.deepEqual(lineas, ['Uno.', 'Dos.', 'Tres.']);
  });

  test('rechaza voiceover ausente/vacío', () => {
    assert.throws(() => extraerVoiceoverOrdenado({}), /arreglo no vacío/);
    assert.throws(() => extraerVoiceoverOrdenado(paqueteConVoiceover([])), /arreglo no vacío/);
  });

  test('rechaza una línea vacía dentro del arreglo (nunca se rellena en silencio)', () => {
    assert.throws(() => extraerVoiceoverOrdenado(paqueteConVoiceover(['Hola.', '   '])), /string no vacío/);
  });
});

describe('segmentarVoiceoverSeguro', () => {
  test('un voiceover corto produce 1 solo segmento', () => {
    const segmentos = segmentarVoiceoverSeguro(['Hola, soy Vive Vida Divina.', 'Escríbenos por WhatsApp.']);
    assert.equal(segmentos.length, 1);
    assert.equal(segmentos[0], 'Hola, soy Vive Vida Divina. Escríbenos por WhatsApp.');
  });

  test('múltiples líneas largas producen múltiples segmentos, ninguno excede el margen', () => {
    const lineaLarga = 'Esta es una línea comercial de prueba con bastantes palabras repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas.';
    const lineas = Array.from({ length: 6 }, (_, i) => `${lineaLarga} Parte ${i + 1}.`);
    const segmentos = segmentarVoiceoverSeguro(lineas);
    assert.ok(segmentos.length > 1, 'se esperaban múltiples segmentos');
    for (const seg of segmentos) {
      const palabras = seg.split(/\s+/).filter(Boolean).length;
      assert.ok(palabras * 0.29 < MARGEN_SEGURIDAD_SEGUNDOS + 5, `segmento demasiado largo: ${palabras} palabras`);
    }
  });

  test('no pierde ni inventa contenido: el texto unido de los segmentos reconstruye el original (salvo espacios)', () => {
    const lineas = ['Primera línea comercial.', 'Segunda línea comercial.', 'Tercera línea comercial.'];
    const segmentos = segmentarVoiceoverSeguro(lineas);
    const reconstruido = segmentos.join(' ').replace(/\s+/g, ' ').trim();
    const original = lineas.join(' ').replace(/\s+/g, ' ').trim();
    assert.equal(reconstruido, original);
  });
});

describe('computeAssetId — determinista, nunca solo UUID aleatorio', () => {
  test('mismo texto + mismo perfil + mismo formato -> mismo assetId', () => {
    const a = computeAssetId({ sourceText: 'Hola mundo', voiceProfileId: 'manuel_es_mx', formato: 'wav' });
    const b = computeAssetId({ sourceText: 'Hola mundo', voiceProfileId: 'manuel_es_mx', formato: 'wav' });
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  test('texto distinto -> assetId distinto', () => {
    const a = computeAssetId({ sourceText: 'Hola mundo', voiceProfileId: 'manuel_es_mx' });
    const b = computeAssetId({ sourceText: 'Hola mundo!', voiceProfileId: 'manuel_es_mx' });
    assert.notEqual(a, b);
  });

  test('perfil distinto -> assetId distinto', () => {
    const a = computeAssetId({ sourceText: 'Hola mundo', voiceProfileId: 'manuel_es_mx' });
    const b = computeAssetId({ sourceText: 'Hola mundo', voiceProfileId: 'otro_perfil' });
    assert.notEqual(a, b);
  });

  test('rechaza sourceText/voiceProfileId vacíos', () => {
    assert.throws(() => computeAssetId({ sourceText: '', voiceProfileId: 'x' }));
    assert.throws(() => computeAssetId({ sourceText: 'x', voiceProfileId: '' }));
  });
});

describe('leerInfoWav — mide el archivo real, nunca asume', () => {
  test('lee sampleRate/canales/duración reales de un WAV sintético', () => {
    const dir = process.env.TEMP || process.env.TMP || '/tmp';
    const path = `${dir}\\test-leerinfowav-${Date.now()}.wav`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, crearWavSilencioBuffer(3.0, 24000));
    const info = leerInfoWav(path);
    assert.equal(info.sampleRate, 24000);
    assert.equal(info.channels, 1);
    assert.equal(info.bitsPerSample, 16);
    assert.equal(info.duracionSegundos, 3.0);
  });
});

describe('wslPathToWindowsUNC', () => {
  test('traduce una ruta POSIX de WSL2 a UNC de Windows', () => {
    assert.equal(
      wslPathToWindowsUNC('/home/manuel1974/x/y.wav'),
      '\\\\wsl.localhost\\Ubuntu\\home\\manuel1974\\x\\y.wav'
    );
  });

  test('rechaza una ruta que no es POSIX absoluta', () => {
    assert.throws(() => wslPathToWindowsUNC('C:\\algo'), /POSIX absoluta/);
  });
});

describe('concatenarWav — ffmpeg real, sin mock (rápido: archivos sintéticos)', () => {
  test('concatena 2 WAV reales y la duración final es la suma de ambos', async (t) => {
    const uncBase = '\\\\wsl.localhost\\Ubuntu\\tmp';
    const idPrueba = Date.now();
    const rutaA_win = `${uncBase}\\test-concat-a-${idPrueba}.wav`;
    const rutaB_win = `${uncBase}\\test-concat-b-${idPrueba}.wav`;
    const rutaA_wsl = `/tmp/test-concat-a-${idPrueba}.wav`;
    const rutaB_wsl = `/tmp/test-concat-b-${idPrueba}.wav`;
    const rutaSalida_wsl = `/tmp/test-concat-out-${idPrueba}.wav`;

    try {
      writeFileSync(rutaA_win, crearWavSilencioBuffer(1.0, 24000));
      writeFileSync(rutaB_win, crearWavSilencioBuffer(1.5, 24000));
    } catch (e) {
      t.skip(`No se pudo escribir en \\\\wsl.localhost (WSL2 no disponible en este entorno): ${e.message}`);
      return;
    }

    await concatenarWav([rutaA_wsl, rutaB_wsl], rutaSalida_wsl);
    const info = leerInfoWav(wslPathToWindowsUNC(rutaSalida_wsl));
    assert.ok(Math.abs(info.duracionSegundos - 2.5) < 0.05, `duración esperada ~2.5s, obtuvo ${info.duracionSegundos}s`);
  });
});

describe('generarAudioAssetDesdeVisualProductionPackage — voiceover válido (mock)', () => {
  test('genera un Audio Asset COMPLETADO con 1 segmento (voiceover corto)', async () => {
    const paquete = paqueteConVoiceover(
      ['Hola, soy Vive Vida Divina.', 'Escríbenos por WhatsApp para más información.'],
      { creativeCellCandidateId: 'CC-A1', productionArtifactId: 'pa-123', visualProductionPackageId: 'vpp-456' }
    );
    const asset = await generarAudioAssetDesdeVisualProductionPackage(paquete, { generarAudio: mockGenerarAudioOK() });

    assert.equal(asset.status, 'COMPLETADO');
    assert.ok(AUDIO_ASSET_STATUS.includes(asset.status));
    assert.equal(asset.creativeCellCandidateId, 'CC-A1');
    assert.equal(asset.productionArtifactId, 'pa-123');
    assert.equal(asset.visualProductionPackageId, 'vpp-456');
    assert.equal(asset.sourceVoiceProfile, CONFIGURACION_VOZ_APROBADA.perfil);
    assert.equal(asset.sourceText, 'Hola, soy Vive Vida Divina. Escríbenos por WhatsApp para más información.');
    assert.equal(asset.format, 'wav');
    assert.equal(asset.segments, null, 'con 1 solo segmento no debe poblarse el arreglo de trazabilidad');
    assert.match(asset.assetId, /^[0-9a-f]{64}$/);
  });

  test('assetId es el mismo para el mismo VisualProductionPackage en llamadas repetidas', async () => {
    const paquete = paqueteConVoiceover(['Texto idéntico de prueba.']);
    const a1 = await generarAudioAssetDesdeVisualProductionPackage(paquete, { generarAudio: mockGenerarAudioOK() });
    const a2 = await generarAudioAssetDesdeVisualProductionPackage(paquete, { generarAudio: mockGenerarAudioOK() });
    assert.equal(a1.assetId, a2.assetId);
  });
});

describe('generarAudioAssetDesdeVisualProductionPackage — múltiples segmentos + trazabilidad', () => {
  test('un voiceover largo produce múltiples segmentos, llamados EN ORDEN, con trazabilidad completa', async () => {
    const lineaLarga = 'Esta es una línea comercial de prueba con bastantes palabras repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas repetidas.';
    const lineas = Array.from({ length: 6 }, (_, i) => `${lineaLarga} Parte ${i + 1}.`);
    const paquete = paqueteConVoiceover(lineas);

    const ordenLlamadas = [];
    const generarAudio = async (texto, { etiqueta }) => {
      ordenLlamadas.push(texto);
      const archivoAudio = `/home/manuel1974/vida-divina-voice-engine-data/output/${etiqueta}.wav`;
      escribirWavMockEnWSL(archivoAudio, 3.0);
      return { estado: 'COMPLETADO', archivoAudio, duracionSegundos: 3.0, rtf: 9.7 };
    };

    // WSL2 + ffmpeg real: la concatenación de esta prueba corre de verdad
    // (mismo motivo que el describe de concatenarWav — es rápida porque los
    // WAV son sintéticos de silencio, no generaciones TTS reales).
    const asset = await generarAudioAssetDesdeVisualProductionPackage(paquete, { generarAudio });

    assert.equal(asset.status, 'COMPLETADO');
    assert.ok(ordenLlamadas.length > 1, 'se esperaban múltiples segmentos');
    assert.ok(Array.isArray(asset.segments));
    assert.equal(asset.segments.length, ordenLlamadas.length);
    for (let i = 0; i < asset.segments.length; i++) {
      assert.equal(asset.segments[i].index, i + 1);
      assert.equal(asset.segments[i].text, ordenLlamadas[i]);
    }
    // orden preservado: unir los textos de los segmentos reconstruye el original.
    const reconstruido = ordenLlamadas.join(' ').replace(/\s+/g, ' ').trim();
    const original = lineas.join(' ').replace(/\s+/g, ' ').trim();
    assert.equal(reconstruido, original);
  });
});

describe('generarAudioAssetDesdeVisualProductionPackage — error del Voice Engine', () => {
  test('si un segmento falla, el asset se marca con el estado real, sin fabricar audio ni ruta', async () => {
    const paquete = paqueteConVoiceover(['Línea que sí genera.', 'Línea que va a fallar.']);
    const asset = await generarAudioAssetDesdeVisualProductionPackage(paquete, {
      generarAudio: async (texto) => {
        if (texto.includes('fallar')) return { estado: 'ERROR_GENERACION', error: 'fallo simulado', archivoAudio: null };
        return { estado: 'COMPLETADO', archivoAudio: '/home/manuel1974/x/ok.wav', duracionSegundos: 2, rtf: 9.7 };
      },
    });
    assert.equal(asset.status, 'ERROR_GENERACION');
    assert.equal(asset.outputPath, null);
    assert.equal(asset.duration, null);
    assert.ok(Array.isArray(asset.segments));
  });
});

describe('preservación de contenido — el adaptador nunca reescribe ni mejora el guion', () => {
  test('sourceText es exactamente la unión literal de las líneas de voiceover, sin alteración', async () => {
    const lineas = ['Frase uno con texto EXACTO.', 'Frase dos, con coma y todo.'];
    const paquete = paqueteConVoiceover(lineas);
    const asset = await generarAudioAssetDesdeVisualProductionPackage(paquete, { generarAudio: mockGenerarAudioOK() });
    assert.equal(asset.sourceText, lineas.join(' '));
  });
});
