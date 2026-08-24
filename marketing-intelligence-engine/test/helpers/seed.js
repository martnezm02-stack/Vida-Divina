// seed.js — helpers de test compartidos. NO es un archivo *.test.js (no lo
// recoge "node --test"), mismo patrón que otros módulos del proyecto.

import { createPublishedContent } from '../../../performance-learning-intelligence/src/publishedContent.js';
import { createPerformanceObservation } from '../../../performance-learning-intelligence/src/performanceObservation.js';
import { createAttributionRecord } from '../../../attribution-engine/src/attributionRecord.js';

export function seedPublication(store, { platform, format = 'image', product_ref = null, likes, comments = 0, shares = 0, saves = 0, views = null, externalPostId = null, publishedAt }) {
  const content = createPublishedContent({
    platform, published_at: publishedAt ?? new Date().toISOString(), content_type: 'social_post',
    format, topic: 'topic', product_ref, external_post_id: externalPostId,
  });
  store.save('published_content', content);
  const observedAt = new Date().toISOString();
  const metricEntries = { likes, comments, shares, saves, ...(views !== null ? { views } : {}) };
  for (const [metric, value] of Object.entries(metricEntries)) {
    store.save('performance_observation', createPerformanceObservation({
      content_id: content.content_id, platform, metric, value, observed_at: observedAt, confidence: 0.9, confidence_basis: 'test', source: 'platform_observed',
    }));
  }
  return content;
}

export function seedAttributionRecord(store, { contentId, platform, attributionType = 'UNKNOWN', confidence = 'UNKNOWN', leadId = null, saleId = null, revenue = null, conversationId = null, explanation = 'test' }) {
  const record = createAttributionRecord({
    contentId, publicationId: contentId, platform, externalPublicationId: 'ext_test',
    conversationId: conversationId ?? (leadId || saleId ? 'conv_test' : null), leadId, saleId, revenue, currency: null,
    attributionType, attributionWindow: '7d', confidence, evidence: {}, explanation,
  });
  store.save('attribution_record', record);
  return record;
}
