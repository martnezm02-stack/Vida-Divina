#!/usr/bin/env node
// upsertProspectCli.js
// Puente CLI para Prospector (Scout -> Apify -> normalización -> dedupe ->
// PostgreSQL). Lee UN objeto JSON por línea desde stdin (un lead
// normalizado), lo persiste vía crm.prospects.upsertProspect (única puerta
// de acceso a PostgreSQL -- ver crm/index.js), y escribe UNA línea JSON de
// resultado por stdin en stdout: {"created": bool, "prospectId": string}
// o {"error": string}.
//
// Por qué CLI y no una API HTTP: crm/ no expone servidor hoy: exponer un
// puente vía proceso de corta duración (leer stdin, una operación,
// terminar) es exactamente el mismo patrón que db/migrate.js -- ningún
// módulo externo importa `pg` directamente ni ve DATABASE_URL (permanece
// dentro de crm/config/env.js -- Decisión Arquitectónica #6). El proceso
// Python de la skill prospector (fuera de este repositorio) invoca este
// script vía subprocess, una línea de entrada = un lead, una línea de
// salida = un resultado -- así reutiliza el mismo pool/config sin
// duplicar la cadena de conexión en Python.
//
// Uso:
//   echo '{"name": "...", "phone": "...", ...}' | node upsertProspectCli.js
//
// Cierra el pool al final (closePool) para que el proceso Node termine
// limpiamente -- mismo criterio que migrate.js.

import { prospects, closePool } from '../index.js';

async function leerStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main() {
  const raw = await leerStdin();
  if (!raw) {
    console.log(JSON.stringify({ error: 'stdin vacío -- se esperaba un objeto JSON con el lead' }));
    process.exitCode = 1;
    return;
  }

  let lead;
  try {
    lead = JSON.parse(raw);
  } catch (error) {
    console.log(JSON.stringify({ error: `JSON inválido en stdin: ${error.message}` }));
    process.exitCode = 1;
    return;
  }

  if (!lead || typeof lead.name !== 'string' || !lead.name.trim()) {
    console.log(JSON.stringify({ error: 'el lead requiere al menos "name" (string no vacío)' }));
    process.exitCode = 1;
    return;
  }

  try {
    const { prospect, created } = await prospects.upsertProspect(lead);
    console.log(JSON.stringify({ created, prospectId: prospect.prospectId }));
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.log(JSON.stringify({ error: `fallo inesperado: ${error.message}` }));
    process.exitCode = 1;
  })
  .finally(() => closePool());
