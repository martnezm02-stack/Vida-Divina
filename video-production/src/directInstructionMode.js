// directInstructionMode.js — MODO B: instrucción humana -> Production Brief
// estructurado, para producir un video cuando la necesidad NO viene de
// Creative Intelligence (ver arquitectura de esta fase).
//
// REGLA CENTRAL: esto NO es un segundo cerebro de marketing. Interpreta
// SOLO los parámetros de producción que son deterministas y verificables
// por patrón (duración, aspect ratio, si hay subtítulos, si usa la voz
// clonada) — nunca infiere beneficios, propiedades de producto, ni redacta
// voiceoverText/screenText/cta a partir de la prosa libre. Esos tres campos
// son SIEMPRE literales, provistos explícitamente por quien llama — nunca
// generados aquí.
//
// GAP DOCUMENTADO: convertir una instrucción 100% libre ("véndeme algo
// llamativo") en voiceoverText/cta reales requeriría comprensión semántica
// genuina -- un LLM, explícitamente fuera de alcance de esta fase. El
// contrato de salida ya está preparado para recibir esos campos de un LLM
// futuro sin cambiar la forma del objeto; hoy deben llegar ya escritos.

export const DIRECT_INSTRUCTION_MODE = 'DIRECT_INSTRUCTION';

const PATRON_DURACION = /(\d+(?:[.,]\d+)?)\s*(segundos|seg\b|s\b)/i;
const PATRON_VERTICAL = /\b(vertical|9:16|reel|short)\b/i;
const PATRON_HORIZONTAL = /\b(horizontal|16:9|landscape)\b/i;
const PATRON_CUADRADO = /\b(cuadrad[oa]|1:1|square)\b/i;
const PATRON_SUBTITULOS = /\bsubt[ií]tulos?\b/i;
const PATRON_VOZ_OFICIAL = /\b(mi voz|voz oficial|voz clonada|voz real)\b/i;

/**
 * Extrae SOLO los parámetros deterministas de una instrucción en texto
 * libre. Cualquier cosa no reconocida por patrón se ignora (nunca se
 * inventa un valor por defecto silencioso más allá de los defaults
 * documentados abajo).
 */
function extraerParametrosDeterministas(instructionText) {
  const duracionMatch = instructionText.match(PATRON_DURACION);
  let aspectRatio = '9:16'; // default del proyecto (formato Reel/Short) -- no un valor inventado por instrucción, es la convención ya establecida en esta fase.
  if (PATRON_HORIZONTAL.test(instructionText)) aspectRatio = '16:9';
  else if (PATRON_CUADRADO.test(instructionText)) aspectRatio = '1:1';
  else if (PATRON_VERTICAL.test(instructionText)) aspectRatio = '9:16';

  return {
    durationSeconds: duracionMatch ? Number(duracionMatch[1].replace(',', '.')) : null,
    aspectRatio,
    subtitles: PATRON_SUBTITULOS.test(instructionText),
    useOfficialVoice: PATRON_VOZ_OFICIAL.test(instructionText),
  };
}

/**
 * @param {{
 *   instructionText: string,           // instrucción humana en prosa -- solo se parsean los patrones deterministas de arriba
 *   visualAssets: Array<{assetId:string, sourcePath:string}>,  // EXPLÍCITO, nunca inferido de la prosa
 *   voiceoverText: string,             // EXPLÍCITO, literal -- nunca generado aquí
 *   cta: string,                       // EXPLÍCITO, literal
 *   screenText?: string[],             // EXPLÍCITO; si se omite, se deriva de voiceoverText tal cual (nunca reescrito)
 *   durationSeconds?: number,          // si se provee, tiene prioridad sobre lo detectado en instructionText
 * }} args
 * @returns {{mode:'DIRECT_INSTRUCTION', durationSeconds:number, aspectRatio:string, visualAssets:Array, voiceoverText:string, screenText:string[], cta:string, scenes:Array}}
 */
export function directInstructionToProductionBrief({ instructionText, visualAssets, voiceoverText, cta, screenText = null, durationSeconds = null }) {
  if (!instructionText?.trim()) throw new Error('directInstructionToProductionBrief: "instructionText" es obligatorio.');
  if (!Array.isArray(visualAssets) || visualAssets.length === 0) {
    throw new Error('directInstructionToProductionBrief: "visualAssets" es obligatorio y explícito — no se infiere ningún asset de la prosa libre.');
  }
  if (!voiceoverText?.trim()) {
    throw new Error('directInstructionToProductionBrief: "voiceoverText" es obligatorio y literal — este módulo nunca redacta guion.');
  }
  if (!cta?.trim()) {
    throw new Error('directInstructionToProductionBrief: "cta" es obligatorio y literal — este módulo nunca redacta CTA.');
  }

  const params = extraerParametrosDeterministas(instructionText);
  const duracionFinal = durationSeconds ?? params.durationSeconds;
  if (!duracionFinal || duracionFinal <= 0) {
    throw new Error('directInstructionToProductionBrief: no se pudo determinar "durationSeconds" (ni en la instrucción ni explícito) — no se asume un valor por defecto.');
  }

  const screenTextFinal = screenText ?? [voiceoverText];

  const t1 = +(duracionFinal * 0.2).toFixed(2);
  const t2 = +(duracionFinal * 0.8).toFixed(2);
  const scenes = [
    { id: 'scene-1', role: 'hook', start: 0, duration: t1, text: screenTextFinal[0] ?? voiceoverText },
    { id: 'scene-2', role: 'product', start: t1, duration: +(t2 - t1).toFixed(2), visualAssetId: visualAssets[0].assetId },
    { id: 'scene-3', role: 'cta', start: t2, duration: +(duracionFinal - t2).toFixed(2), text: cta },
  ];

  return Object.freeze({
    mode: DIRECT_INSTRUCTION_MODE,
    durationSeconds: duracionFinal,
    aspectRatio: params.aspectRatio,
    subtitles: params.subtitles,
    useOfficialVoice: params.useOfficialVoice,
    visualAssets: Object.freeze([...visualAssets]),
    voiceoverText,
    screenText: Object.freeze([...screenTextFinal]),
    cta,
    scenes: Object.freeze(scenes),
  });
}
