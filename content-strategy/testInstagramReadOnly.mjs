#!/usr/bin/env node
// testInstagramReadOnly.mjs — prueba de solo lectura contra Instagram
// Graph API real. NO publica, NO modifica nada remoto, NO guarda nada en
// PostgreSQL. Requiere content-strategy/.env con credenciales reales
// (INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_IG_USER_ID, INSTAGRAM_GRAPH_API_VERSION)
// — si falta alguna, cada lector falla explícitamente antes de tocar la red.
//
// Uso (desde content-strategy/): node --env-file=.env testInstagramReadOnly.mjs

import { obtenerCuentaInstagram, listarPublicaciones } from './src/instagramAccountReader.js';
import { obtenerMedia } from './src/instagramMediaReader.js';
import { obtenerInsightsDePublicacion } from './src/instagramInsightsReader.js';

const MEDIA_ID_ESPERADO = '17878496934523039';

async function main() {
  console.log('=== 1. Cuenta ===');
  const cuenta = await obtenerCuentaInstagram();
  console.log(JSON.stringify(cuenta, null, 2));

  console.log('\n=== 2. Publicaciones (hasta 25) ===');
  const publicaciones = await listarPublicaciones({ limit: 25 });
  console.log(`Total encontradas: ${publicaciones.length}`);
  const encontrada = publicaciones.find((p) => p.id === MEDIA_ID_ESPERADO);
  console.log(
    encontrada
      ? `Media esperado (${MEDIA_ID_ESPERADO}) SÍ está en la lista.`
      : `Media esperado (${MEDIA_ID_ESPERADO}) NO apareció en los primeros ${publicaciones.length} resultados.`
  );

  console.log('\n=== 3. Detalle del media ===');
  const media = await obtenerMedia(MEDIA_ID_ESPERADO);
  console.log(JSON.stringify(media, null, 2));

  console.log('\n=== 4. Insights ===');
  const insights = await obtenerInsightsDePublicacion(MEDIA_ID_ESPERADO);
  console.log(JSON.stringify(insights, null, 2));

  console.log('\n=== FIN — ninguna credencial fue impresa arriba ===');
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
