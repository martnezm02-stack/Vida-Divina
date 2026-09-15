// telegramClient.ts — Segundo canal administrativo de avisos (FASE
// "Telegram como segundo canal de alerta", 2026-09-11), independiente de
// WhatsApp/Baileys. Llamada HTTP directa al Bot API real de Telegram, sin
// SDK -- no hace falta para un solo método (sendMessage). Solo para el
// ADMINISTRADOR (TELEGRAM_CHAT_ID fijo, nunca un chat de cliente): nunca se
// usa desde ningún flujo de conversación con leads, y nunca depende de
// currentSock ni de ninguna conexión Baileys -- si Baileys/WhatsApp está
// caído, este canal sigue pudiendo avisar igual.
//
// Best-effort puro, igual criterio que watchdog.ts#sendAlert: nunca lanza.
// Un fallo aquí (token inválido, timeout, Telegram caído) nunca debe romper
// el handoff real ni el resto del flujo -- el handoff ya quedó creado en
// crm.handoffs ANTES de que se llame a esto (ver crmClient.ts#handoffToHuman).
//
// No hace ninguna llamada a OpenRouter/LLM: el texto ya viene armado por el
// llamador desde datos reales del handoff/CRM, nunca redactado por un modelo.

import pino from "pino";

const logger = pino({ level: (process.env.LOG_LEVEL as pino.Level | undefined) ?? "info" });

const TELEGRAM_API_TIMEOUT_MS = 8000;

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/**
 * Envía un aviso real al chat administrativo de Telegram (TELEGRAM_CHAT_ID
 * fijo). Devuelve false (nunca lanza) si no está configurado, si hay
 * timeout, o si Telegram responde con error.
 */
export async function sendTelegramAlert(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    logger.warn(`[telegram] (sin TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID) aviso no enviado: ${text.slice(0, 90)}`);
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(`[telegram] Bot API respondió ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }
    logger.info("[telegram] aviso enviado al administrador");
    return true;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[telegram] no se pudo enviar el aviso");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
