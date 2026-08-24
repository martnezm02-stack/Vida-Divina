// performanceCollectionService.js — Performance Intelligence, Fase 5.
// Orquesta InstagramPerformanceSource/FacebookPerformanceSource (ambos
// PerformanceSource reales, Fase 1 de esta misma fase) contra
// PerformanceLearningStore (performance-learning-intelligence, Fase 12) SIN
// modificar ninguno de los dos — mismo patrón que publicationService.js
// (content-strategy) orquestando módulos ya existentes por referencia.
//
// WhatsApp queda deliberadamente FUERA de este servicio: es una fuente de
// conversaciones/mensajes/leads, no de publicaciones — mezclarlo aquí
// convertiría métricas de mensajería en métricas de publicación, que es
// exactamente lo que este proyecto prohíbe (ver CLAUDE.md raíz).
//
// Idempotencia: la clave es (content_id, platform, metric, día de
// observed_at) — correr la recolección dos veces el mismo día para el
// mismo contenido nunca duplica una fila en el store append-only.

import { InstagramPerformanceSource, collectPlatformPerformanceObservations } from './instagramPerformanceSource.js';
import { FacebookPerformanceSource, collectFacebookPerformanceObservations } from './facebookPerformanceSource.js';

const PLATFORM_SOURCES = Object.freeze({
  instagram: { SourceClass: InstagramPerformanceSource, collect: collectPlatformPerformanceObservations },
  facebook: { SourceClass: FacebookPerformanceSource, collect: collectFacebookPerformanceObservations },
});

export const COLLECTABLE_PLATFORMS = Object.freeze(Object.keys(PLATFORM_SOURCES));

export function selectPerformanceSource(platform, overrides = {}) {
  const entry = PLATFORM_SOURCES[platform];
  if (!entry) {
    throw new Error(`selectPerformanceSource: platform "${platform}" no soportado por PerformanceCollectionService (válidos: ${COLLECTABLE_PLATFORMS.join(', ')}) — WhatsApp se mantiene como fuente separada, nunca mezclada aquí.`);
  }
  return new entry.SourceClass(overrides);
}

function dayOf(isoString) {
  return typeof isoString === 'string' ? isoString.slice(0, 10) : null;
}

/** §6 idempotencia — ya existe una observación de esta métrica para este contenido, el mismo día. */
function findExistingObservation(store, { content_id, platform, metric, observed_at }) {
  const day = dayOf(observed_at);
  return store.loadAll('performance_observation').find(
    (o) => o.content_id === content_id && o.platform === platform && o.metric === metric && dayOf(o.observed_at) === day
  ) ?? null;
}

/**
 * Recoge y persiste, de forma idempotente, las métricas reales de UN
 * PublishedContent ya existente. Nunca lanza por errores de red/API/
 * credencial — los reporta como resultado estructurado (§ manejo de
 * errores, Fase 5), igual que publishingService.js#publish.
 *
 * @param {{publishedContent:object, store:object, observedAt?:string, overrides?:object}} params
 */
export async function collectPerformanceForPublishedContent({ publishedContent, store, observedAt = new Date().toISOString(), overrides = {} }) {
  if (!publishedContent) throw new Error('collectPerformanceForPublishedContent: "publishedContent" es obligatorio.');
  if (!store) throw new Error('collectPerformanceForPublishedContent: "store" (PerformanceLearningStore) es obligatorio.');
  if (!publishedContent.external_post_id) {
    return { status: 'ERROR', error: 'collectPerformanceForPublishedContent: el PublishedContent no tiene "external_post_id" — no hay attribution posible sin el id real de la plataforma.', saved: [], skipped: [] };
  }

  const entry = PLATFORM_SOURCES[publishedContent.platform];
  if (!entry) {
    return { status: 'UNSUPPORTED_PLATFORM', error: `collectPerformanceForPublishedContent: platform "${publishedContent.platform}" no tiene PerformanceSource conectado (válidos: ${COLLECTABLE_PLATFORMS.join(', ')}).`, saved: [], skipped: [] };
  }

  let source;
  try {
    source = new entry.SourceClass(overrides);
  } catch (err) {
    return { status: 'ERROR', error: `collectPerformanceForPublishedContent: fallo al construir el PerformanceSource — ${err.message}`, saved: [], skipped: [] };
  }

  let observations;
  try {
    observations = await entry.collect({ publishedContent, source, observedAt });
  } catch (err) {
    return { status: 'ERROR', error: err.message, saved: [], skipped: [] };
  }

  const saved = [];
  const skipped = [];
  for (const observation of observations) {
    const existing = findExistingObservation(store, observation);
    if (existing) {
      skipped.push({ metric: observation.metric, reason: 'ALREADY_COLLECTED_TODAY', existing_id: existing.performance_observation_id });
      continue;
    }
    store.save('performance_observation', observation);
    saved.push(observation);
  }

  return { status: 'COLLECTED', saved, skipped };
}

/**
 * §8 preparación para automatización futura — recorre TODOS los
 * PublishedContent con platform+external_post_id reales del store y
 * recolecta performance para cada uno, secuencialmente (mismo criterio que
 * PublishingScheduler#runDuePublications: nunca en paralelo, para no
 * generar una ráfaga de requests concurrentes contra Meta).
 *
 * DELIBERADAMENTE NO conectado todavía al tick de
 * publishing-scheduler/src/publishingScheduler.js ni a ningún cron real —
 * esta fase solo deja la función lista para que un futuro disparador
 * (scheduler existente o uno nuevo) la invoque; conectarla automáticamente
 * generaría recolección periódica no autorizada explícitamente por esta
 * fase (§8 del encargo: "no necesitas implementar todavía el algoritmo de
 * aprendizaje" ni la automatización real).
 */
export async function collectPerformanceForAllPublishedContent({ store, observedAt = new Date().toISOString(), overrides = {} }) {
  const publications = store.loadAll('published_content').filter((p) => p.external_post_id && COLLECTABLE_PLATFORMS.includes(p.platform));
  const results = [];
  for (const publishedContent of publications) {
    const result = await collectPerformanceForPublishedContent({ publishedContent, store, observedAt, overrides });
    results.push({ content_id: publishedContent.content_id, platform: publishedContent.platform, external_post_id: publishedContent.external_post_id, ...result });
  }
  return results;
}
