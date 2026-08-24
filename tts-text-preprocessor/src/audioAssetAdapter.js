// audioAssetAdapter.js — Adaptador mínimo:
//   VisualProductionPackage.voiceover -> Voice Engine existente -> Audio Asset
//
// FASE: "Conectar Voice Engine con Visual Production Package". Responsabilidad
// única: tomar líneas de voiceover YA ESCRITAS (nunca las genera, nunca las
// mejora, nunca las reescribe) y producir un Audio Asset trazable, usando
// EXCLUSIVAMENTE el motor existente (generarAudioDesdeTexto, ver
// pipelineVoiceEngine.js) — nunca un motor nuevo, nunca un modelo distinto.
//
// Separación deliberada: este archivo NO importa nada de creative-intelligence/
// — acepta cualquier objeto con la forma { voiceover, creativeCellCandidateId?,
// productionArtifactId?, visualProductionPackageId? } (duck typing sobre el
// contrato ya definido en creative-intelligence/production/visualProductionPackage.js),
// para no acoplar Voice Engine a los detalles internos de Creative Intelligence.
//
// Generación estrictamente serial (nunca Promise.all): cada llamada a
// generarAudioDesdeTexto() ya es un proceso Python nuevo dentro de WSL2 (ver
// generate_from_textfile.py) que carga el modelo, genera y termina — la
// memoria se libera sola entre segmentos porque el proceso mismo termina,
// no por gestión manual aquí.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { generarAudioDesdeTexto, ejecutarComandoWSL, escribirArchivoWSL } from './pipelineVoiceEngine.js';
import { excedeLimiteTTS } from './estimacionDuracion.js';
import { CONFIGURACION_VOZ_APROBADA } from './configuracionVozAprobada.js';

export const AUDIO_ASSET_STATUS = Object.freeze(['COMPLETADO', 'ERROR_GENERACION', 'REQUIERE_REVISION', 'TEXTO_EXCEDE_LIMITE_TTS']);

const OUTPUT_DIR_WSL_DEFECTO = '/home/manuel1974/vida-divina-voice-engine-data/output';

// ---------------------------------------------------------------------
// 1. Extracción — nunca reordena, nunca rellena, nunca omite en silencio.
// ---------------------------------------------------------------------

/**
 * @param {{ voiceover?: string[] }} paquete VisualProductionPackage real (o su forma mínima).
 * @returns {string[]} copia del arreglo, mismo orden exacto.
 */
export function extraerVoiceoverOrdenado(paquete) {
  if (!paquete || !Array.isArray(paquete.voiceover) || paquete.voiceover.length === 0) {
    throw new Error('extraerVoiceoverOrdenado: "visualProductionPackage.voiceover" debe ser un arreglo no vacío de líneas.');
  }
  for (const linea of paquete.voiceover) {
    if (typeof linea !== 'string' || !linea.trim()) {
      throw new Error('extraerVoiceoverOrdenado: cada línea de voiceover debe ser un string no vacío — nunca se rellena ni se omite en silencio.');
    }
  }
  return [...paquete.voiceover];
}

// ---------------------------------------------------------------------
// 2. Segmentación segura — nunca trunca, nunca inventa texto. Agrupa
// líneas consecutivas (en su orden original) mientras quepan bajo el
// margen de seguridad ya definido (estimacionDuracion.js, reutilizado sin
// duplicar). Si una sola línea ya excede el margen, se subdivide por
// límites de oración (nunca a la mitad de una oración) — el texto nunca
// se pierde, solo se reparte en más llamadas.
// ---------------------------------------------------------------------

function dividirEnOraciones(texto) {
  const partes = texto.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
  return partes ? partes.map((p) => p.trim()).filter(Boolean) : [texto.trim()];
}

/**
 * @param {string[]} lineas líneas de voiceover, en orden.
 * @returns {string[]} segmentos de texto, cada uno destinado a UNA llamada
 *   de generarAudioDesdeTexto(); el orden preserva el de `lineas`.
 */
