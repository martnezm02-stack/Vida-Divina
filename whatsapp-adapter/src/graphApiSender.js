// graphApiSender.js
// Envío real de mensajes hacia WhatsApp Cloud API (Graph API de Meta) —
// Fase 4.4 (texto) + prueba aislada de envío de audio/media. Traduce los
// recursos estructurados de outboundBuilder.js a llamadas POST reales
// contra graph.facebook.com. Nunca inventa contenido: un recurso sin texto
// real utilizable (disponible:false, o tipos que hoy no tienen texto
// documentado como testimonio/imagen_precio/objecion_documentada, ver
// simulator/src/recursosComerciales.js) se omite del envío y se reporta
// como tal — nunca se envía un texto sustituto.
//
// enviarRecursos() solo sabe enviar mensajes de texto (`type: text`) desde
// el flujo comercial automático — eso no cambia aquí. enviarAudio() es una
// función nueva, separada, para el camino mínimo archivo -> upload ->
// media_id -> mensaje de audio; no está conectada a enviarRecursos() ni al
// motor comercial todavía (integración deliberadamente fuera de alcance).
//
// Variables de entorno (ninguna se hardcodea, ninguna vive en el repo):
//   WHATSAPP_ACCESS_TOKEN     — token de acceso de Meta (System User)
//   WHATSAPP_PHONE_NUMBER_ID  — Phone Number ID DESDE el que se envía
//   WHATSAPP_GRAPH_API_VERSION (opcional, por defecto 'v21.0')
//
// Envío deshabilitado por defecto: si WHATSAPP_ACCESS_TOKEN o
// WHATSAPP_PHONE_NUMBER_ID no están definidas, envioHabilitado() devuelve
// false y quien llame a este módulo no debe intentar ninguna petición
// saliente — mismo comportamiento que la fase anterior (envioReal: false).
// enviarAudio() aplica la misma regla de forma independiente (no depende
// de envioHabilitado() para no acoplar los dos caminos, pero comprueba las
// mismas dos variables antes de tocar la red).

import { access, readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const GRAPH_API_VERSION_DEFECTO = 'v21.0';

const MIME_POR_EXTENSION_AUDIO = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.amr': 'audio/amr',
};

// Bloque 3 (Publicación real) — mismo camino mínimo que enviarAudio()
// (archivo local -> upload a Media API -> media_id -> mensaje), extendido a
// imagen/video para poder publicar el Final Asset Package real de
// content-orchestrator (ver content-orchestrator/src/publishing/
// whatsappAdapter.js) como mensaje. No reemplaza ni modifica enviarAudio();
// es la misma mecánica, aditiva, para dos tipos de media más.
const MIME_POR_EXTENSION_IMAGEN = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const MIME_POR_EXTENSION_VIDEO = { '.mp4': 'video/mp4' };

export function envioHabilitado() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Extrae el texto enviable de un recurso estructurado, o null si el
 * recurso no tiene contenido de texto real (nunca fabrica uno).
 */
function textoEnviable(recurso) {
  if (recurso.disponible === false) return null;
  switch (recurso.tipo) {
    case 'texto':
    case 'oferta':
    case 'cierre':
      return typeof recurso.contenido === 'string' && recurso.contenido.length > 0 ? recurso.contenido : null;
    case 'audio':
      // "audio" es el nombre conceptual del recurso de negocio, pero su
      // contenido documentado hoy es texto (ver recursosComerciales.js,
      // obtenerAudioExplicacion().contenido.preguntaFinal) — se envía como
      // mensaje de texto, no se fabrica ni se adjunta ningún archivo.
      return typeof recurso.contenido === 'string' && recurso.contenido.length > 0 ? recurso.contenido : null;
    // 'testimonio', 'imagen_precio', 'objecion_documentada': sin texto real
    // documentado hoy (ver outboundBuilder.js) — se omiten a propósito.
    default:
      return null;
  }
}

