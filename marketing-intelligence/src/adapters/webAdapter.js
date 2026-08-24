// webAdapter.js — Adapter de la fuente Web (Prioridad 3: herramienta especializada).
//
// Fase 4: el adapter ya NO sabe cómo se obtiene el contenido — solo conoce la
// interfaz AcquisitionBackend (src/acquisition/acquisitionBackend.js) y
// normaliza SIEMPRE al mismo contrato (src/contract.js), sin importar qué
// backend respondió. Backend seleccionable vía WEB_BACKEND=jina|agent_reach
// (default: jina). Agent Reach sigue sin instalarse — ver agentReachWebBackend.js.
//
// Marketing Intelligence nunca llama a un backend directamente: solo conoce
// fetchWebPage(url). Cambiar de backend es cambiar una línea aquí, no tocar
// RawStore, IntelligenceStore ni MarketingIntelligenceAgent.

import { createRecord } from '../contract.js';
import { wrapExternalContent } from '../security/untrustedContent.js';
import { JinaDirectBackend } from '../acquisition/web/jinaDirectBackend.js';
import { AgentReachWebBackend } from '../acquisition/web/agentReachWebBackend.js';

const BACKENDS = Object.freeze({
  jina: () => new JinaDirectBackend(),
  agent_reach: () => new AgentReachWebBackend(),
});

function resolveBackend(explicitBackend, backendName) {
  if (explicitBackend) return explicitBackend;
  const name = backendName ?? process.env.WEB_BACKEND ?? 'jina';
  const factory = BACKENDS[name];
  if (!factory) throw new Error(`webAdapter: WEB_BACKEND desconocido: "${name}" (válidos: ${Object.keys(BACKENDS).join(', ')})`);
  return factory();
}

export async function fetchWebPage(url, options = {}) {
  const { backend: explicitBackend, backendName, ...backendOptions } = options;
  const backend = resolveBackend(explicitBackend, backendName);
  const result = await backend.fetch(url, backendOptions);

  if (!result.ok && !result.blocked) {
    return [createRecord({
      source: 'web',
      platform_object_type: 'article',
      url,
      content: '',
      access_method: 'specialized_tool',
      fetch_status: 'error',
      metadata: { platform_specific: { backend: backend.name, http_status: result.httpStatus ?? null } },
    })];
  }

  if (result.blocked) {
    return [createRecord({
      source: 'web',
      platform_object_type: 'article',
      url,
      content: '',
      access_method: 'specialized_tool',
      fetch_status: 'blocked_by_platform',
      metadata: { platform_specific: { backend: backend.name, reason: result.blockReason ?? 'blocked' } },
    })];
  }

  const { content, content_flags } = wrapExternalContent(result.text);
  return [createRecord({
    source: 'web',
    platform_object_type: 'article',
    url,
    title: result.title ?? null,
    content,
    content_flags,
    access_method: 'specialized_tool',
    source_reliability: 'medium',
    fetch_status: 'ok',
    metadata: { platform_specific: { backend: backend.name } },
  })];
}