export function segmentarVoiceoverSeguro(lineas) {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new Error('segmentarVoiceoverSeguro: se requiere un arreglo no vacío de líneas.');
  }

  const unidades = [];
  for (const linea of lineas) {
    if (excedeLimiteTTS(linea).excede) {
      unidades.push(...dividirEnOraciones(linea));
    } else {
      unidades.push(linea.trim());
    }
  }

  const segmentos = [];
  let actual = [];
  for (const unidad of unidades) {
    const candidato = actual.length > 0 ? `${actual.join(' ')} ${unidad}` : unidad;
    if (actual.length > 0 && excedeLimiteTTS(candidato).excede) {
      segmentos.push(actual.join(' '));
      actual = [unidad];
    } else {
      actual.push(unidad);
    }
  }
  if (actual.length > 0) segmentos.push(actual.join(' '));
  return segmentos;
}

// ---------------------------------------------------------------------
// 3. Identidad determinista del asset — nunca solo un UUID aleatorio.
// Mismo texto fuente + mismo perfil de voz + mismo formato -> mismo
// assetId, siempre, sin importar si la generación tuvo éxito o falló
// (identifica LA SOLICITUD, no el audio byte a byte — el modelo no fija
// semilla, ver CONFIGURACION_VOZ_APROBADA.seed).
// ---------------------------------------------------------------------

