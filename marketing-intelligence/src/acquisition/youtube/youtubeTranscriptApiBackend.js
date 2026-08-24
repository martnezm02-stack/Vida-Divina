// youtubeTranscriptApiBackend.js — Backend de adquisición para YouTube vía la
// librería Python `youtube-transcript-api` (Fase 10E).
//
// Auditado en Fases 10B/10C/10D: MIT, sin API key, sin login. Usa la API
// interna "Innertube" con contexto de cliente Android para descubrir pistas
// de subtítulos, y el mismo endpoint público `timedtext` que nuestro backend
// directo para el contenido — comparte la misma limitación de fondo
// (PoTokenRequired) pero en la práctica tuvo éxito en 4/4 videos de la
// muestra controlada donde nuestro backend directo había fallado en el
// primero. Ver informes de Fase 10B-10D para el detalle completo.
//
// Este backend NUNCA importa la librería directamente (es Python, nosotros
// somos Node) — la invoca como SUBPROCESO aislado, con argumentos en LISTA
// (nunca shell=true, nunca una URL cruda como argumento ejecutable — solo el
// video_id ya validado). Implementa AcquisitionBackend exactamente igual que
// YouTubeTranscriptBackend (el backend directo, sin modificar): mismo shape
// de retorno, para que youtubeAdapter.js no necesite saber cuál de los dos
// respondió.
//
// La dependencia Python (`youtube-transcript-api`) NUNCA se instala desde
// aquí. Si el intérprete configurado no la tiene, el script hijo lo reporta
// como error "dependency_missing" y este backend lo traduce a un estado
// controlado — nunca intenta instalarla, nunca cae a cookies/proxy/login.

import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AcquisitionBackend } from '../acquisitionBackend.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCRIPT_PATH = join(__dirname, 'python', 'fetch_transcript_isolated.py');
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// Estados de la librería que representan "YouTube está restringiendo/
// bloqueando el acceso" — se tratan igual que blocked_by_platform en el
// backend directo: nunca disparan un intento automático de evasión (ni aquí
// ni en ninguna capa superior — MarketingIntelligenceAgent no sabe que esto
// existe, solo ve fetch_status="blocked_by_platform").
const BLOCKED_CATEGORIES = new Set(['PoTokenRequired', 'RequestBlocked', 'IpBlocked']);

// Estados que significan "el video es accesible, pero no hay transcript
// disponible en el idioma/config solicitada" — análogo a
// captionTracks.length===0 en el backend directo.
const NO_TRANSCRIPT_CATEGORIES = new Set(['TranscriptsDisabled', 'NoTranscriptFound']);

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1).split('/')[0] || null;
    if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] || null;
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    return null;
  } catch {
    return null;
  }
}

export class YouTubeTranscriptApiBackend extends AcquisitionBackend {
  constructor({
    pythonPath = process.env.YOUTUBE_TRANSCRIPT_API_PYTHON || 'python3',
    scriptPath = DEFAULT_SCRIPT_PATH,
    preferredLanguage = 'en',
    spawnImpl = nodeSpawn,
  } = {}) {
    super();
    this._pythonPath = pythonPath;
    this._scriptPath = scriptPath;
    this._preferredLanguage = preferredLanguage;
    this._spawn = spawnImpl;
  }

  get name() {
    return 'youtube_transcript_api_subprocess';
  }

  get capabilities() {
    return Object.freeze({
      rendersJavaScript: false,
      capturesScreenshots: false,
      capturesInteractions: false,
      respectsViewport: false,
      supportsAuthentication: false,
    });
  }

  async fetch(url, { timeoutMs = 20000 } = {}) {
    const videoId = extractVideoId(url);
    // Defensa en profundidad (igual que el script Python): NUNCA se arma un
    // subproceso a partir de una URL o video_id sin validar primero contra
    // el patrón exacto de YouTube — una URL arbitraria nunca se convierte en
    // argumento ejecutable.
    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
      return { ok: false, blocked: false, error: 'invalid_youtube_url', videoId: null };
    }

    let stdout = '';
    let stderr = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const exitInfo = await new Promise((resolve, reject) => {
        // Argumentos SIEMPRE en lista — nunca una cadena de shell, nunca
        // shell:true. El único dato dinámico es videoId, ya validado arriba.
        const child = this._spawn(
          this._pythonPath,
          [this._scriptPath, videoId, '--lang', this._preferredLanguage],
          { signal: controller.signal, windowsHide: true }
        );

        child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
        child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        child.on('error', reject); // ej. intérprete no encontrado
        child.on('close', (code) => resolve({ code }));
      });

      // Un exit code no-cero no descarta el intento de parsear stdout: el
      // script emite JSON incluso en sus rutas de error controladas (exit 2
      // para dependencia ausente, por ejemplo) — solo se trata como fallo de
      // programación si NO hay JSON válido en absoluto.
      let payload;
      try {
        payload = JSON.parse(stdout.trim().split('\n').pop());
      } catch {
        return {
          ok: false,
          blocked: false,
          error: 'subprocess_output_unparseable',
          videoId,
          // Nunca se expone stderr crudo sin acotar — evita filtrar rutas
          // locales completas u otro detalle interno más allá de lo mínimo
          // necesario para diagnosticar. Nunca hay secretos aquí (no hay
          // credenciales en ningún punto de este flujo), pero se acota igual
          // por disciplina.
          debug_exit_code: exitInfo.code,
          debug_stderr_excerpt: stderr.slice(0, 200),
        };
      }

      return this._mapPayload(payload, videoId);
    } catch (err) {
      // spawn falló antes de producir cualquier salida (ej. intérprete
      // Python inexistente en este entorno) — nunca se intenta instalar
      // nada ni se cae a un mecanismo alternativo automáticamente.
      return { ok: false, blocked: false, error: err.code === 'ENOENT' ? 'python_interpreter_not_found' : err.message, videoId };
    } finally {
      clearTimeout(timer);
    }
  }

  _mapPayload(payload, videoId) {
    if (payload.ok) {
      return {
        ok: true,
        blocked: false,
        videoId,
        metadata: null, // este backend NUNCA obtiene título/canal/views — solo transcript. El adapter ya maneja metadata ausente sin fallar.
        metrics: null,
        transcript: payload.transcript,
        transcriptAvailable: true,
        transcriptType: payload.transcriptType,
        transcriptLanguage: payload.transcriptLanguage,
        // Diagnóstico/trazabilidad únicamente — youtubeAdapter.js no los
        // consume hoy (contract.js no tiene un campo equivalente), pero se
        // preservan aquí en vez de descartarlos silenciosamente.
        segmentCount: payload.segment_count,
        approximateCharCount: payload.approximate_char_count,
        durationApprox: payload.duration_approx,
      };
    }

    const category = payload.error;

    if (category === 'dependency_missing') {
      return { ok: false, blocked: false, error: 'dependency_missing', videoId };
    }
    if (BLOCKED_CATEGORIES.has(category)) {
      return { ok: false, blocked: true, blockReason: category, videoId };
    }
    if (NO_TRANSCRIPT_CATEGORIES.has(category)) {
      return { ok: true, blocked: false, videoId, metadata: null, metrics: null, transcript: null, transcriptAvailable: false, transcriptReason: category };
    }
    // VideoUnavailable / AgeRestricted / VideoUnplayable / invalid_video_id / cualquier otra categoría no mapeada explícitamente.
    return { ok: false, blocked: false, error: category ?? 'unknown', videoId };
  }
}
