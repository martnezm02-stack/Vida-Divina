// outputProfiles.js — Output Profiles multiplataforma (Parte 11 + adenda
// "OUTPUT PROFILES MULTIPLATAFORMA"). Cada perfil es una configuración
// reutilizable, no un string: determina resolución, aspect ratio,
// restricciones de duración, safe zones, codec, bitrate, audio, tratamiento
// de captions/CTA y ajustes de exportación -- para que ningún render tenga
// que hardcodear esos valores (ver hallazgo de la auditoría visual: el
// renderer actual ya hardcodea 1080x1920/30fps dentro de
// hyperframesRenderer.js; este módulo es la fuente de verdad de la que
// contentOrchestrator.js debe leer esos valores en vez de repetirlos).
//
// SEPARACIÓN ARQUITECTÓNICA (adenda): Creative Intelligence decide
// audiencia/mensaje/hook/angle/CTA -- este módulo NUNCA decide eso. Solo
// traduce "a qué plataforma/placement va" en parámetros técnicos de
// entrega. El mismo VisualProductionPackage puede adaptarse a varios
// Output Profiles sin volver a ejecutar Creative Intelligence.

export const PLATFORMS = Object.freeze(['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'WHATSAPP', 'GENERIC']);

export const OUTPUT_KINDS = Object.freeze(['VIDEO', 'CAROUSEL']);

function videoProfile({
  platform, placement, aspectRatio, width, height,
  minDurationSeconds, maxDurationSeconds, recommendedDurationSeconds,
  safeZones, videoBitrateBps, captionTreatment, ctaTreatment,
}) {
  return Object.freeze({
    kind: 'VIDEO',
    platform,
    placement,
    aspectRatio,
    width,
    height,
    durationConstraints: Object.freeze({
      minSeconds: minDurationSeconds,
      maxSeconds: maxDurationSeconds,
      recommendedSeconds: recommendedDurationSeconds,
    }),
    safeZones: Object.freeze({ ...safeZones }),
    codec: 'h264',
    videoBitrateBps,
    audio: Object.freeze({
      codec: 'aac',
      sampleRateHz: 48000,
      channels: 2,
      loudnessTargetLufs: -14, // estándar razonable para feeds sociales -- ver auditoría visual (input_i medido -27.25 LUFS, muy por debajo de este objetivo).
    }),
    captionTreatment,
    ctaTreatment,
    exportSettings: Object.freeze({ format: 'mp4', fps: 30 }),
  });
}

// safeZones expresadas como fracción del alto/ancho total reservada para UI
// de la plataforma (nombre de usuario, iconos de interacción, barra de
// progreso de story, etc.) -- basado en guías públicas conocidas de cada
// plataforma, no medido en este proyecto; documentado como tal.
const SAFE_ZONES_REEL_VERTICAL = Object.freeze({ topFraction: 0.12, bottomFraction: 0.20, leftFraction: 0.05, rightFraction: 0.12 });
const SAFE_ZONES_STORY_VERTICAL = Object.freeze({ topFraction: 0.10, bottomFraction: 0.15, leftFraction: 0.05, rightFraction: 0.05 });
const SAFE_ZONES_FEED = Object.freeze({ topFraction: 0.04, bottomFraction: 0.10, leftFraction: 0.04, rightFraction: 0.04 });
const SAFE_ZONES_LANDSCAPE = Object.freeze({ topFraction: 0.05, bottomFraction: 0.10, leftFraction: 0.05, rightFraction: 0.05 });
const SAFE_ZONES_NONE = Object.freeze({ topFraction: 0, bottomFraction: 0, leftFraction: 0, rightFraction: 0 });

const CAPTION_BURNED_IN_BOTTOM = 'BURNED_IN_BOTTOM_THIRD';
const CAPTION_NONE = 'NONE';
const CTA_WHATSAPP_PILL_END_SCREEN = 'WHATSAPP_PILL_END_SCREEN';
const CTA_DESCRIPTION_LINK = 'DESCRIPTION_LINK';
const CTA_NONE = 'NONE';

export const OUTPUT_PROFILES = Object.freeze({
  INSTAGRAM_REEL: videoProfile({
    platform: 'INSTAGRAM', placement: 'REEL', aspectRatio: '9:16', width: 1080, height: 1920,
    minDurationSeconds: 3, maxDurationSeconds: 90, recommendedDurationSeconds: 30,
    safeZones: SAFE_ZONES_REEL_VERTICAL, videoBitrateBps: 3_500_000,
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_WHATSAPP_PILL_END_SCREEN,
  }),
  INSTAGRAM_STORY: videoProfile({
    platform: 'INSTAGRAM', placement: 'STORY', aspectRatio: '9:16', width: 1080, height: 1920,
    minDurationSeconds: 1, maxDurationSeconds: 60, recommendedDurationSeconds: 15,
    safeZones: SAFE_ZONES_STORY_VERTICAL, videoBitrateBps: 3_500_000,
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_WHATSAPP_PILL_END_SCREEN,
  }),
  INSTAGRAM_FEED: videoProfile({
    platform: 'INSTAGRAM', placement: 'FEED', aspectRatio: '4:5', width: 1080, height: 1350,
    minDurationSeconds: 3, maxDurationSeconds: 60, recommendedDurationSeconds: 30,
    safeZones: SAFE_ZONES_FEED, videoBitrateBps: 3_000_000,
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_WHATSAPP_PILL_END_SCREEN,
  }),
  FACEBOOK_REEL: videoProfile({
    platform: 'FACEBOOK', placement: 'REEL', aspectRatio: '9:16', width: 1080, height: 1920,
    minDurationSeconds: 3, maxDurationSeconds: 90, recommendedDurationSeconds: 30,
    safeZones: SAFE_ZONES_REEL_VERTICAL, videoBitrateBps: 3_500_000,
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_WHATSAPP_PILL_END_SCREEN,
  }),
  FACEBOOK_STORY: videoProfile({
    platform: 'FACEBOOK', placement: 'STORY', aspectRatio: '9:16', width: 1080, height: 1920,
    minDurationSeconds: 1, maxDurationSeconds: 60, recommendedDurationSeconds: 15,
    safeZones: SAFE_ZONES_STORY_VERTICAL, videoBitrateBps: 3_500_000,
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_WHATSAPP_PILL_END_SCREEN,
  }),
  FACEBOOK_FEED: videoProfile({
    platform: 'FACEBOOK', placement: 'FEED', aspectRatio: '4:5', width: 1080, height: 1350,
    minDurationSeconds: 3, maxDurationSeconds: 240, recommendedDurationSeconds: 30,
    safeZones: SAFE_ZONES_FEED, videoBitrateBps: 3_000_000,
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_WHATSAPP_PILL_END_SCREEN,
  }),
  YOUTUBE_SHORT: videoProfile({
    platform: 'YOUTUBE', placement: 'SHORT', aspectRatio: '9:16', width: 1080, height: 1920,
    minDurationSeconds: 1, maxDurationSeconds: 60, recommendedDurationSeconds: 30,
    safeZones: SAFE_ZONES_REEL_VERTICAL, videoBitrateBps: 4_000_000,
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_DESCRIPTION_LINK,
  }),
  YOUTUBE_VIDEO: videoProfile({
    platform: 'YOUTUBE', placement: 'VIDEO', aspectRatio: '16:9', width: 1920, height: 1080,
    minDurationSeconds: 5, maxDurationSeconds: null, recommendedDurationSeconds: 60,
    safeZones: SAFE_ZONES_LANDSCAPE, videoBitrateBps: 6_000_000,
    captionTreatment: CAPTION_NONE, ctaTreatment: CTA_DESCRIPTION_LINK,
  }),
  WHATSAPP_VIDEO: videoProfile({
    platform: 'WHATSAPP', placement: 'CHAT_OR_STATUS', aspectRatio: '9:16', width: 1080, height: 1920,
    minDurationSeconds: 1, maxDurationSeconds: 30, recommendedDurationSeconds: 20,
    safeZones: SAFE_ZONES_STORY_VERTICAL, videoBitrateBps: 2_000_000, // menor bitrate: WhatsApp recomprime agresivamente, un archivo más liviano evita compresión adicional destructiva.
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_NONE, // ya está en un chat de WhatsApp -- no hace falta CTA hacia WhatsApp dentro del propio video.
  }),
  GENERIC_VERTICAL: videoProfile({
    platform: 'GENERIC', placement: 'VERTICAL', aspectRatio: '9:16', width: 1080, height: 1920,
    minDurationSeconds: 1, maxDurationSeconds: null, recommendedDurationSeconds: 30,
    safeZones: SAFE_ZONES_NONE, videoBitrateBps: 3_000_000,
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_WHATSAPP_PILL_END_SCREEN,
  }),
  GENERIC_SQUARE: videoProfile({
    platform: 'GENERIC', placement: 'SQUARE', aspectRatio: '1:1', width: 1080, height: 1080,
    minDurationSeconds: 1, maxDurationSeconds: null, recommendedDurationSeconds: 30,
    safeZones: SAFE_ZONES_NONE, videoBitrateBps: 3_000_000,
    captionTreatment: CAPTION_BURNED_IN_BOTTOM, ctaTreatment: CTA_WHATSAPP_PILL_END_SCREEN,
  }),
  GENERIC_LANDSCAPE: videoProfile({
    platform: 'GENERIC', placement: 'LANDSCAPE', aspectRatio: '16:9', width: 1920, height: 1080,
    minDurationSeconds: 1, maxDurationSeconds: null, recommendedDurationSeconds: 30,
    safeZones: SAFE_ZONES_NONE, videoBitrateBps: 4_000_000,
    captionTreatment: CAPTION_NONE, ctaTreatment: CTA_NONE,
  }),
  // CAROUSEL es un OUTPUT_KIND distinto de VIDEO (Parte 12 / adenda) -- no
  // tiene fps/codec/bitrate de video, tiene slideCount/slideOrder. Se deja
  // preparado estructuralmente; la generación real de carousel está fuera
  // de alcance de esta fase (ver limitaciones del reporte final).
  CAROUSEL: Object.freeze({
    kind: 'CAROUSEL',
    platform: 'GENERIC',
    placement: 'FEED_CAROUSEL',
    aspectRatio: '4:5',
    width: 1080,
    height: 1350,
    slideConstraints: Object.freeze({ minSlides: 2, maxSlides: 10, recommendedSlides: 5 }),
    safeZones: SAFE_ZONES_FEED,
    captionTreatment: CAPTION_NONE, // el texto vive por-slide (headline/supportingText), no como caption quemado sobre video.
    ctaTreatment: CTA_WHATSAPP_PILL_END_SCREEN, // tratado en el último slide.
    exportSettings: Object.freeze({ format: 'jpeg', perSlide: true }),
  }),
});

export const OUTPUT_PROFILE_NAMES = Object.freeze(Object.keys(OUTPUT_PROFILES));

export function getOutputProfile(name) {
  const profile = OUTPUT_PROFILES[name];
  if (!profile) {
    throw new Error(`getOutputProfile: perfil desconocido "${name}" (válidos: ${OUTPUT_PROFILE_NAMES.join(', ')}).`);
  }
  return profile;
}

/** Estructura mínima de un slide de CAROUSEL (Parte 12) -- validación de forma, no generación de contenido. */
export function assertValidCarouselSlide(slide, index) {
  if (!slide?.headline?.trim()) throw new Error(`assertValidCarouselSlide: slide[${index}] requiere "headline".`);
  if (!slide?.imageAssetRef?.trim()) throw new Error(`assertValidCarouselSlide: slide[${index}] requiere "imageAssetRef".`);
  return true;
}
