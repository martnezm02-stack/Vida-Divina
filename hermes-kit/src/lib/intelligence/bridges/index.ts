// index.ts — Bridges de adquisición externa -> contrato estable ->
// SourceAdapter existente. Ningún bridge contiene análisis/interpretación
// (eso vive en MI-3..MI-5); solo transporte + reshaping determinista.
export {
  fetchTikTokViaMonidBridge,
  mapBridgeItemToRawAd,
} from "./tiktokMonidBridge";
export type { TikTokBridgeItem, TikTokMonidBridgeOptions } from "./tiktokMonidBridge";
