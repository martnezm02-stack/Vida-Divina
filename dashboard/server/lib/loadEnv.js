// loadEnv.js — carga TODAS las variables de integración reales (CRM,
// WhatsApp, Voice Engine, Media Hosting/R2) ANTES de que se evalúe
// cualquier otro import de este servidor.
//
// Por qué existe este archivo separado (bug real encontrado y corregido
// aquí, 2026-09-03): en ESM, TODOS los imports de un módulo se resuelven y
// ejecutan ANTES que cualquier statement del cuerpo de ese módulo -- sin
// importar en qué línea del archivo esté escrito el statement. index.js
// hacía sus llamadas loadIntegrationEnv() como statements normales de su
// propio cuerpo, DESPUÉS de su lista de imports -- pero uno de esos imports
// (schedulerInstance.js, transitivamente desde routes/generation.js)
// construye `mediaHostingService = new MediaHostingService()` en el
// top-level de SU módulo, que es parte de la fase de imports. Resultado
// real: mediaHostingService siempre se construía con process.env.R2_* aún
// sin poblar, sin importar qué hubiera en media-hosting/.env -- ver
// media-hosting/src/r2Config.js#resolveR2Config()/isR2Configured(),
// resuelto UNA sola vez en el constructor (mismo patrón ya documentado en
// dashboard/server/lib/voiceEngineClient.js -- ahí el problema se evitó
// leyendo process.env en cada llamada real, nunca cacheado; mediaHostingService
// no tiene esa protección, y no se toca aquí -- media-hosting/src/ es
// arquitectura ya existente, esto es solo el orden real de carga).
//
// Fix real: este archivo se importa como el PRIMER import de index.js
// (los imports se ejecutan en el orden real en que aparecen, salvo
// dependencias circulares) -- así sus efectos secundarios (poblar
// process.env) ya terminaron antes de que se evalúe cualquier import
// posterior, incluido el que construye mediaHostingService.

import { fileURLToPath } from 'node:url';
import { loadIntegrationEnv } from './integrationEnv.js';

// Solo las claves de integración reales que este servidor consume (ver
// integrationEnv.js) -- nunca el .env completo de otro servicio, para que su
// configuración de infraestructura (ej. su propio PORT) no se propague aquí.
loadIntegrationEnv({
  path: fileURLToPath(new URL('../../../crm/.env', import.meta.url)),
  keys: ['DATABASE_URL', 'CRM_DB_POOL_MAX', 'CRM_DB_SSL', 'CRM_DB_IDLE_TIMEOUT_MS', 'CRM_DB_CONNECTION_TIMEOUT_MS'],
});
loadIntegrationEnv({
  path: fileURLToPath(new URL('../../../whatsapp-adapter/.env', import.meta.url)),
  keys: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_GRAPH_API_VERSION'],
});
loadIntegrationEnv({
  path: fileURLToPath(new URL('../../../voice-engine/.env', import.meta.url)),
  keys: ['VOICE_ENGINE_API_KEY'],
});
// media-hosting/.env (Cloudflare R2, ver media-hosting/src/r2Config.js) --
// TIENE que quedar cargado antes de que se importe schedulerInstance.js en
// cualquier parte del árbol de imports (ver explicación arriba).
loadIntegrationEnv({
  path: fileURLToPath(new URL('../../../media-hosting/.env', import.meta.url)),
  keys: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL'],
});
// content-strategy/.env (Instagram Graph API, ver
// content-strategy/src/instagramConfig.js) -- las 3 claves reales que
// resolveInstagramConfig() lee de process.env. Bug real encontrado
// 2026-09-10: nunca se cargaba, así que MetaAdapter.isConfigured() siempre
// veía accessToken/igUserId undefined y el Home mostraba Instagram como "SIN
// CONFIGURAR" aunque content-strategy/.env sí tiene credenciales reales.
loadIntegrationEnv({
  path: fileURLToPath(new URL('../../../content-strategy/.env', import.meta.url)),
  keys: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_IG_USER_ID', 'INSTAGRAM_GRAPH_API_VERSION'],
});