// Exportada (Fase 15, Dashboard WhatsApp Console — Respuesta Manual): antes
// era privada, usada solo por enviarRecursos(). Se expone tal cual (mismo
// código, cero cambios de comportamiento) para que dashboard/server/routes/
// whatsapp.js pueda enviar un mensaje de texto suelto (escrito a mano por un
// humano, no un recurso del motor comercial) reutilizando la misma llamada
// real a Graph API -- nunca un segundo cliente de WhatsApp.
export async function enviarTexto({ to, body, phoneNumberId, accessToken, apiVersion, fetchImpl }) {
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const respuesta = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  const cuerpo = await respuesta.json().catch(() => null);
  return { ok: respuesta.status >= 200 && respuesta.status < 300, status: respuesta.status, cuerpo };
}

/**
 * Envía, uno por uno y en orden, todos los recursos con texto real de
 * `resultado` (salida de outboundBuilder.js) al destinatario
 * `resultado.id` (wa_id del cliente). Meta no ofrece un endpoint de
 * ráfaga en un solo POST.
 *
 * No lanza si Meta responde con error o si falla la red: cada recurso se
 * reporta individualmente para que quien llame decida qué hacer (nunca se
 * detiene el resto del envío por un fallo aislado).
 *
 * @param {Object} resultado - { id, recursos, ... } de construirSalida()
 * @param {{ fetchImpl?: typeof fetch }} [opciones] - fetchImpl es
 *   inyectable solo para pruebas; en producción usa el fetch global de Node.
 * @returns {Promise<Array<{ tipo: string, enviado: boolean, motivo?: string, status?: number, texto?: string, messageId?: string|null }>>}
 *   Fase 16 Parte 7 -- se agregan `texto` y `messageId` (wamid real
 *   devuelto por Meta) a cada reporte con `enviado:true`, para que
 *   whatsapp-adapter/src/outboundPersistence.js pueda persistir el
 *   contenido REALMENTE enviado sin volver a derivarlo (nunca se persiste
 *   un texto reconstruido o adivinado).
 */
export async function enviarRecursos(resultado, { fetchImpl = fetch } = {}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || GRAPH_API_VERSION_DEFECTO;

  if (!accessToken || !phoneNumberId) {
    return resultado.recursos.map((r) => ({ tipo: r.tipo, enviado: false, motivo: 'envio_deshabilitado' }));
  }

  const reportes = [];
  for (const recurso of resultado.recursos) {
    const texto = textoEnviable(recurso);
    if (!texto) {
      reportes.push({ tipo: recurso.tipo, enviado: false, motivo: 'sin_contenido_de_texto' });
      continue;
    }
    try {
      const envio = await enviarTexto({
        to: resultado.id,
        body: texto,
        phoneNumberId,
        accessToken,
        apiVersion,
        fetchImpl,
      });
      reportes.push({ tipo: recurso.tipo, enviado: envio.ok, status: envio.status, ...(envio.ok ? { texto, messageId: envio.cuerpo?.messages?.[0]?.id ?? null } : {}) });
      if (!envio.ok) {
        console.error('[whatsapp-adapter] Graph API respondió con error al enviar:', recurso.tipo, envio.status, envio.cuerpo);
      }
    } catch (error) {
      reportes.push({ tipo: recurso.tipo, enviado: false, motivo: 'error_red', detalle: error.message });
      console.error('[whatsapp-adapter] error de red enviando a Graph API:', recurso.tipo, error.message);
    }
  }
  return reportes;
}

/**
 * Extrae únicamente el mensaje de error que Meta ya expone en su propia
 * respuesta JSON — nunca incluye headers, tokens ni el cuerpo crudo de la
 * petición saliente.
 */
function sanitizarError(cuerpo) {
  if (cuerpo && cuerpo.error && typeof cuerpo.error.message === 'string') {
    return cuerpo.error.message;
  }
  return 'error_desconocido (Graph API no devolvió un mensaje de error legible)';
}

/**
 * Sube un archivo local a la Media API de WhatsApp Cloud API
 * (POST /{phoneNumberId}/media, multipart/form-data) y devuelve su
 * media_id. No valida el contenido del archivo más allá de que exista y
 * sea legible — la validación de "es el archivo autorizado para esta
 * prueba" es responsabilidad de quien llama, no de este módulo genérico.
 */
