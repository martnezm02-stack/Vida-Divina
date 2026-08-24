// instagramConfig.js — Fase 19, §4. Configuración de un futuro
// InstagramPublicationAdapter/InstagramPerformanceSource REALES, SOLO por
// variable de entorno — mismo patrón que anthropicConfig.js
// (marketing-intelligence, Fase 5). Ninguna de estas variables tiene un
// valor real en este repositorio; deben configurarse fuera del código,
// nunca en Git.
//
// Variables de entorno reconocidas:
//   INSTAGRAM_ACCESS_TOKEN     → token de acceso OAuth de Meta (Graph API).
//                                 Si falta, cualquier adapter real que lo
//                                 use debe lanzar un error explícito de
//                                 credencial y NUNCA intentar una llamada de
//                                 red (mismo patrón que AnthropicLLMProvider).
//   INSTAGRAM_IG_USER_ID       → ID de la cuenta profesional de Instagram
//                                 conectada a la Página de Facebook.
//   INSTAGRAM_GRAPH_API_VERSION → versión del Graph API a usar. Default
//                                 "v21.0" — ESTE DEFAULT ES UN PLACEHOLDER
//                                 CONSERVADOR, no una confirmación de la
//                                 versión vigente. La Fase 18 encontró
//                                 "v25.0" como versión aparente en una
//                                 fuente secundaria (no confirmada contra el
//                                 changelog oficial). Antes de cualquier
//                                 llamada real, este valor DEBE
//                                 reconfirmarse contra developers.facebook.com.
//
// Ninguna de estas tres variables tiene un valor configurado en este
// repositorio ni en este entorno de ejecución — su ausencia es el estado
// esperado hasta que exista autorización explícita (Fase 18 §17, Fase 19 §4).

const DEFAULT_API_VERSION = 'v21.0';

export function resolveInstagramConfig(overrides = {}) {
  return {
    accessToken: overrides.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? null,
    igUserId: overrides.igUserId ?? process.env.INSTAGRAM_IG_USER_ID ?? null,
    apiVersion: overrides.apiVersion ?? process.env.INSTAGRAM_GRAPH_API_VERSION ?? DEFAULT_API_VERSION,
  };
}
