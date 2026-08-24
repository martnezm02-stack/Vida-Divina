// githubAdapter.js — Adapter de la fuente GitHub (Prioridad 1: API oficial).
//
// Fuente ESPECIALIZADA (intelligence_domain: "tech_trends") — nunca fuente
// central de inteligencia publicitaria. Usa la API pública de búsqueda de
// GitHub sin autenticación (límite no autenticado: 10 solicitudes/min), por
// lo que no requiere ningún token en esta fase.

import { createRecord } from '../contract.js';
import { wrapExternalContent } from '../security/untrustedContent.js';

const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories';

export async function searchRepositories(query, { perPage = 5 } = {}) {
  const url = `${GITHUB_SEARCH_URL}?q=${encodeURIComponent(query)}&sort=stars&per_page=${perPage}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'vida-divina-marketing-intelligence' } });

  if (!response.ok) {
    return [createRecord({
      source: 'github',
      intelligence_domain: 'tech_trends',
      platform_object_type: 'repo',
      url,
      content: '',
      access_method: 'official_api',
      fetch_status: 'error',
      metadata: { platform_specific: { http_status: response.status, query } },
    })];
  }

  const json = await response.json();
  return (json.items || []).map((repo) => {
    const { content, content_flags } = wrapExternalContent(repo.description || '');
    return createRecord({
      source: 'github',
      intelligence_domain: 'tech_trends',
      platform_object_type: 'repo',
      url: repo.html_url,
      title: repo.full_name,
      author: repo.owner
        ? { display_name: repo.owner.login, handle: repo.owner.login, public_profile_url: repo.owner.html_url }
        : null,
      published_at: repo.created_at || null,
      content,
      content_flags,
      metrics: { stars: repo.stargazers_count, forks: repo.forks_count },
      access_method: 'official_api',
      source_reliability: 'high',
      fetch_status: 'ok',
      metadata: { platform_specific: { query, language: repo.language } },
    });
  });
}
