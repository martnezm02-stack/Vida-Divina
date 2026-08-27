// referenceIntelligence.js — Adaptar contenido / Video de referencia
// (2026-08-27, Reference Intelligence multimodal). Enriquece el
// ReferenceAnalysis técnico ya existente (referenceVideoAnalyzer.js -- NUNCA
// duplicado aquí: duración/aspectRatio/scenes/keyframes/silences/pacing se
// leen tal cual, nunca se recalculan) con capas semánticas reales:
//
//   1. Transcript real -- SOLO si el video de referencia trae un stream de
//      subtítulos embebido (mov_text/srt/webvtt), extraído con el MISMO
//      ffmpeg ya usado en todo el proyecto. NO hay speech-to-text
//      instalado en este entorno (whisper/whisper.cpp) -- se verificó antes
//      de escribir este archivo (ni el binario ni un paquete npm existen
//      aquí) -- así que sin subtítulos embebidos, transcript queda
//      explícitamente available:false. Nunca se inventa.
//   2. Hook/CTA/problema/estructura narrativa semántica -- heurísticas
//      simples de palabras clave sobre el transcript REAL ya extraído
//      (nunca un LLM: no hay proveedor de LLM configurado en este entorno
//      -- ANTHROPIC_API_KEY ausente, verificado -- y la regla del encargo
//      pide reglas/heurísticas antes que un modelo). Sin transcript real,
//      estos campos quedan available:false.
//   3. OCR/texto en pantalla/estilo de captions/presencia de
//      producto/persona/estilo visual -- requieren reconocimiento visual;
//      no hay OCR (tesseract) ni modelo de visión instalado/configurado en
//      este entorno (se verificó: sin tesseract en PATH, sin
//      ANTHROPIC_API_KEY, Ollama local solo tiene un modelo de texto
//      "llama3", sin capacidad de visión) -- available:false explícito.

import { correr } from '../../video-production/src/hyperframesRenderer.js';
import { join } from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

const NOT_AVAILABLE_NO_SUBTITLES = 'No disponible -- este video de referencia no trae un stream de subtítulos embebido, y no hay un proveedor de transcripción (speech-to-text) instalado en este entorno (sin whisper/whisper.cpp).';
const NOT_AVAILABLE_NO_TRANSCRIPT = 'No disponible -- requiere transcript real (ver "transcript"), que no está disponible para este video.';
const NOT_AVAILABLE_NO_VISION = 'No disponible en este entorno -- requiere reconocimiento visual/OCR que no está instalado ni configurado (sin tesseract, sin proveedor de visión).';

// ---------------------------------------------------------------------
// 1. Transcript real -- SOLO de subtítulos embebidos reales (nunca ASR).
// ---------------------------------------------------------------------

function detectSubtitleStreamIndex(videoPath, { ffprobeBin }) {
  const r = correr(ffprobeBin, ['-v', 'error', '-show_entries', 'stream=index,codec_type', '-of', 'json', videoPath]);
  if (r.status !== 0) return null;
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return null; }
  const sub = (parsed.streams ?? []).find((s) => s.codec_type === 'subtitle');
  return sub ? true : null;
}

/** Parsea un SRT real (formato determinista, sin librería nueva) -- mismo criterio zero-dep del resto del proyecto. */
function parseSrt(srtText) {
  const blocks = srtText.replace(/\r\n/g, '\n').trim().split(/\n\n+/);
  const segments = [];
  const toSeconds = (ts) => {
    const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return null;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
  };
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim());
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
    if (!text) continue;
    segments.push({ text, start: toSeconds(startRaw), end: toSeconds(endRaw) });
  }
  return segments;
}

/**
 * Transcript real, extraído SOLO de un stream de subtítulos embebido real
 * del video de referencia -- nunca de audio (no hay ASR instalado). Devuelve
 * { available:false, reason } si el video no trae subtítulos embebidos.
 */
export function extractEmbeddedTranscript(videoPath, { ffmpegBinDir, tmpDir }) {
  const ffmpegBin = ffmpegBinDir ? join(ffmpegBinDir, 'ffmpeg.exe') : 'ffmpeg';
  const ffprobeBin = ffmpegBinDir ? join(ffmpegBinDir, 'ffprobe.exe') : 'ffprobe';

  if (!detectSubtitleStreamIndex(videoPath, { ffprobeBin })) {
    return { available: false, reason: NOT_AVAILABLE_NO_SUBTITLES };
  }
  const srtPath = join(tmpDir, 'embedded-subtitles.srt');
  const r = correr(ffmpegBin, ['-y', '-i', videoPath, '-map', '0:s:0', srtPath]);
  if (r.status !== 0 || !existsSync(srtPath)) {
    return { available: false, reason: NOT_AVAILABLE_NO_SUBTITLES };
  }
  const segments = parseSrt(readFileSync(srtPath, 'utf8'));
  try { unlinkSync(srtPath); } catch { /* mejor esfuerzo -- no bloquea el análisis si el temp no se puede borrar */ }
  if (segments.length === 0) return { available: false, reason: NOT_AVAILABLE_NO_SUBTITLES };

  return {
    available: true,
    source: 'embedded_subtitles',
    text: segments.map((s) => s.text).join(' '),
    segments,
    confidence: null, // extracción determinista (subtítulos reales del archivo), no una inferencia -- no aplica un score de confianza.
  };
}