async function subirMediaAudio({ filePath, phoneNumberId, accessToken, apiVersion, fetchImpl }) {
  const buffer = await readFile(filePath);
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_POR_EXTENSION_AUDIO[ext] || 'application/octet-stream';

  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('type', mimeType);
  form.set('file', new Blob([buffer], { type: mimeType }), basename(filePath));

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`;
  const respuesta = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const cuerpo = await respuesta.json().catch(() => null);
  return { ok: respuesta.status >= 200 && respuesta.status < 300, status: respuesta.status, cuerpo };
}

/**
 * Envía un mensaje tipo "audio" ya subido (por media_id) a `to`
 * (POST /{phoneNumberId}/messages).
 */
async function enviarMensajeAudio({ to, mediaId, phoneNumberId, accessToken, apiVersion, fetchImpl }) {
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const respuesta = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { id: mediaId },
    }),
  });

  const cuerpo = await respuesta.json().catch(() => null);
  return { ok: respuesta.status >= 200 && respuesta.status < 300, status: respuesta.status, cuerpo };
}

/**
 * Camino mínimo: archivo local -> upload a Media API -> media_id -> mensaje
 * de audio a `to`. Sin colas, sin reintentos, sin integración con el motor
 * comercial ni con enviarRecursos() — uso deliberadamente aislado para la
 * prueba de envío de audio.
 *
 * No lanza: cualquier fallo (config, archivo, red, Graph API) se devuelve
 * en la respuesta estructurada con `ok:false`, `etapa` indicando dónde
 * falló, y un `error` ya saneado (nunca incluye el access token).
 *
 * @param {string} to - wa_id del destinatario (formato E.164 sin '+', ej. '5212225240044').
 * @param {string} filePath - ruta absoluta local del archivo de audio a enviar.
 * @param {{ fetchImpl?: typeof fetch }} [opciones] - fetchImpl inyectable solo para pruebas.
 * @returns {Promise<{
 *   ok: boolean,
 *   etapa: 'config'|'validacion_archivo'|'upload'|'send'|'completo',
 *   uploadStatus?: number,
 *   mediaId?: string,
 *   sendStatus?: number,
 *   messageId?: string|null,
 *   error?: string,
 * }>}
 */
export async function enviarAudio(to, filePath, { fetchImpl = fetch } = {}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || GRAPH_API_VERSION_DEFECTO;

  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      etapa: 'config',
      error: 'envio_deshabilitado: falta WHATSAPP_ACCESS_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID',
    };
  }

  try {
    await access(filePath);
  } catch {
    return { ok: false, etapa: 'validacion_archivo', error: `archivo no encontrado o no legible: ${filePath}` };
  }

  let subida;
  try {
    subida = await subirMediaAudio({ filePath, phoneNumberId, accessToken, apiVersion, fetchImpl });
  } catch (error) {
    return { ok: false, etapa: 'upload', error: `error_red: ${error.message}` };
  }
  if (!subida.ok || !subida.cuerpo || typeof subida.cuerpo.id !== 'string') {
    console.error('[whatsapp-adapter] Graph API respondió con error al subir media:', subida.status, subida.cuerpo);
    return { ok: false, etapa: 'upload', uploadStatus: subida.status, error: sanitizarError(subida.cuerpo) };
  }
  const mediaId = subida.cuerpo.id;

  let envio;
  try {
    envio = await enviarMensajeAudio({ to, mediaId, phoneNumberId, accessToken, apiVersion, fetchImpl });
  } catch (error) {
    return { ok: false, etapa: 'send', uploadStatus: subida.status, mediaId, error: `error_red: ${error.message}` };
  }
  if (!envio.ok) {
    console.error('[whatsapp-adapter] Graph API respondió con error al enviar el mensaje de audio:', envio.status, envio.cuerpo);
    return {
      ok: false,
      etapa: 'send',
      uploadStatus: subida.status,
      mediaId,
      sendStatus: envio.status,
      error: sanitizarError(envio.cuerpo),
    };
  }

  return {
    ok: true,
    etapa: 'completo',
    uploadStatus: subida.status,
    mediaId,
    sendStatus: envio.status,
    messageId: envio.cuerpo?.messages?.[0]?.id ?? null,
  };
}

const MIME_MAPS = Object.freeze({ image: MIME_POR_EXTENSION_IMAGEN, video: MIME_POR_EXTENSION_VIDEO });

/** Mismo mecanismo real que subirMediaAudio() (POST /{phoneNumberId}/media, multipart/form-data), generalizado a imagen/video -- no se duplica la lógica, solo el mapa MIME cambia según `tipo`. */
async function subirMediaVisual({ filePath, tipo, phoneNumberId, accessToken, apiVersion, fetchImpl }) {
  const buffer = await readFile(filePath);
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_MAPS[tipo][ext] || 'application/octet-stream';

  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('type', mimeType);
  form.set('file', new Blob([buffer], { type: mimeType }), basename(filePath));

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`;
  const respuesta = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const cuerpo = await respuesta.json().catch(() => null);
  return { ok: respuesta.status >= 200 && respuesta.status < 300, status: respuesta.status, cuerpo };
}

