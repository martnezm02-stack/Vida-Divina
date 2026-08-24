// untrustedContent.js — Website Intelligence (Fase 8).
//
// Todo HTML/JS/texto/metadata adquirido de un sitio de referencia es UNTRUSTED
// EXTERNAL CONTENT — igual que en marketing-intelligence
// (src/security/untrustedContent.js), pero un sitio web trae riesgos propios
// que un post de texto no trae: script ejecutable, formularios que piden
// credenciales, redirecciones automáticas, iframes. Este módulo únicamente
// ETIQUETA — nunca ejecuta JS, nunca sigue redirecciones, nunca envía datos a
// ningún formulario encontrado en el contenido.
//
// Deliberadamente NO se importa el archivo de marketing-intelligence: mismo
// razonamiento que websitePatternInference.js/Hypothesis.js (Fase 7) —
// duplicación mínima a propósito para mantener los dos módulos
// independientemente reemplazables, en vez de acoplarlos por una utilidad
// pequeña.

const INJECTION_PATTERNS = [
  /ignore (all|any|previous|prior) instructions/i,
  /disregard (the )?(above|previous)/i,
  /reveal (your|the) system prompt/i,
  /you are now/i,
  /new instructions\s*:/i,
  /act as (if|though)/i,
];

const HTML_RISK_PATTERNS = [
  { flag: 'contains_script_tag', pattern: /<script\b/i },
  { flag: 'contains_inline_event_handler', pattern: /\son(click|load|error|mouseover|focus|submit)\s*=/i },
  { flag: 'contains_iframe', pattern: /<iframe\b/i },
  { flag: 'contains_password_field', pattern: /<input[^>]+type=["']?password["']?/i },
  { flag: 'contains_meta_refresh_redirect', pattern: /<meta[^>]+http-equiv=["']?refresh["']?/i },
  { flag: 'contains_javascript_uri', pattern: /javascript\s*:/i },
  { flag: 'contains_form_with_external_action', pattern: /<form[^>]+action=["']https?:\/\//i },
];

export function detectInjectionFlags(text) {
  if (!text) return [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return ['possible_prompt_injection'];
  }
  return [];
}

/**
 * Escanea HTML crudo por patrones de riesgo conocidos. Devuelve todas las
 * banderas que apliquen (no solo la primera) — a diferencia de
 * detectInjectionFlags, aquí un documento puede tener varios riesgos
 * simultáneos y todos son relevantes para la revisión humana.
 */
export function detectHtmlRiskFlags(html) {
  if (!html) return [];
  const flags = [];
  for (const { flag, pattern } of HTML_RISK_PATTERNS) {
    if (pattern.test(html)) flags.push(flag);
  }
  return flags;
}

/**
 * Envuelve HTML/texto crudo adquirido de un sitio externo. Devuelve el mismo
 * contenido (sin modificar, sin sanitizar, sin ejecutar) junto con todas las
 * banderas informativas detectadas — nunca decide una acción a partir de
 * ellas, solo las deja disponibles para revisión humana o del agente.
 */
export function wrapExternalWebsiteContent({ html = null, text = null }) {
  const flags = new Set([
    ...detectInjectionFlags(text),
    ...detectInjectionFlags(html),
    ...detectHtmlRiskFlags(html),
  ]);
  return { html, text, content_flags: [...flags] };
}
