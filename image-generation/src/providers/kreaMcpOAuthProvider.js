// kreaMcpOAuthProvider.js — Integración Productiva Krea MCP Directo
// (2026-08-27). Implementación real de OAuthClientProvider (SDK oficial
// de MCP) respaldada por kreaMcpAuthStore.js -- MISMO flujo real ya
// validado en experiments/krea-mcp-node-poc/ (dynamic client registration
// real RFC7591 + PKCE real + Streamable HTTP real), con los DOS fixes
// reales encontrados ahí conservados en el código que la usa
// (kreaMcpClient.js):
//   A. el callback OAuth real solo se cierra con un "code"/"error" real
//      presente, nunca con cualquier ping real a /callback.
//   B. un StreamableHTTPClientTransport real NUNCA se reutiliza tras un
//      primer connect() real fallido -- se crea uno NUEVO para reconectar.
//
// DOS MODOS reales:
//   - interactive:true  -- usado SOLO por scripts/authorize-krea-mcp.mjs
//     (ejecución manual, humana, UNA vez). redirectToAuthorization() real
//     invoca onAuthorizationUrl(url) real para que el script real la
//     muestre y espere el callback real.
//   - interactive:false (default, producción real) -- usado por
//     kreaMcpClient.js en cada generación real. redirectToAuthorization()
//     NUNCA espera interactivamente dentro del proceso real del backend --
//     lanza KreaMcpNonInteractiveAuthRequiredError real de inmediato
//     (Paso 13: "si el token expiró o no puede renovarse: solicitar
//     nuevamente autorización" -- vía el script real, nunca bloqueando un
//     request real del Dashboard).

import { loadKreaMcpAuthState, saveKreaMcpAuthState } from '../kreaMcpAuthStore.js';

export const KREA_MCP_REDIRECT_URL = process.env.KREA_MCP_REDIRECT_URL ?? 'http://127.0.0.1:8787/callback';

export class KreaMcpNonInteractiveAuthRequiredError extends Error {}

/**
 * @param {{interactive?:boolean, onAuthorizationUrl?:(url:URL)=>void}} args
 */
export function createKreaMcpOAuthProvider({ interactive = false, onAuthorizationUrl = null } = {}) {
  // Estado real en memoria, hidratado real desde disco al construir el
  // provider real -- cada llamada real a save*() persiste real e
  // inmediatamente (nunca solo en memoria, a diferencia del POC).
  let state = loadKreaMcpAuthState() ?? {};

  return {
    get redirectUrl() { return KREA_MCP_REDIRECT_URL; },
    get clientMetadata() {
      return {
        client_name: 'Vida Divina — Krea MCP (producción, sin Claude)',
        redirect_uris: [KREA_MCP_REDIRECT_URL],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      };
    },
    clientInformation() { return state.clientInformation; },
    saveClientInformation(info) {
      state = { ...state, clientInformation: info };
      saveKreaMcpAuthState(state);
    },
    tokens() { return state.tokens; },
    saveTokens(tokens) {
      state = { ...state, tokens, obtainedAt: new Date().toISOString() };
      saveKreaMcpAuthState(state);
    },
    redirectToAuthorization(url) {
      if (interactive) {
        if (typeof onAuthorizationUrl !== 'function') {
          throw new Error('createKreaMcpOAuthProvider: interactive:true requiere real "onAuthorizationUrl".');
        }
        onAuthorizationUrl(url);
        return;
      }
      // Producción real: NUNCA se espera interactivamente aquí -- un
      // request real del Dashboard no puede quedar colgado esperando un
      // navegador real. Se reporta como fallo real inmediato, honesto
      // (Paso 15/23 del encargo: nunca se simula disponibilidad real).
      throw new KreaMcpNonInteractiveAuthRequiredError(
        'KreaMcpClient: se requiere re-autorización real de Krea MCP -- ejecuta "node image-generation/scripts/authorize-krea-mcp.mjs" real una vez. Nunca se espera interactivamente dentro del proceso real del backend.',
      );
    },
    saveCodeVerifier(codeVerifier) {
      state = { ...state, codeVerifier };
      saveKreaMcpAuthState(state);
    },
    codeVerifier() { return state.codeVerifier; },
  };
}
