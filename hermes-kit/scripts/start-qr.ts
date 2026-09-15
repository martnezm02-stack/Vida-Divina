// start-qr.ts — Arranque LOCAL de SOLO el cliente Baileys (conexión/QR),
// SIN el guardián de OPENROUTER_API_KEY que exige start-bot.ts.
//
// Por qué existe: start-bot.ts es el arranque REAL del agente completo (bot
// que además responde con IA) y exige OPENROUTER_API_KEY a propósito -- un
// agente sin key no debe arrancar en producción (regla intacta, ver más
// abajo). Pero para validar la integración/arquitectura de conexión WhatsApp
// (generar QR, ver el estado en connection_state, comprobarlo en
// /hermes/api/connection/status) no hace falta ninguna key: QR y LLM son
// pasos completamente independientes del mismo flujo (ver docs/00-arquitectura.md).
//
// Reutiliza EXACTAMENTE start()/watchRestartFlag() de src/lib/baileys/client.ts
// -- cero lógica de Baileys duplicada, mismo auth/ y data/ reales del kit.
// Como nunca se escanea el QR, messages.upsert nunca dispara handleIncomingMessages()
// y por tanto generateReply()/OpenRouter NUNCA se invoca desde este proceso --
// no hace falta neutralizar nada más para que esto sea seguro.
//
// start-bot.ts NO se toca: sigue exigiendo OPENROUTER_API_KEY para el agente
// completo. Este script es EXCLUSIVAMENTE para conexión/QR y validación local.
import "./env-loader";

import pino from "pino";
import { start, watchRestartFlag } from "../src/lib/baileys/client";

const logger = pino({
  level: (process.env.LOG_LEVEL as pino.Level | undefined) ?? "info",
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[qr] promesa rechazada sin capturar (el proceso sigue vivo)");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[qr] excepción no capturada (el proceso sigue vivo)");
});

async function main(): Promise<void> {
  logger.info("[qr] arrancando SOLO conexión WhatsApp (sin IA) -- modo validación local.");
  logger.warn(
    "[qr] este modo es solo para generar/ver el QR y validar la conexión. " +
      "El agente NO responderá mensajes reales (no requiere ni usa OPENROUTER_API_KEY). " +
      "Para el agente completo usa: npm run start:bot"
  );

  try {
    await start();
    watchRestartFlag();
    logger.info("[qr] esperando QR -- consulta /hermes/api/connection/status o abre /hermes en el dashboard.");
  } catch (err) {
    logger.error({ err }, "[qr] error fatal al arrancar");
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, "[qr] error no capturado");
  process.exit(1);
});

process.on("SIGINT", () => {
  logger.info("[qr] SIGINT recibido, cerrando...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("[qr] SIGTERM recibido, cerrando...");
  process.exit(0);
});
