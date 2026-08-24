// directInstructionAdapter.js — Parte 4. Adapta un ContentRequest en modo
// DIRECT_INSTRUCTION_MODE hacia un ProductionBrief real, reutilizando
// video-production/src/directInstructionMode.js TAL CUAL (no lo
// reimplementa). Este archivo solo añade lo que directInstructionMode.js
// deliberadamente no hace: aplicar el Brand Visual System y los guards de
// compliance/asset integrity ANTES de que la instrucción llegue al
// renderer -- "DIRECT_INSTRUCTION_MODE no significa sin controles" (Parte 4).

import { directInstructionToProductionBrief, DIRECT_INSTRUCTION_MODE } from '../../video-production/src/directInstructionMode.js';
import { assertNoForbiddenProductClaims } from '../../video-production/src/hyperframesRenderer.js';
import { assertBrandAvoidCompliance } from './brandVisualSystem.js';

export { DIRECT_INSTRUCTION_MODE };

/**
 * @param {{
 *   contentRequest: object, // de contentRequest.js, mode DIRECT_INSTRUCTION_MODE
 *   screenText?: string[],
 * }} args
 * @returns {object} ProductionBrief real (misma forma que directInstructionToProductionBrief), ya validado contra brand + compliance.
 */
export function resolveDirectInstructionForContentRequest({ contentRequest, screenText = null }) {
  if (contentRequest.mode !== 'DIRECT_INSTRUCTION_MODE') {
    throw new Error(`resolveDirectInstructionForContentRequest: el ContentRequest tiene mode "${contentRequest.mode}", no DIRECT_INSTRUCTION_MODE.`);
  }
  const { voiceoverText, cta, visualAssets, durationSeconds } = contentRequest.explicitFields;

  const brief = directInstructionToProductionBrief({
    instructionText: contentRequest.rawText,
    visualAssets,
    voiceoverText,
    cta,
    screenText,
    durationSeconds: durationSeconds ?? contentRequest.durationSeconds,
  });

  // Guards de esta fase -- ningún ProductionBrief de Direct Instruction
  // llega al renderer sin pasar por ellos, exactamente igual que Campaign
  // Mode (Parte 4 y Parte 6).
  const textoCombinado = [brief.voiceoverText, brief.cta, ...brief.screenText].join(' \n ');
  assertNoForbiddenProductClaims(textoCombinado, 'DirectInstructionMode: contenido combinado');
  assertBrandAvoidCompliance(textoCombinado, 'DirectInstructionMode: contenido combinado');

  return brief;
}