export function computeAssetId({ sourceText, voiceProfileId, formato = 'wav' }) {
  if (!sourceText?.trim()) throw new Error('computeAssetId: "sourceText" es obligatorio.');
  if (!voiceProfileId?.trim()) throw new Error('computeAssetId: "voiceProfileId" es obligatorio.');
  const payload = JSON.stringify({ sourceText, voiceProfileId, formato });
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------
// 4. Utilidades de archivo WAV real (WSL2) — nunca se asume duración,
// siempre se mide del archivo final real.
// ---------------------------------------------------------------------

export function wslPathToWindowsUNC(rutaWSL, distro = 'Ubuntu') {
  if (!rutaWSL?.startsWith('/')) throw new Error('wslPathToWindowsUNC: se espera una ruta POSIX absoluta.');
  return `\\\\wsl.localhost\\${distro}${rutaWSL.replace(/\//g, '\\')}`;
}

export function leerInfoWav(rutaWindows) {
  const bytes = readFileSync(rutaWindows);
  const channels = bytes.readInt16LE(22);
  const sampleRate = bytes.readInt32LE(24);
  const bitsPerSample = bytes.readInt16LE(34);
  let pos = 36;
  let dataSize = null;
  while (pos < bytes.length - 8) {
    const id = bytes.toString('ascii', pos, pos + 4);
    const size = bytes.readInt32LE(pos + 4);
    if (id === 'data') {
      dataSize = size;
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (dataSize == null) throw new Error(`leerInfoWav: no se encontró el subchunk "data" en ${rutaWindows}`);
  const duracionSegundos = dataSize / (sampleRate * channels * (bitsPerSample / 8));
  return { channels, sampleRate, bitsPerSample, duracionSegundos: +duracionSegundos.toFixed(2), bytes: bytes.length };
}

/**
 * Concatena 2+ WAV reales vía ffmpeg (ya disponible en WSL2, ninguna
 * dependencia nueva) usando el demuxer "concat" — corte directo, sin
 * crossfade (no existe ninguna función estable de crossfade en el
 * proyecto hoy, así que no se aplica, tal como se indicó).
 */
export async function concatenarWav(rutasWSL, rutaSalidaWSL) {
  if (!Array.isArray(rutasWSL) || rutasWSL.length < 2) {
    throw new Error('concatenarWav: se requieren al menos 2 rutas reales para concatenar.');
  }
  const listaContenido = rutasWSL.map((r) => `file '${r}'`).join('\n');
  const listaPathWSL = `/tmp/concat-list-${Date.now()}.txt`;
  await escribirArchivoWSL(listaPathWSL, listaContenido);
  const resultado = await ejecutarComandoWSL([
    'bash', '-lc',
    `ffmpeg -y -f concat -safe 0 -i "${listaPathWSL}" -c copy "${rutaSalidaWSL}" && rm -f "${listaPathWSL}"`,
  ]);
  if (resultado.exitCode !== 0) {
    throw new Error(`concatenarWav: ffmpeg falló (exit ${resultado.exitCode}): ${resultado.stderr}`);
  }
  return rutaSalidaWSL;
}

// ---------------------------------------------------------------------
// 5. Adaptador principal.
// ---------------------------------------------------------------------

/**
 * @param {{ voiceover: string[], creativeCellCandidateId?: string, productionArtifactId?: string, visualProductionPackageId?: string }} paquete
 * @param {{ etiqueta?: string, outputDirWSL?: string, generarAudio?: Function }} [opciones]
 *   `generarAudio` es inyectable SOLO para pruebas rápidas (mismo patrón que
 *   `ejecutarGeneracion` en pipelineVoiceEngine.js) — en producción siempre
 *   es generarAudioDesdeTexto real.
 * @returns {Promise<object>} Audio Asset — ver campos exigidos en el reporte de esta fase.
 */
export async function generarAudioAssetDesdeVisualProductionPackage(
  paquete,
  { etiqueta = 'asset', outputDirWSL = OUTPUT_DIR_WSL_DEFECTO, generarAudio = generarAudioDesdeTexto } = {}
) {
  const lineas = extraerVoiceoverOrdenado(paquete);
  const sourceText = lineas.join(' ');
  const voiceProfileId = CONFIGURACION_VOZ_APROBADA.perfil;
  const formato = 'wav';
  const assetId = computeAssetId({ sourceText, voiceProfileId, formato });
  const generationTimestamp = new Date().toISOString();

  const segmentosTexto = segmentarVoiceoverSeguro(lineas);

  const baseAsset = {
    assetId,
    creativeCellCandidateId: paquete.creativeCellCandidateId ?? null,
    productionArtifactId: paquete.productionArtifactId ?? null,
    visualProductionPackageId: paquete.visualProductionPackageId ?? null,
    sourceVoiceProfile: voiceProfileId,
    sourceText,
    generationTimestamp,
  };

  // Serial estricto: for...of + await, nunca Promise.all — cada llamada es
  // un proceso WSL2 nuevo que debe terminar (y liberar su memoria) antes de
  // que empiece el siguiente segmento.
  const registrosSegmentos = [];
  for (let i = 0; i < segmentosTexto.length; i++) {
    const texto = segmentosTexto[i];
    // eslint-disable-next-line no-await-in-loop
    const registro = await generarAudio(texto, { etiqueta: `${etiqueta}-${assetId.slice(0, 12)}-seg${i + 1}` });
    registrosSegmentos.push({ index: i + 1, texto, registro });

    if (registro.estado !== 'COMPLETADO') {
      return {
        ...baseAsset,
        outputPath: null,
        format: formato,
        duration: null,
        sampleRate: null,
        channels: null,
        segments: registrosSegmentos.map((s) => ({ index: s.index, text: s.texto, path: s.registro.archivoAudio ?? null, estado: s.registro.estado })),
        status: registro.estado,
      };
    }
  }

  let outputPathWSL;
  let segmentsField = null;
  if (registrosSegmentos.length === 1) {
    outputPathWSL = registrosSegmentos[0].registro.archivoAudio;
  } else {
    const rutas = registrosSegmentos.map((s) => s.registro.archivoAudio);
    outputPathWSL = `${outputDirWSL}/${etiqueta}-${assetId.slice(0, 16)}-final.wav`;
    await concatenarWav(rutas, outputPathWSL);
    segmentsField = registrosSegmentos.map((s) => ({
      index: s.index,
      text: s.texto,
      path: s.registro.archivoAudio,
      duration: s.registro.duracionSegundos ?? null,
      rtf: s.registro.rtf ?? null,
    }));
  }

  const infoWav = leerInfoWav(wslPathToWindowsUNC(outputPathWSL));

  return {
    ...baseAsset,
    outputPath: outputPathWSL,
    format: formato,
    duration: infoWav.duracionSegundos,
    sampleRate: infoWav.sampleRate,
    channels: infoWav.channels,
    segments: segmentsField,
    status: 'COMPLETADO',
  };
}