// ---------------------------------------------------------------------
// 2. Heurísticas reales sobre el transcript real -- nunca un LLM (no hay
//    proveedor configurado), nunca inventadas sin evidencia textual real.
// ---------------------------------------------------------------------

const HOOK_TYPE_RULES = Object.freeze([
  { type: 'question', test: (t) => /\?/.test(t) },
  { type: 'shock', test: (t) => /\b(nadie te dijo|no vas a creer|esto cambia todo|impactante|nunca imaginaste)\b/i.test(t) },
  { type: 'curiosity', test: (t) => /\b(secreto|nadie habla de|pocos saben|lo que no sabías|descubre)\b/i.test(t) },
  { type: 'problem', test: (t) => /\b(problema|cansad[oa]|te cuesta|difícil|no puedes|sufres)\b/i.test(t) },
  { type: 'promise', test: (t) => /\b(en \d+ días|vas a lograr|te ayuda a|resultado|garantizado)\b/i.test(t) },
  { type: 'story', test: (t) => /\b(hace \d+ (días|meses|años)|cuando yo|me pasó|un día)\b/i.test(t) },
]);

/** Clasifica el hook real por reglas simples sobre el transcript real de los primeros segundos -- nunca sobre el video completo, nunca con un LLM. */
function classifyHook(segments) {
  if (!segments?.length) return { available: false, reason: NOT_AVAILABLE_NO_TRANSCRIPT };
  const primeros = segments.filter((s) => s.start !== null && s.start <= 5);
  const ventana = primeros.length ? primeros : segments.slice(0, 1);
  const texto = ventana.map((s) => s.text).join(' ');
  const match = HOOK_TYPE_RULES.find((rule) => rule.test(texto));
  return {
    available: true,
    text: texto,
    start: ventana[0]?.start ?? 0,
    end: ventana[ventana.length - 1]?.end ?? null,
    type: match?.type ?? 'statement',
    // Heurística de palabras clave real (nunca ML) -- confianza moderada, nunca presentada como certeza.
    confidence: match ? 0.65 : 0.4,
  };
}

const CTA_TYPE_RULES = Object.freeze([
  { type: 'whatsapp', test: (t) => /whatsapp/i.test(t) },
  { type: 'buy_now', test: (t) => /\b(compra ahora|ordena ya|consíguelo|adquiere)\b/i.test(t) },
  { type: 'visit_link', test: (t) => /\b(link en (la )?bio|visita el enlace|entra al link)\b/i.test(t) },
  { type: 'follow', test: (t) => /\b(síguenos|sígueme|follow)\b/i.test(t) },
  { type: 'comment', test: (t) => /\b(comenta|déjanos tu comentario)\b/i.test(t) },
  { type: 'contact', test: (t) => /\b(contáctanos|escríbenos|llámanos)\b/i.test(t) },
  { type: 'learn_more', test: (t) => /\b(conoce más|más información|descubre más)\b/i.test(t) },
]);

/** Detecta el CTA real desde el ÚLTIMO segmento real del transcript -- nunca inventado si no hay una frase de llamado a la acción real y reconocible. */
function classifyCta(segments) {
  if (!segments?.length) return { available: false, reason: NOT_AVAILABLE_NO_TRANSCRIPT };
  const ultimos = segments.slice(-2);
  const texto = ultimos.map((s) => s.text).join(' ');
  const match = CTA_TYPE_RULES.find((rule) => rule.test(texto));
  if (!match) return { available: false, reason: 'No se detectó una frase de llamado a la acción reconocible en el cierre real del video.' };
  return { available: true, text: texto, start: ultimos[0]?.start ?? null, end: ultimos[ultimos.length - 1]?.end ?? null, type: match.type, confidence: 0.6 };
}

const PROBLEM_KEYWORDS = /\b(problema|cansad[oa]|te cuesta|difícil|no puedes|sufres|falta de|necesidad de)\b/i;

/** Detecta un fragmento real del transcript que agita el problema -- nunca inventa uno si no hay evidencia textual real. */
function detectProblem(segments) {
  if (!segments?.length) return { available: false, reason: NOT_AVAILABLE_NO_TRANSCRIPT };
  const found = segments.find((s) => PROBLEM_KEYWORDS.test(s.text));
  if (!found) return { available: false, reason: 'No se detectó un fragmento real que agite un problema explícito en el transcript.' };
  return { available: true, text: found.text, start: found.start, end: found.end, confidence: 0.55 };
}

const PRODUCT_MENTION_KEYWORDS = /\b(producto|fórmula|ingredientes|cápsulas|botella|empaque)\b/i;

