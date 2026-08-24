// redact.js — Última línea de defensa para que una API key nunca aparezca en
// logs, errores o reportes exportados. AnthropicLLMProvider nunca debería
// imprimir this.apiKey directamente en ningún punto, pero un mensaje de error
// devuelto por la API podría, en teoría, hacer eco de un fragmento de la
// petición — esta función se aplica a cualquier texto que vaya a un log o
// excepción.

const SECRET_PATTERNS = [/sk-ant-[A-Za-z0-9_-]+/g, /x-api-key:\s*\S+/gi];

export function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}
