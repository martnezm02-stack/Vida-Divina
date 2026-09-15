// IMPORTANTE: env-loader debe ser el PRIMER import.
// Los ES module imports se hoistean al inicio del archivo, así que cualquier
// import que lea process.env en su top-level necesita que el .env.local
// se haya cargado YA. env-loader.ts es side-effect only y puebla process.env
// antes de que se evalúen el resto de imports.
import "./env-loader";

import pino from "pino";
import { start, watchRestartFlag } from "../src/lib/baileys/client";

const logger = pino({
  level: (process.env.LOG_LEVEL as pino.Level | undefined) ?? "info",
});

// Red de seguridad: un error async no capturado (p.ej. en el intervalo del
// outbox o al recibir un mensaje) NO debe tumbar el bot entero y dejar a todos
// los leads sin respuesta. Se registra y el proceso sigue vivo.
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[bot] promesa rechazada sin capturar (el proceso sigue vivo)");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[bot] excepción no capturada (el proceso sigue vivo)");
});

async function main(): Promise<void> {
  logger.info("[bot] arrancando agente WhatsApp...");

  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === "") {
    logger.error(
      "[bot] OPENROUTER_API_KEY no está configurada. Edita .env.local o ejecuta /setup en Claude Code."
    );
    process.exit(1);
  }

  try {
    await start();
    watchRestartFlag();
    logger.info("[bot] esperando QR scan en el dashboard (localhost:3000)...");
  } catch (err) {
    logger.error({ err }, "[bot] error fatal al arrancar");
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, "[bot] error no capturado");
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("[bot] SIGINT recibido, cerrando...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("[bot] SIGTERM recibido, cerrando...");
  process.exit(0);
});
