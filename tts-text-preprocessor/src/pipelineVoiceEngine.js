// pipelineVoiceEngine.js
// Orquesta: TEXTO ORIGINAL -> preprocessor -> validación -> Voice Engine
// (Chatterbox es-MX-LatAm, configuración aprobada) -> AUDIO + auditoría.
//
// NO conecta con WhatsApp. NO decide segmentación de textos largos -- si
// el texto excede el margen de seguridad, se detiene y reporta
// TEXTO_EXCEDE_LIMITE_TTS sin generar nada.
//
// La invocación real al motor (WSL2 + script Python) es inyectable
// (`ejecutarGeneracion`) para poder probar la lógica de las compuertas de
// seguridad sin pagar el costo de una generación real de varios minutos.

import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

import { prepararTextoParaTTS } from './preprocessor.js';
import { excedeLimiteTTS, SEGUNDOS_POR_PALABRA_ESTIMADO } from './estimacionDuracion.js';
import { CONFIGURACION_VOZ_APROBADA } from './configuracionVozAprobada.js';

const SCRIPT_GENERACION = '/home/manuel1974/vida-divina-voice-engine-data/experiments/generate_from_textfile.py';
const DIR_EXPERIMENTS = '/home/manuel1974/vida-divina-voice-engine-data/experiments';
const DIR_TEMP_WSL = '/tmp';

/**
 * Ejecución real: escribe el texto a un archivo temporal en WSL2, invoca
 * el script Python fijo (configuración aprobada, sin parámetros
 * modificables desde aquí) y parsea su resumen JSON.
 */
async function ejecutarGeneracionReal(textoPreparado, nombreSalida) {
  const idTemp = randomUUID();
  const textoTempPath = `${DIR_TEMP_WSL}/pipeline-texto-${idTemp}.txt`;
  const wavOutPath = `${DIR_EXPERIMENTS}/${nombreSalida}`;

  await escribirArchivoWSL(textoTempPath, textoPreparado);

  const resultado = await ejecutarComandoWSL([
    'bash', '-lc',
    `cd /home/manuel1974/vida-divina-voice-engine-data && source venv/bin/activate && python "${SCRIPT_GENERACION}" "${textoTempPath}" "${wavOutPath}"`,
  ]);

  const match = resultado.stdout.match(/---SUMMARY_JSON---\s*([\s\S]*?)\s*DONE_PIPELINE_GENERATION/);
  if (!match) {
    return {
      ok: false,
      error: 'no se encontró el resumen JSON en la salida del script de generación',
      stdout: resultado.stdout,
      stderr: resultado.stderr,
      exitCode: resultado.exitCode,
    };
  }
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    return { ok: false, error: `no se pudo parsear el resumen JSON: ${e.message}`, crudo: match[1] };
  }
}

// Exportadas (antes internas) para que audioAssetAdapter.js reutilice la
// misma invocación de WSL2 en vez de duplicarla al concatenar segmentos con
// ffmpeg — sin cambio de comportamiento.
export function escribirArchivoWSL(rutaWSL, contenido) {
  return new Promise((resolve, reject) => {
    const proc = spawn('wsl', ['-d', 'Ubuntu', '--', 'bash', '-lc', `cat > "${rutaWSL}"`]);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`fallo al escribir texto en WSL (${code}): ${stderr}`))));
    proc.stdin.write(contenido, 'utf8');
    proc.stdin.end();
  });
}

export function ejecutarComandoWSL(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('wsl', ['-d', 'Ubuntu', '--', ...args]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }));
  });
}

/**
 * @param {string} textoOriginal
 * @param {{ etiqueta?: string, ejecutarGeneracion?: Function }} [opciones]
 * @returns {Promise<object>} registro de auditoría completo (campos A-J)
 */
export async function generarAudioDesdeTexto(textoOriginal, { etiqueta = 'pipeline', ejecutarGeneracion = ejecutarGeneracionReal } = {}) {
  const fechaHoraInicio = new Date().toISOString();
  const preprocesado = prepararTextoParaTTS(textoOriginal);

  const auditoriaBase = {
    textoOriginal: preprocesado.textoOriginal, // A
    textoPreparado: preprocesado.textoPreparado, // B
    cambios: preprocesado.cambios, // C
    advertencias: preprocesado.advertencias, // D
    verificacion: preprocesado.verificacion, // E
    parametrosTTS: CONFIGURACION_VOZ_APROBADA, // F, G
    archivoAudio: null, // H
    fechaHoraInicio, // I
    fechaHoraFin: null,
    estado: null, // J
  };

  if (preprocesado.requiereRevision) {
    return { ...auditoriaBase, estado: 'REQUIERE_REVISION', fechaHoraFin: new Date().toISOString() };
  }

  const limite = excedeLimiteTTS(preprocesado.textoPreparado);
  if (limite.excede) {
    return {
      ...auditoriaBase,
      estado: 'TEXTO_EXCEDE_LIMITE_TTS',
      estimacionDuracion: limite,
      motivo: `El texto preparado tiene ${limite.palabras} palabras (~${limite.segundosEstimados}s de audio estimados a ${SEGUNDOS_POR_PALABRA_ESTIMADO}s/palabra), por encima del margen de seguridad de ${limite.margenSeguridadSegundos}s (límite duro del motor: ${limite.limiteDuroSegundos}s / 1000 tokens de habla). La segmentación requiere autorización explícita y no se decide automáticamente.`,
      fechaHoraFin: new Date().toISOString(),
    };
  }

  const nombreSalida = `${etiqueta}-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
  let resultadoGeneracion;
  try {
    resultadoGeneracion = await ejecutarGeneracion(preprocesado.textoPreparado, nombreSalida);
  } catch (error) {
    return { ...auditoriaBase, estado: 'ERROR_GENERACION', error: error.message, fechaHoraFin: new Date().toISOString() };
  }

  if (!resultadoGeneracion || resultadoGeneracion.ok !== true) {
    return {
      ...auditoriaBase,
      estado: 'ERROR_GENERACION',
      error: resultadoGeneracion?.error ?? 'fallo desconocido en la generación',
      detalleGeneracion: resultadoGeneracion,
      fechaHoraFin: new Date().toISOString(),
    };
  }

  return {
    ...auditoriaBase,
    estado: 'COMPLETADO',
    archivoAudio: resultadoGeneracion.out_path,
    duracionSegundos: resultadoGeneracion.duration_s,
    rtf: resultadoGeneracion.rtf,
    generacion: resultadoGeneracion,
    fechaHoraFin: new Date().toISOString(),
  };
}

/**
 * Escribe el registro de auditoría a un archivo JSON, sin incluir nunca
 * secretos/tokens (este pipeline no maneja ninguno).
 */
export async function guardarAuditoria(registro, rutaArchivo) {
  await mkdir(dirname(rutaArchivo), { recursive: true });
  await writeFile(rutaArchivo, JSON.stringify(registro, null, 2), 'utf8');
}