/** Envía un mensaje tipo "image" o "video" ya subido (por media_id) a `to`, con caption opcional. Mismo endpoint que enviarMensajeAudio(), solo cambia el tipo/payload. */
async function enviarMensajeVisual({ to, tipo, mediaId, caption, phoneNumberId, accessToken, apiVersion, fetchImpl }) {
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const payload = { messaging_product: 'whatsapp', to, type: tipo, [tipo]: { id: mediaId, ...(caption ? { caption } : {}) } };
  const respuesta = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
  const cuerpo = await respuesta.json().catch(() => null);
  return { ok: respuesta.status >= 200 && respuesta.status < 300, status: respuesta.status, cuerpo };
}

/**
 * Camino mínimo real para publicación (Bloque 3): archivo local (imagen o
 * video ya producido por el Content Generation Engine) -> upload a Media
 * API -> media_id -> mensaje a `to`. Misma forma de resultado que
 * enviarAudio() -- nunca lanza, cada fallo se reporta con `etapa`.
 *
 * @param {string} to - wa_id del destinatario.
 * @param {string} filePath - ruta absoluta local del archivo real a enviar.
 * @param {'image'|'video'} tipo
 * @param {{ caption?: string, fetchImpl?: typeof fetch }} [opciones]
 */
export async function enviarAsset(to, filePath, tipo, { caption = null, fetchImpl = fetch } = {}) {
  if (tipo !== 'image' && tipo !== 'video') {
    return { ok: false, etapa: 'config', error: `tipo inválido "${tipo}" (válidos: image, video)` };
  }
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || GRAPH_API_VERSION_DEFECTO;

  if (!accessToken || !phoneNumberId) {
    return { ok: false, etapa: 'config', error: 'envio_deshabilitado: falta WHATSAPP_ACCESS_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID' };
  }

  try {
    await access(filePath);
  } catch {
    return { ok: false, etapa: 'validacion_archivo', error: `archivo no encontrado o no legible: ${filePath}` };
  }

  let subida;
  try {
    subida = await subirMediaVisual({ filePath, tipo, phoneNumberId, accessToken, apiVersion, fetchImpl });
  } catch (error) {
    return { ok: false, etapa: 'upload', error: `error_red: ${error.message}` };
  }
  if (!subida.ok || !subida.cuerpo || typeof subida.cuerpo.id !== 'string') {
    console.error('[whatsapp-adapter] Graph API respondió con error al subir media:', subida.status, subida.cuerpo);
    return { ok: false, etapa: 'upload', uploadStatus: subida.status, error: sanitizarError(subida.cuerpo) };
  }
  const mediaId = subida.cuerpo.id;

  let envio;
  try {
    envio = await enviarMensajeVisual({ to, tipo, mediaId, caption, phoneNumberId, accessToken, apiVersion, fetchImpl });
  } catch (error) {
    return { ok: false, etapa: 'send', uploadStatus: subida.status, mediaId, error: `error_red: ${error.message}` };
  }
  if (!envio.ok) {
    console.error('[whatsapp-adapter] Graph API respondió con error al enviar el mensaje:', envio.status, envio.cuerpo);
    return { ok: false, etapa: 'send', uploadStatus: subida.status, mediaId, sendStatus: envio.status, error: sanitizarError(envio.cuerpo) };
  }

  return {
    ok: true,
    etapa: 'completo',
    uploadStatus: subida.status,
    mediaId,
    sendStatus: envio.status,
    messageId: envio.cuerpo?.messages?.[0]?.id ?? null,
  };
}