/**
 * Enriquece las escenas TÉCNICAS ya existentes (referenceVideoAnalyzer.js)
 * con el fragmento real de transcript que cae dentro de cada rango
 * start/end (por solapamiento real de timestamps) y un "purpose" real
 * (heurística de palabras clave sobre ESE fragmento, nunca sobre el video
 * completo) -- NUNCA duplica start/end/duration/position, que ya vienen del
 * análisis técnico real.
 */
function buildSemanticScenes(technicalScenes, transcriptSegments) {
  return technicalScenes.map((scene) => {
    const overlapping = (transcriptSegments ?? []).filter((seg) => seg.start !== null && seg.start < scene.endSeconds && (seg.end ?? seg.start) > scene.startSeconds);
    const sceneText = overlapping.map((s) => s.text).join(' ');
    let purpose = null;
    if (sceneText) {
      if (scene.position === 'APERTURA' || scene.position === 'ÚNICA') purpose = 'hook';
      else if (scene.position === 'CIERRE') purpose = /\?|whatsapp|comenta|compra|síguenos/i.test(sceneText) ? 'cta' : 'cierre';
      else if (PROBLEM_KEYWORDS.test(sceneText)) purpose = 'problem';
      else if (PRODUCT_MENTION_KEYWORDS.test(sceneText)) purpose = 'product';
      else purpose = 'desarrollo';
    }
    return {
      sceneId: `scene-${scene.sceneIndex + 1}`,
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
      transcript: sceneText || null,
      purpose: purpose ? { available: true, value: purpose, confidence: sceneText ? 0.55 : 0 } : { available: false, reason: NOT_AVAILABLE_NO_TRANSCRIPT },
      onScreenText: { available: false, reason: NOT_AVAILABLE_NO_VISION },
      visualType: { available: false, reason: NOT_AVAILABLE_NO_VISION },
      productPresence: { available: false, reason: NOT_AVAILABLE_NO_VISION },
    };
  });
}

/** Estructura narrativa SEMÁNTICA real (secuencia de purpose reales detectados por escena) -- distinta de technicalAnalysis.narrativeStructure (posicional: APERTURA/DESARROLLO/CIERRE), nunca la reemplaza. available:false si ninguna escena real tiene un purpose detectado. */
function buildSemanticStructure(semanticScenes) {
  const detected = semanticScenes.filter((s) => s.purpose.available).map((s) => s.purpose.value.toUpperCase());
  if (detected.length === 0) return { available: false, reason: NOT_AVAILABLE_NO_TRANSCRIPT };
  return { available: true, sequence: detected, confidence: 0.5 };
}

// ---------------------------------------------------------------------
// Orquestador — Reference Intelligence completo.
// ---------------------------------------------------------------------

/**
 * @param {object} technicalAnalysis — ReferenceAnalysis real ya existente (referenceVideoAnalyzer.js#analyzeReferenceVideo), NUNCA duplicado.
 * @param {string} videoPath — archivo real ya ingerido (mismo que technicalAnalysis).
 * @returns {object} Reference Intelligence real: { technicalAnalysis, transcript, onScreenText, hook, problem, angle, narrativeStructure, cta, visualStyle, captionStyle, people, productPresence, semanticScenes }
 */
export function buildReferenceIntelligence({ technicalAnalysis, videoPath, ffmpegBinDir, tmpDir }) {
  const transcript = extractEmbeddedTranscript(videoPath, { ffmpegBinDir, tmpDir });
  const segments = transcript.available ? transcript.segments : null;

  const hook = classifyHook(segments);
  const cta = classifyCta(segments);
  const problem = detectProblem(segments);
  const semanticScenes = buildSemanticScenes(technicalAnalysis.scenes, segments);
  const narrativeStructure = buildSemanticStructure(semanticScenes);

  return Object.freeze({
    referenceId: technicalAnalysis.referenceId,
    technicalAnalysis,
    transcript,
    // OCR/visión -- ningún proveedor local instalado ni configurado en este entorno (verificado: sin tesseract, sin ANTHROPIC_API_KEY).
    onScreenText: { available: false, reason: NOT_AVAILABLE_NO_VISION },
    hook,
    problem,
    // "angle" (ángulo publicitario) requeriría clasificación semántica más allá de palabras clave simples sobre un fragmento corto -- no se fuerza una heurística débil que lo presente como hecho.
    angle: { available: false, reason: 'No disponible -- requiere clasificación semántica más allá de las heurísticas de palabras clave disponibles en este entorno.' },
    narrativeStructure,
    cta,
    visualStyle: { available: false, reason: NOT_AVAILABLE_NO_VISION },
    captionStyle: { available: false, reason: NOT_AVAILABLE_NO_VISION },
    people: { available: false, reason: NOT_AVAILABLE_NO_VISION },
    productPresence: { available: false, reason: NOT_AVAILABLE_NO_VISION },
    semanticScenes: Object.freeze(semanticScenes),
    analyzedAt: new Date().toISOString(),
  });
}
