// integrationEnv.js — carga SOLO las variables de integración reales que el
// Dashboard consume de otros módulos independientes (CRM, WhatsApp Adapter),
// nunca el archivo .env completo. Motivo real: dashboard/package.json cargaba
// ../crm/.env y ../whatsapp-adapter/.env enteros vía `node --env-file-if-
// exists`, y whatsapp-adapter/.env define su propio PORT (infraestructura de
// SU servidor, nada que ver con el Dashboard) -- como ambos módulos usan el
// mismo nombre de variable, ese PORT contaminaba process.env.PORT del
// Dashboard y hacía que "npm start" levantara en 3000 en vez de 4310. Esta
// función solo copia las claves explícitamente listadas (las que
// dashboard/server realmente lee -- ver WHATSAPP_ACCESS_TOKEN/
// WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_GRAPH_API_VERSION en routes/whatsapp.js y
// whatsapp-adapter/src/graphApiSender.js, DATABASE_URL/CRM_DB_* en
// crm/config/env.js) -- cualquier otra variable de infraestructura ajena
// (PORT, o cualquiera que ese servicio agregue en el futuro) nunca cruza al
// proceso del Dashboard, sin necesidad de conocer de antemano cuáles son.
// Nunca sobreescribe una variable ya presente en process.env (shell/CI tiene
// prioridad siempre).

import { readFileSync, existsSync } from 'node:fs';

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const valores = {};
  for (const linea of readFileSync(path, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || linea.trim().startsWith('#')) continue;
    valores[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return valores;
}

/** @param {{path:string, keys:string[]}} args */
export function loadIntegrationEnv({ path, keys }) {
  const valores = parseEnvFile(path);
  for (const key of keys) {
    if (process.env[key] === undefined && valores[key] !== undefined) {
      process.env[key] = valores[key];
    }
  }
}
