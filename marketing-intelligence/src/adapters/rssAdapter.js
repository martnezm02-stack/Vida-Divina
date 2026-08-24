// rssAdapter.js — Adapter de la fuente RSS/Atom (Prioridad 2: fuente pública directa).
//
// LIMITACIÓN DOCUMENTADA: parser mínimo basado en expresiones regulares, no un
// parser XML completo. Cubre RSS 2.0 (<item>) y Atom (<entry>) en su forma
// estándar. Puede fallar en feeds severamente malformados, con espacios de
// nombre no estándar, o con estructuras anidadas atípicas — en esos casos
// algunos campos quedarán en null en vez de lanzar una excepción.

import { createRecord } from '../contract.js';
import { wrapExternalContent } from '../security/untrustedContent.js';

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html) {
  return decodeEntities(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : null;
}

function extractAtomLink(block) {
  const match = block.match(/<link[^>]*href="([^"]+)"/i);
  return match ? match[1] : null;
}

export async function fetchFeed(feedUrl, { maxItems = 5 } = {}) {
  const response = await fetch(feedUrl);

  if (!response.ok) {
    return [createRecord({
      source: 'rss',
      platform_object_type: 'article',
      url: feedUrl,
      content: '',
      access_method: 'public_web_direct',
      fetch_status: 'error',
      metadata: { platform_specific: { http_status: response.status } },
    })];
  }

  const xml = await response.text();
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  return itemBlocks.slice(0, maxItems).map((block) => {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') || extractAtomLink(block);
    const pubDateRaw = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'dc:date');
    const descriptionRaw = extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content') || '';
    const guid = extractTag(block, 'guid') || link;

    let published_at = null;
    if (pubDateRaw) {
      const parsed = new Date(pubDateRaw);
      if (!Number.isNaN(parsed.getTime())) published_at = parsed.toISOString();
    }

    const { content, content_flags } = wrapExternalContent(stripTags(descriptionRaw));

    return createRecord({
      source: 'rss',
      platform_object_type: 'article',
      url: link || feedUrl,
      title,
      content,
      content_flags,
      published_at,
      access_method: 'public_web_direct',
      source_reliability: 'medium',
      fetch_status: 'ok',
      metadata: { platform_specific: { feed_url: feedUrl, guid } },
    });
  });
}
